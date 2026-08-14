#!/usr/bin/env bash
#
# Build and push ekascribe images to Docker Hub, and publish the Vaarta
# desktop app (S3 -> api PVC) served at /static/varta-app/.
#
#   ./deploy/push.sh v1.2.3                build the api image locally -- NO push
#   ./deploy/push.sh v1.2.3 --update-image build + push, backup /data/storage to
#                                          local, roll the deployment to api-v1.2.3,
#                                          restore the backup into the new pod(s),
#                                          then print the backup path to clean up
#   ./deploy/push.sh v1.2.3 --update-image --context openweb
#                                          same, with kubectl pinned to the openweb context
#   ./deploy/push.sh --app-only            no docker; latest S3 release -> PVC + promote
#   ./deploy/push.sh --app-only v1.0.0     same, pinned to one tag (also = rollback)
#   PUSH=true ./deploy/push.sh v1.2.3      push to Docker Hub without touching the cluster
#   LATEST=false ./deploy/push.sh v1.2.3   skip the :api-latest tag
#
# The app tag defaults to the newest version under s3://<bucket>/varta-app/
# <channel>/, so a plain run always converges the cluster on the latest CI
# release. App publish needs aws creds (S3 read) and a kubeconfig that reaches
# the TCL cluster (Fortinet). Already-copied tags are skipped (FORCE=true to
# re-copy); the <channel>/latest symlink is re-pointed every run.
#
# Everything lands in ONE repo with component-prefixed tags, e.g.
#   ekacare/ekascribe:api-1a2b3c4   ekacare/ekascribe:api-latest
# The api image also contains the static web bundle (relative URLs — nothing
# baked in), so there is no separate web image.
#
# The repo is private -- `docker login` first, and the cluster needs a matching
# image pull secret (see deploy/k8s/README.md).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DOCKERHUB_REPO="${DOCKERHUB_REPO:-ekacare/ekascribe}"
# Build-only by default; the registry push happens with --update-image (which
# needs the image pullable before the rollout) or an explicit PUSH=true.
PUSH="${PUSH:-false}"
LATEST="${LATEST:-true}"
PLATFORMS="${PLATFORMS:-linux/amd64}"
BUILDER_NAME="${BUILDER_NAME:-ekascribe-builder}"

# --update-image: /data/storage rides an emptyDir (the Cinder PVC is commented
# out in deploy/k8s/10-api-deployment.yaml -- single-attach, see that file), so
# a rollout destroys it. The flag snapshots it locally first, rolls the
# deployment to the freshly pushed tag, then restores the snapshot.
UPDATE_IMAGE="${UPDATE_IMAGE:-false}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/deploy/backups}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-10m}"

# Vaarta desktop-app publish (S3 -> PVC via kubectl cp)
APP="${APP:-true}"
S3_BUCKET="${S3_BUCKET:-eka-updates}"
CHANNEL="${CHANNEL:-main}"
NAMESPACE="${NAMESPACE:-eka-care}"
# --context <name> / KUBE_CONTEXT: kubectl context for every cluster call
# (backup/restore, set image, app publish). Empty = current context.
KUBE_CONTEXT="${KUBE_CONTEXT:-}"
APP_DEST="/data/storage/varta-app"
FORCE="${FORCE:-false}"

ALL_COMPONENTS=(api)

info() { printf '>> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
usage: ./deploy/push.sh <tag> [--update-image] [--context <name>]
       ./deploy/push.sh --app-only [tag] [--context <name>]

  <tag>           image tag, e.g. v1.2.3 or 1a2b3c4. Builds the api image
                  (API + static web UI): ekacare/ekascribe:api-<tag>.
                  Build only by default -- nothing is pushed or deployed.
  --update-image  full pipeline: build + push, then backup /data/storage from
                  the running pod to deploy/backups/ locally, `kubectl set
                  image` the deployment to api-<tag>, wait for the rollout,
                  restore the backup into the new pod(s), and print the local
                  backup path for cleanup. The backup/restore exists because
                  the storage volume is an emptyDir -- a rollout wipes it.
  --app-only      skip docker entirely; only publish the Vaarta desktop app:
                  s3://<bucket>/varta-app/<channel>/<tag>/ -> api PVC, then
                  re-point <channel>/latest. Without [tag], the newest version
                  in S3 is used (pass an older tag to roll back).
  --context <name>
                  kubectl context for every cluster call (backup, set image,
                  restore, app publish), e.g. --context openweb.
                  Default: the kubeconfig's current context. If the name (or
                  the current context) doesn't exist, the available contexts
                  are listed and you're prompted to pick one; connectivity to
                  the cluster + ns access is verified before anything runs.

env overrides:
  PUSH=true             push to Docker Hub without --update-image (default:
                        build only; --update-image always pushes)
  LATEST=false          don't also tag :api-latest
  PLATFORMS=...         default linux/amd64; a comma-separated list uses buildx
  DOCKERHUB_REPO=...    default ekacare/ekascribe
  APP=false             skip the desktop-app publish after the image push
  APP_TAG=...           pin the desktop-app tag (default: newest in S3)
  S3_BUCKET=...         default eka-updates
  CHANNEL=...           default main
  NAMESPACE=...         default eka-care
  KUBE_CONTEXT=...      same as --context (the flag wins)
  FORCE=true            re-copy even if the tag is already on the PVC
  BACKUP_DIR=...        default deploy/backups (--update-image snapshots)
  ROLLOUT_TIMEOUT=...   default 10m (--update-image rollout wait)
EOF
}

dockerfile_for() {
  case "$1" in
    api)    printf '%s\n' "$REPO_ROOT/deploy/Dockerfile.api" ;;
    *)      return 1 ;;
  esac
}

preflight() {
  command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
  docker info >/dev/null 2>&1 || die "cannot talk to the docker daemon (is it running? are you in the docker group?)"

  # Uses `status --porcelain` rather than `diff --quiet HEAD` on purpose:
  # untracked files are part of the build context too, so an image built with
  # them does not correspond to the bare commit. Gitignored files are excluded,
  # so a local .env does not permanently mark every build dirty. Silent outside
  # a git checkout -- the script still works from a tarball.
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
    warn "working tree is dirty -- '$TAG' will not correspond to a clean commit"
  fi

  if [[ "$PUSH" == "true" ]]; then
    local cfg="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
    # Credential helpers leave "auths" empty, so a miss here is not proof of
    # anything -- warn rather than fail, and let the push report the truth.
    if ! grep -qs 'index\.docker\.io' "$cfg"; then
      warn "no Docker Hub credentials found in $cfg -- run 'docker login' if the push fails"
    fi
  fi
}

ensure_builder() {
  if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    info "creating buildx builder '$BUILDER_NAME' (docker-container driver, needed for multi-arch)"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap >/dev/null
  fi
}

build_component() {
  local component="$1" dockerfile
  dockerfile="$(dockerfile_for "$component")" || die "unknown component '$component' (want: ${ALL_COMPONENTS[*]})"
  [[ -f "$dockerfile" ]] || die "missing $dockerfile"

  local tags=("${DOCKERHUB_REPO}:${component}-${TAG}")
  [[ "$LATEST" == "true" ]] && tags+=("${DOCKERHUB_REPO}:${component}-latest")

  local tag_args=() t
  for t in "${tags[@]}"; do tag_args+=(-t "$t"); done

  # Expanded below as ${build_args[@]+"${build_args[@]}"}: bash 3.2 (what macOS
  # ships) treats "${empty[@]}" as unbound under `set -u`, and api passes no
  # build args.
  local build_args=()

  if [[ "$PLATFORMS" == *,* ]]; then
    # Multi-arch images can't be loaded into the local daemon -- buildx pushes
    # the manifest list directly.
    [[ "$PUSH" == "true" ]] || die "multi-platform builds cannot be built locally without pushing; set PUSH=true or use a single PLATFORMS value"
    ensure_builder
    info "buildx $component [$PLATFORMS] -> ${tags[*]}"
    docker buildx build --builder "$BUILDER_NAME" --platform "$PLATFORMS" \
      -f "$dockerfile" ${build_args[@]+"${build_args[@]}"} "${tag_args[@]}" --push "$REPO_ROOT"
  else
    info "build $component [$PLATFORMS]"
    docker build --platform "$PLATFORMS" \
      -f "$dockerfile" ${build_args[@]+"${build_args[@]}"} "${tag_args[@]}" "$REPO_ROOT"
    if [[ "$PUSH" == "true" ]]; then
      for t in "${tags[@]}"; do
        info "push $t"
        docker push "$t"
      done
    fi
  fi

  PUSHED_TAGS+=("${tags[@]}")
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

# Resolve the kubectl context and prove the cluster is usable, once per run.
# --context wins; otherwise the kubeconfig's current context. An unknown
# context (or no current one) lists what exists and prompts for a choice.
# The probe lists pods in $NAMESPACE -- the one permission every flow here
# needs -- so it catches a down tunnel AND missing RBAC in one shot.
CLUSTER_CHECKED=false
ensure_cluster() {
  [[ "$CLUSTER_CHECKED" == "true" ]] && return 0
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
  info "kubectl context: $label"
  kctl -n "$NAMESPACE" get pods -o name --request-timeout=10s >/dev/null 2>&1 \
    || die "cannot list pods in ns '$NAMESPACE' on context '$label' -- tunnel/Tailscale down, or RBAC?"
  info "cluster reachable, ns '$NAMESPACE' accessible"
  CLUSTER_CHECKED=true
}

# Names of the Running api pods, one per line (empty if none / no cluster).
api_pods() {
  kctl -n "$NAMESPACE" get pod -l app.kubernetes.io/name=ekascribe-api \
    --field-selector=status.phase=Running \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null || true
}

# Snapshot /data/storage to a local tarball before the rollout destroys the
# emptyDir. Sets BACKUP_FILE for update_image/restore_storage.
backup_storage() {
  local pod
  pod="$(api_pods | head -1)"
  [[ -n "$pod" ]] || die "no running ekascribe-api pod in ns '$NAMESPACE' (is the Fortinet tunnel up?)"

  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="${BACKUP_DIR}/storage-$(date +%Y%m%d-%H%M%S)-${pod}.tar.gz"

  # One gzipped tar stream over exec -- kubectl cp round-trips per-file and is
  # far slower over the tunnel for many small recordings.
  info "backup ${pod}:/data/storage -> ${BACKUP_FILE}"
  kctl -n "$NAMESPACE" exec "$pod" -- tar -czf - -C /data/storage . > "$BACKUP_FILE" \
    || die "backup failed -- aborting before the rollout touches the pod"

  # A stream truncated by a dropped tunnel can still land as a plausible file;
  # prove the archive is whole before letting the rollout destroy the source.
  tar -tzf "$BACKUP_FILE" >/dev/null \
    || die "backup archive is corrupt ($BACKUP_FILE) -- aborting before the rollout"
  info "backup ok ($(du -h "$BACKUP_FILE" | awk '{print $1}'))"
}

update_image() {
  local image="${DOCKERHUB_REPO}:api-${TAG}"
  info "set image deploy/ekascribe-api api=${image}"
  kctl -n "$NAMESPACE" set image deploy/ekascribe-api "api=${image}"
  info "waiting for rollout (timeout ${ROLLOUT_TIMEOUT})"
  kctl -n "$NAMESPACE" rollout status deploy/ekascribe-api --timeout="$ROLLOUT_TIMEOUT" \
    || die "rollout did not complete -- storage NOT restored; backup kept at $BACKUP_FILE"
}

# Copy the snapshot back into every Running pod -- emptyDir is per-pod, so
# with >1 replica each needs its own copy.
restore_storage() {
  local pods pod count=0
  local kh="kubectl${KUBE_CONTEXT:+ --context $KUBE_CONTEXT}"
  pods="$(api_pods)"
  [[ -n "$pods" ]] || die "no running api pod after rollout -- backup kept at $BACKUP_FILE; restore by hand:
  $kh -n $NAMESPACE exec -i <pod> -- tar -xzf - -C /data/storage < $BACKUP_FILE"

  while IFS= read -r pod; do
    info "restore ${BACKUP_FILE} -> ${pod}:/data/storage"
    kctl -n "$NAMESPACE" exec -i "$pod" -- tar -xzf - -C /data/storage < "$BACKUP_FILE" \
      || die "restore to $pod failed -- backup kept at $BACKUP_FILE; retry with:
  $kh -n $NAMESPACE exec -i $pod -- tar -xzf - -C /data/storage < $BACKUP_FILE"
    count=$((count + 1))
  done <<< "$pods"
  info "restored /data/storage on $count pod(s)"
}

# Publish the Vaarta desktop app: S3 tag dir -> PVC, then promote latest.
# $1 = "die" | "warn": what to do when the S3 tag dir is empty (die for
# --app-only, warn for the after-image-push run where APP_TAG may not exist).
publish_app() {
  local on_missing="$1"

  command -v aws >/dev/null 2>&1 || die "aws cli not found on PATH"
  ensure_cluster

  local base="s3://${S3_BUCKET}/varta-app/${CHANNEL}"
  if [[ -z "${APP_TAG:-}" ]]; then
    APP_TAG="$(aws s3 ls "${base}/" 2>/dev/null \
      | awk '$1 == "PRE" {sub("/", "", $2); print $2}' | sort -V | tail -1)"
    if [[ -z "$APP_TAG" ]]; then
      if [[ "$on_missing" == "warn" ]]; then
        warn "no app releases under ${base}/ -- skipping app publish (APP=false to silence)"
        return 0
      fi
      die "no app releases under ${base}/ -- has CI uploaded any tag yet?"
    fi
    info "newest app release in S3: ${APP_TAG}"
  fi

  local s3_src="${base}/${APP_TAG}/"
  local dest="${APP_DEST}/${CHANNEL}/${APP_TAG}"

  local pod
  pod="$(api_pods | head -1)"
  [[ -n "$pod" ]] || die "no running ekascribe-api pod in ns '$NAMESPACE' (is the Fortinet tunnel up?)"

  if [[ "$FORCE" != "true" ]] && kctl -n "$NAMESPACE" exec "$pod" -- test -d "$dest" >/dev/null 2>&1; then
    info "app ${CHANNEL}/${APP_TAG} already on the PVC -- skipping copy (FORCE=true to re-copy)"
  else
    if ! aws s3 ls "$s3_src" 2>/dev/null | grep -q .; then
      if [[ "$on_missing" == "warn" ]]; then
        warn "nothing at $s3_src -- skipping app publish (set APP_TAG=<tag> or APP=false to silence)"
        return 0
      fi
      die "nothing at $s3_src -- did CI upload this tag?"
    fi

    local stage
    stage="$(mktemp -d)/${APP_TAG}"
    info "sync $s3_src -> $stage"
    aws s3 sync "$s3_src" "$stage" --only-show-errors

    # Stage under .partial and swap in, so an interrupted kubectl cp (~600MB
    # over the tunnel) never leaves a half-copied dir that later runs skip.
    info "copy -> $pod:$dest (shared PVC; takes a while over the tunnel)"
    kctl -n "$NAMESPACE" exec "$pod" -- sh -c "rm -rf '${dest}.partial' && mkdir -p '${APP_DEST}/${CHANNEL}'"
    kctl -n "$NAMESPACE" cp "$stage" "${pod}:${dest}.partial"
    kctl -n "$NAMESPACE" exec "$pod" -- sh -c "rm -rf '$dest' && mv '${dest}.partial' '$dest'"
  fi

  info "promote ${CHANNEL}/latest -> ${APP_TAG}"
  kctl -n "$NAMESPACE" exec "$pod" -- ln -sfn "$APP_TAG" "${APP_DEST}/${CHANNEL}/latest"

  echo
  info "verify:"
  printf '     curl -sI https://vaarta.bharatai.gov.in/static/varta-app/%s/latest/latest.yml\n' "$CHANNEL"
}

main() {
  local parsed=() app_only=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)      usage; exit 0 ;;
      --app-only)     app_only=true ;;
      --update-image) UPDATE_IMAGE=true ;;
      --context)      [[ $# -ge 2 ]] || die "--context needs a value, e.g. --context openweb"
                      KUBE_CONTEXT="$2"; shift ;;
      --context=*)    KUBE_CONTEXT="${1#--context=}" ;;
      -*)             usage >&2; exit 2 ;;
      *)              parsed+=("$1") ;;
    esac
    shift
  done
  set -- ${parsed[@]+"${parsed[@]}"}

  if [[ "$app_only" == "true" ]]; then
    # --app-only never builds, so there is no fresh image to roll out.
    [[ "$UPDATE_IMAGE" == "true" ]] && die "--app-only and --update-image are mutually exclusive"
    if [[ $# -gt 1 ]]; then
      usage >&2
      exit 2
    fi
    [[ $# -eq 1 ]] && APP_TAG="$1"
    publish_app die
    return
  fi

  if [[ $# -ne 1 ]]; then
    usage >&2
    exit 2
  fi

  TAG="$1"

  # The rollout pulls api-<tag> from the registry, so the push is not optional
  # here -- it overrides both the build-only default and an explicit PUSH=false.
  [[ "$UPDATE_IMAGE" == "true" ]] && PUSH=true

  # The old form selected components positionally. A bare `./push.sh api` is
  # now indistinguishable from a tag named "api" -- reject it rather than
  # publish ekacare/ekascribe:api-api off stale muscle memory.
  local c
  for c in "${ALL_COMPONENTS[@]}"; do
    if [[ "$TAG" == "$c" ]]; then
      die "'$TAG' is a component name, not a tag -- both components are always built now; try: ./deploy/push.sh v1.2.3"
    fi
  done

  # Docker's own tag grammar. Checking here beats discovering it after a full
  # build, when the push is the thing that fails.
  [[ "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$ ]] \
    || die "'$TAG' is not a valid docker tag (start alnum/_, then alnum . _ -, max 128 chars)"

  PUSHED_TAGS=()

  preflight
  # Resolve the context and prove the cluster is usable BEFORE the slow
  # build/push, not 10 minutes into it.
  [[ "$UPDATE_IMAGE" == "true" ]] && ensure_cluster

  info "repo: $DOCKERHUB_REPO   tag: $TAG   components: ${ALL_COMPONENTS[*]}"
  [[ "$PUSH" == "true" ]] || info "build only (default) -- use --update-image to deploy, or PUSH=true to just push"

  for c in "${ALL_COMPONENTS[@]}"; do
    build_component "$c"
  done

  echo
  info "$([[ "$PUSH" == "true" ]] && echo pushed || echo built):"
  local t
  for t in "${PUSHED_TAGS[@]}"; do printf '     %s\n' "$t"; done

  if [[ "$UPDATE_IMAGE" == "true" ]]; then
    # Backup as late as possible (after the slow build/push) so recordings
    # written in the meantime still make the snapshot.
    echo
    backup_storage
    update_image
    restore_storage
    echo
    info "local backup kept at: $BACKUP_FILE"
    info "verify the app, then clean up with: rm '$BACKUP_FILE'"
  elif [[ "$PUSH" == "true" ]]; then
    echo
    info "roll out the immutable tags with:"
    for c in "${ALL_COMPONENTS[@]}"; do
      printf '     kubectl%s -n %s set image deploy/ekascribe-%s %s=%s:%s-%s\n' \
        "${KUBE_CONTEXT:+ --context $KUBE_CONTEXT}" "$NAMESPACE" \
        "$c" "$c" "$DOCKERHUB_REPO" "$c" "$TAG"
    done
  fi

  if [[ "$APP" == "true" ]]; then
    echo
    publish_app warn
  fi
}

main "$@"
