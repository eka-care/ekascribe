#!/usr/bin/env bash
#
# Restart ekascribe-api without losing /data/storage.
#
# The storage volume is a plain emptyDir on the node root disk (see
# deploy/k8s/10-api-deployment.yaml -- the Cinder PVC is commented out because
# it is single-attach), so ANY pod replacement wipes the recordings and the
# published varta-app bundle. This script snapshots the volume, restarts the
# deployment, and copies the snapshot back.
#
#   ./deploy/restart.sh                      backup -> rollout restart -> restore
#   ./deploy/restart.sh --context openweb    same, with kubectl pinned to a context
#   ./deploy/restart.sh --backup-only        snapshot only, touch nothing
#   ./deploy/restart.sh --restore <file>     push an existing tarball back into
#                                            the running pod(s), no restart
#
# Same image, same tag -- this only cycles the pods. Use deploy/push.sh
# --update-image when you actually want a new image rolled out.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NAMESPACE="${NAMESPACE:-eka-care}"
DEPLOYMENT="${DEPLOYMENT:-ekascribe-api}"
POD_SELECTOR="${POD_SELECTOR:-app.kubernetes.io/name=ekascribe-api}"
CONTAINER="${CONTAINER:-api}"
STORAGE_PATH="${STORAGE_PATH:-/data/storage}"
# Snapshots live under /tmp so they never touch the repo. Do NOT rely on the OS
# to reap them: macOS ships no /tmp cleaner (its dirhelper only reaps $TMPDIR,
# /var/folders/.../T), and a tmpfs /tmp only clears at reboot. prune_backups()
# below does it explicitly instead, on every run.
#
# These tarballs are voice recordings -- PHI -- so the dir is created 0700
# rather than inheriting /tmp's world-readable 1777.
BACKUP_DIR="${BACKUP_DIR:-/tmp/ekascribe-backups}"
KEEP_DAYS="${KEEP_DAYS:-3}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-10m}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

info() { printf '>> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
usage: ./deploy/restart.sh [--context <name>] [--backup-only | --restore <file>]

  (no flags)        backup /data/storage from a running pod to
                    /tmp/ekascribe-backups/, `kubectl rollout restart` the
                    deployment, wait for it, then restore the snapshot into
                    every new pod. Snapshots older than KEEP_DAYS (3) are
                    deleted at the start of each run -- copy one elsewhere if
                    you need to keep it.
  --backup-only     take the snapshot and stop -- nothing is restarted.
  --restore <file>  skip backup+restart; extract <file> into the pod(s) that
                    are running right now. Use this to recover after a rollout
                    that lost the volume, or to retry a failed restore.
  --context <name>  kubectl context for every cluster call, e.g. openweb.
                    Default: the kubeconfig's current context.

env overrides:
  NAMESPACE=...         default eka-care
  DEPLOYMENT=...        default ekascribe-api
  CONTAINER=...         default api (the pod also has an init container)
  STORAGE_PATH=...      default /data/storage
  BACKUP_DIR=...        default /tmp/ekascribe-backups (0700; PHI)
  KEEP_DAYS=...         default 3 -- snapshots older than this are deleted at
                        the start of every run. 0 disables pruning.
  ROLLOUT_TIMEOUT=...   default 10m
  KUBE_CONTEXT=...      same as --context (the flag wins)
EOF
}

# Every kubectl call goes through this so --context applies uniformly.
kctl() {
  kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"
}

# List available contexts and prompt until a valid one is chosen. Prompts on
# stderr so it works inside $( ); non-interactive runs die with the list.
pick_context() {
  local contexts="$1" choice
  [[ -t 0 ]] || die "not a tty -- pass a valid --context; available:
$contexts"
  printf 'available contexts:\n%s\n' "$contexts" >&2
  while :; do
    printf 'context to use: ' >&2
    IFS= read -r choice || die "no context chosen"
    [[ -z "$choice" ]] && continue
    if printf '%s\n' "$contexts" | grep -qx "$choice"; then
      printf '%s\n' "$choice"
      return 0
    fi
    printf "'%s' is not in the list, try again\n" "$choice" >&2
  done
}

# Resolve the context and prove the cluster is usable before anything runs.
# The probe lists pods in $NAMESPACE -- the one permission every step needs --
# so it catches a down tunnel AND missing RBAC in one shot.
ensure_cluster() {
  command -v kubectl >/dev/null 2>&1 || die "kubectl not found on PATH"

  local contexts
  contexts="$(kubectl config get-contexts -o name 2>/dev/null)"
  [[ -n "$contexts" ]] || die "no contexts in your kubeconfig -- is KUBECONFIG pointing at the right file?"

  if [[ -n "$KUBE_CONTEXT" ]]; then
    if ! printf '%s\n' "$contexts" | grep -qx "$KUBE_CONTEXT"; then
      warn "context '$KUBE_CONTEXT' not found in kubeconfig"
      KUBE_CONTEXT="$(pick_context "$contexts")"
    fi
  elif ! kubectl config current-context >/dev/null 2>&1; then
    warn "no --context given and no current context in kubeconfig"
    KUBE_CONTEXT="$(pick_context "$contexts")"
  fi

  local label="${KUBE_CONTEXT:-$(kubectl config current-context)}"
  info "kubectl context: $label   ns: $NAMESPACE   deploy: $DEPLOYMENT"
  kctl -n "$NAMESPACE" get pods -o name --request-timeout=10s >/dev/null 2>&1 \
    || die "cannot list pods in ns '$NAMESPACE' on context '$label' -- tunnel/Tailscale down, or RBAC?"
}

# Names of the live api pods, one per line (empty if none).
#
# `status.phase=Running` alone is NOT enough: a terminating pod keeps phase
# Running for its whole grace period, and `rollout status` returns as soon as
# the NEW replica is Available -- the old one is usually still shutting down.
# Restoring into it races the kubelet and dies with exit 137 (SIGKILL), so also
# require no deletionTimestamp and a Ready condition of "True".
api_pods() {
  kctl -n "$NAMESPACE" get pod -l "$POD_SELECTOR" \
    --field-selector=status.phase=Running \
    -o go-template='{{range .items}}{{if not .metadata.deletionTimestamp}}{{$n := .metadata.name}}{{range .status.conditions}}{{if and (eq .type "Ready") (eq .status "True")}}{{$n}}{{"\n"}}{{end}}{{end}}{{end}}{{end}}' \
    2>/dev/null || true
}

# The manual command to re-run, printed on every failure path so a dropped
# tunnel never leaves you guessing how to finish by hand.
restore_hint() {
  local pod="${1:-<pod>}"
  printf '  kubectl%s -n %s exec -i %s -c %s -- tar -xzf - -C %s < %s\n' \
    "${KUBE_CONTEXT:+ --context $KUBE_CONTEXT}" "$NAMESPACE" "$pod" \
    "$CONTAINER" "$STORAGE_PATH" "$BACKUP_FILE"
}

# Drop snapshots older than $KEEP_DAYS. Scoped to our own filename pattern
# inside $BACKUP_DIR so a mis-set BACKUP_DIR can't turn this into a wildcard
# delete. Runs before the new backup, so a run always leaves at least this
# run's snapshot behind. KEEP_DAYS=0 disables.
prune_backups() {
  [[ "$KEEP_DAYS" -gt 0 ]] || return 0
  [[ -d "$BACKUP_DIR" ]] || return 0

  local stale
  stale="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'storage-*.tar.gz' -mtime "+$KEEP_DAYS" 2>/dev/null)"
  [[ -n "$stale" ]] || return 0

  info "pruning snapshots older than ${KEEP_DAYS}d:"
  printf '%s\n' "$stale" | while IFS= read -r f; do
    printf '     rm %s (%s)\n' "$f" "$(du -h "$f" | awk '{print $1}')"
  done
  printf '%s\n' "$stale" | xargs rm -f
}

# Snapshot $STORAGE_PATH to a local tarball. Sets BACKUP_FILE.
backup_storage() {
  prune_backups

  local pod
  pod="$(api_pods | head -1)"
  [[ -n "$pod" ]] || die "no running $DEPLOYMENT pod in ns '$NAMESPACE' (is the tunnel up?)"

  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  BACKUP_FILE="${BACKUP_DIR}/storage-$(date +%Y%m%d-%H%M%S)-${pod}.tar.gz"
  # umask the archive too -- /tmp is shared, and the tarball is PHI.
  ( umask 077; : > "$BACKUP_FILE" )

  # One gzipped tar stream over exec -- kubectl cp round-trips per-file and is
  # far slower over the tunnel for many small recordings. -C + '.' keeps the
  # paths relative so the restore lands back at $STORAGE_PATH exactly.
  info "backup ${pod}:${STORAGE_PATH} -> ${BACKUP_FILE}"
  kctl -n "$NAMESPACE" exec "$pod" -c "$CONTAINER" -- tar -czf - -C "$STORAGE_PATH" . > "$BACKUP_FILE" \
    || die "backup failed -- aborting before anything is restarted"

  # A stream truncated by a dropped tunnel can still land as a plausible file;
  # prove the archive is whole before letting the restart destroy the source.
  tar -tzf "$BACKUP_FILE" >/dev/null \
    || die "backup archive is corrupt ($BACKUP_FILE) -- aborting before the restart"

  local files size
  files="$(tar -tzf "$BACKUP_FILE" | wc -l | tr -d ' ')"
  size="$(du -h "$BACKUP_FILE" | awk '{print $1}')"
  info "backup ok ($size, $files entries)"

  # An empty snapshot usually means the volume was ALREADY wiped by an earlier
  # rollout. Restarting on top of that would restore nothing -- say so loudly.
  [[ "$files" -le 1 ]] && warn "snapshot is empty -- ${STORAGE_PATH} had nothing in it"
  return 0
}

restart_deployment() {
  info "rollout restart deploy/$DEPLOYMENT"
  kctl -n "$NAMESPACE" rollout restart "deploy/$DEPLOYMENT"
  info "waiting for rollout (timeout ${ROLLOUT_TIMEOUT})"
  kctl -n "$NAMESPACE" rollout status "deploy/$DEPLOYMENT" --timeout="$ROLLOUT_TIMEOUT" \
    || die "rollout did not complete -- storage NOT restored; backup kept at $BACKUP_FILE
restore by hand once the pod is up:
$(restore_hint)"
}

# Copy the snapshot back into every Running pod -- emptyDir is per-pod, so with
# >1 replica each needs its own copy.
restore_storage() {
  local pods pod count=0
  pods="$(api_pods)"
  [[ -n "$pods" ]] || die "no running $DEPLOYMENT pod -- backup kept at $BACKUP_FILE; restore by hand:
$(restore_hint)"

  # Don't abandon the remaining pods when one fails -- a pod that starts
  # terminating mid-stream kills tar with 137, and the pods that DID need the
  # data still matter. Collect failures, report at the end.
  local failed=()
  while IFS= read -r pod; do
    info "restore ${BACKUP_FILE} -> ${pod}:${STORAGE_PATH}"
    if kctl -n "$NAMESPACE" exec -i "$pod" -c "$CONTAINER" -- tar -xzf - -C "$STORAGE_PATH" < "$BACKUP_FILE"; then
      count=$((count + 1))
    else
      warn "restore to $pod failed (exit 137 = the pod was killed mid-stream, usually one that was already terminating)"
      failed+=("$pod")
    fi
  done <<< "$pods"

  if [[ ${#failed[@]} -gt 0 ]]; then
    [[ "$count" -eq 0 ]] && die "restore failed on every pod -- backup kept at $BACKUP_FILE; retry with:
$(restore_hint "${failed[0]}")"
    warn "restored $count pod(s), failed on: ${failed[*]} -- backup kept at $BACKUP_FILE"
  fi
  info "restored ${STORAGE_PATH} on $count pod(s)"

  # Prove it landed rather than trusting tar's exit code alone.
  pod="$(api_pods | head -1)"
  info "now on ${pod}:${STORAGE_PATH}:"
  kctl -n "$NAMESPACE" exec "$pod" -c "$CONTAINER" -- \
    sh -c "du -sh '$STORAGE_PATH'; ls -la '$STORAGE_PATH'" || true
}

main() {
  local backup_only=false restore_file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)      usage; exit 0 ;;
      --backup-only)  backup_only=true ;;
      --restore)      [[ $# -ge 2 ]] || die "--restore needs a tarball path"
                      restore_file="$2"; shift ;;
      --restore=*)    restore_file="${1#--restore=}" ;;
      --context)      [[ $# -ge 2 ]] || die "--context needs a value, e.g. --context openweb"
                      KUBE_CONTEXT="$2"; shift ;;
      --context=*)    KUBE_CONTEXT="${1#--context=}" ;;
      *)              usage >&2; exit 2 ;;
    esac
    shift
  done

  [[ "$backup_only" == "true" && -n "$restore_file" ]] \
    && die "--backup-only and --restore are mutually exclusive"

  ensure_cluster

  if [[ -n "$restore_file" ]]; then
    [[ -f "$restore_file" ]] || die "no such backup: $restore_file"
    tar -tzf "$restore_file" >/dev/null 2>&1 || die "not a readable gzip tarball: $restore_file"
    BACKUP_FILE="$restore_file"
    restore_storage
    return
  fi

  backup_storage

  if [[ "$backup_only" == "true" ]]; then
    echo
    info "backup only -- nothing restarted"
    info "snapshot: $BACKUP_FILE"
    info "restore it later with: ./deploy/restart.sh${KUBE_CONTEXT:+ --context $KUBE_CONTEXT} --restore '$BACKUP_FILE'"
    return
  fi

  restart_deployment
  restore_storage

  echo
  info "local backup kept at: $BACKUP_FILE"
  info "verify the app, then clean up with: rm '$BACKUP_FILE'"
}

main "$@"
