#!/usr/bin/env bash
#
# Build and push ekascribe images to Docker Hub.
#
#   ./deploy/push.sh v1.2.3                build + push the api image (API + web UI)
#   PUSH=false ./deploy/push.sh v1.2.3     build locally, don't push
#   LATEST=false ./deploy/push.sh v1.2.3   skip the :api-latest tag
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
PUSH="${PUSH:-true}"
LATEST="${LATEST:-true}"
PLATFORMS="${PLATFORMS:-linux/amd64}"
BUILDER_NAME="${BUILDER_NAME:-ekascribe-builder}"

ALL_COMPONENTS=(api)

info() { printf '>> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
usage: ./deploy/push.sh <tag>

  <tag>   image tag, e.g. v1.2.3 or 1a2b3c4. Builds the api image
          (API + static web UI): ekacare/ekascribe:api-<tag>

env overrides:
  PUSH=false            build only, don't push
  LATEST=false          don't also tag :api-latest
  PLATFORMS=...         default linux/amd64; a comma-separated list uses buildx
  DOCKERHUB_REPO=...    default ekacare/ekascribe
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

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  if [[ $# -ne 1 ]]; then
    usage >&2
    exit 2
  fi

  TAG="$1"

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

  info "repo: $DOCKERHUB_REPO   tag: $TAG   components: ${ALL_COMPONENTS[*]}"
  [[ "$PUSH" == "true" ]] || info "PUSH=false -- building only, nothing will be pushed"

  for c in "${ALL_COMPONENTS[@]}"; do
    build_component "$c"
  done

  echo
  info "$([[ "$PUSH" == "true" ]] && echo pushed || echo built):"
  local t
  for t in "${PUSHED_TAGS[@]}"; do printf '     %s\n' "$t"; done

  if [[ "$PUSH" == "true" ]]; then
    echo
    info "roll out the immutable tags with:"
    for c in "${ALL_COMPONENTS[@]}"; do
      printf '     kubectl -n eka-care set image deploy/ekascribe-%s %s=%s:%s-%s\n' \
        "$c" "$c" "$DOCKERHUB_REPO" "$c" "$TAG"
    done
  fi
}

main "$@"
