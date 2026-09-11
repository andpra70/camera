#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
REGISTRY="${REGISTRY:-docker.io/andpra70}"
IMAGE_NAME="${IMAGE_NAME:-ubuntu-camera-viewer}"
TAG="${TAG:-latest}"
image="${REGISTRY%/}/${IMAGE_NAME}:${TAG}"
docker build -t "$image" .
docker push "$image"
printf 'Immagine pubblicata: %s\n' "$image"
