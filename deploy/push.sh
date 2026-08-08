#!/usr/bin/env bash
#
# Build and push ekascribe images to Docker Hub.
#
#   ./deploy/push.sh                    build + push api and web
#   ./deploy/push.sh api                just the api image
#   PUSH=false ./deploy/push.sh         build locally, don't push
#   TAG=v1.2.3 ./deploy/push.sh         explicit tag instead of the git sha
#
# Everything lands in ONE repo with component-prefixed tags, e.g.
#   ekacare/ekascribe:api-1a2b3c4   ekacare/ekascribe:web-1a2b3c4
#   ekacare/ekascribe:api-latest    ekacare/ekascribe:web-latest
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

# NEXT_PUBLIC_* are inlined into the JS bundle at BUILD time by Next.js
# (deploy/Dockerfile.web) -- setting them at runtime in k8s does nothing. The
# defaults match `kubectl port-forward`, which is how this deployment is
# reached; override them once the API is behind a real hostname.
NEXT_PUBLIC_API_HOST="${NEXT_PUBLIC_API_HOST:-http://localhost:8000}"
NEXT_PUBLIC_WEB_HOST="${NEXT_PUBLIC_WEB_HOST:-http://localhost:3000}"

ALL_COMPONENTS=(api web)

info() { printf '>> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

dockerfile_for() {
  case "$1" in
    api)    printf '%s\n' "$REPO_ROOT/deploy/Dockerfile.api" ;;
    web)    printf '%s\n' "$REPO_ROOT/deploy/Dockerfile.web" ;;
    *)      return 1 ;;
  esac
}

# git sha, with -dirty when the tree does not match the commit. Falls back to
# "notag" outside a usable git checkout so the script still works from a tarball.
#
# Uses `status --porcelain` rather than `diff --quiet HEAD` on purpose: untracked
# files are part of the build context too, so an image built with them does not
# correspond to the bare commit. Gitignored files are excluded, so a local .env
# does not permanently mark every build dirty.
default_tag() {
  local sha
  if ! sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null)"; then
    printf 'notag\n'
    return
  fi
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]]; then
    printf '%s-dirty\n' "$sha"
  else
    printf '%s\n' "$sha"
  fi
}

preflight() {
  command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
  docker info >/dev/null 2>&1 || die "cannot talk to the docker daemon (is it running? are you in the docker group?)"

  [[ "$TAG" == *-dirty ]] && warn "working tree is dirty -- tagging as '$TAG'"

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

  local build_args=()
  if [[ "$component" == "web" ]]; then
    build_args+=(--build-arg "NEXT_PUBLIC_API_HOST=${NEXT_PUBLIC_API_HOST}")
    build_args+=(--build-arg "NEXT_PUBLIC_WEB_HOST=${NEXT_PUBLIC_WEB_HOST}")
    info "web API host baked at build time: $NEXT_PUBLIC_API_HOST"
  fi

  if [[ "$PLATFORMS" == *,* ]]; then
    # Multi-arch images can't be loaded into the local daemon -- buildx pushes
    # the manifest list directly.
    [[ "$PUSH" == "true" ]] || die "multi-platform builds cannot be built locally without pushing; set PUSH=true or use a single PLATFORMS value"
    ensure_builder
    info "buildx $component [$PLATFORMS] -> ${tags[*]}"
    docker buildx build --builder "$BUILDER_NAME" --platform "$PLATFORMS" \
      -f "$dockerfile" "${build_args[@]}" "${tag_args[@]}" --push "$REPO_ROOT"
  else
    info "build $component [$PLATFORMS]"
    docker build --platform "$PLATFORMS" \
      -f "$dockerfile" "${build_args[@]}" "${tag_args[@]}" "$REPO_ROOT"
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
  local components=("$@")
  [[ ${#components[@]} -eq 0 ]] && components=("${ALL_COMPONENTS[@]}")

  TAG="${TAG:-$(default_tag)}"
  PUSHED_TAGS=()

  preflight

  info "repo: $DOCKERHUB_REPO   tag: $TAG   components: ${components[*]}"
  [[ "$PUSH" == "true" ]] || info "PUSH=false -- building only, nothing will be pushed"

  local c
  for c in "${components[@]}"; do
    build_component "$c"
  done

  echo
  info "$([[ "$PUSH" == "true" ]] && echo pushed || echo built):"
  local t
  for t in "${PUSHED_TAGS[@]}"; do printf '     %s\n' "$t"; done

  if [[ "$PUSH" == "true" ]]; then
    echo
    info "roll out the immutable tags with:"
    for c in "${components[@]}"; do
      printf '     kubectl -n eka-care set image deploy/ekascribe-%s %s=%s:%s-%s\n' \
        "$c" "$c" "$DOCKERHUB_REPO" "$c" "$TAG"
    done
  fi
}

main "$@"
