#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
image="${IMAGE:-${REGISTRY:-docker.io/andpra70}/${IMAGE_NAME:-ubuntu-camera-viewer}:${TAG:-latest}}"
name="${CONTAINER_NAME:-ubuntu-camera-viewer}"
host_bind="${HOST_BIND:-127.0.0.1}"
host_port="${HOST_PORT:-3000}"
base_path="${BASE_PATH:-/}"
args=(--detach --name "$name" --restart unless-stopped --stop-timeout 15 --publish "${host_bind}:${host_port}:3000" --env PORT=3000 --env "BASE_PATH=$base_path")
for variable in TRUST_PROXY_HOPS CAMERA_ALLOWLIST CAMERA_SCAN_INTERVAL_MS TARGET_WIDTH TARGET_HEIGHT TARGET_FPS MAX_ACTIVE_CAMERAS MAX_CLIENTS_PER_CAMERA CAPTURE_START_TIMEOUT_MS CAPTURE_STALL_TIMEOUT_MS CAPTURE_IDLE_TIMEOUT_MS LOG_LEVEL; do
  if [[ -v "$variable" ]]; then args+=(--env "$variable=${!variable}"); fi
done
camera_devices=()
if [[ "${ALL_CAMERAS:-0}" == 1 ]]; then
  shopt -s nullglob
  camera_devices=(/dev/video[0-9]*)
else
  IFS=',' read -r -a camera_devices <<< "${CAMERA_DEVICES:-}"
fi
declare -A groups=()
for device in "${camera_devices[@]}"; do
  [[ -z "$device" ]] && continue
  if [[ ! "$device" =~ ^/dev/video[0-9]+$ || ! -c "$device" ]]; then printf 'Device non valido: %s\n' "$device" >&2; exit 1; fi
  args+=(--device "$device:$device:rw")
  device_group="${VIDEO_GID:-$(stat -c '%g' "$device")}"
  [[ "$device_group" =~ ^[0-9]+$ ]] || { printf 'GID non valido\n' >&2; exit 1; }
  groups["$device_group"]=1
done
for group in "${!groups[@]}"; do args+=(--group-add "$group"); done
if [[ "${PULL:-1}" == 1 ]]; then docker pull "$image"; fi
if docker container inspect "$name" >/dev/null 2>&1; then docker stop "$name"; docker rm "$name"; fi
docker run "${args[@]}" "$image"
printf 'Container: %s\nImmagine: %s\nURL: http://%s:%s%s\nCamere mappate: %s\n' "$name" "$image" "$host_bind" "$host_port" "$base_path" "${camera_devices[*]:-nessuna}"
