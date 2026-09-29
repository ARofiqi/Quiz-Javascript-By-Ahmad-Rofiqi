#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$PROJECT_DIR"

if [ ! -f .env ]; then
    printf '%s\n' 'File .env tidak ditemukan. Buat dari .env.example dan isi DOCKERHUB_USERNAME serta HF_TOKEN.' >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    printf '%s\n' 'Docker CLI tidak ditemukan. Install atau aktifkan Docker terlebih dahulu.' >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    printf '%s\n' 'Docker Engine tidak aktif. Jalankan Docker Desktop atau Docker Engine terlebih dahulu.' >&2
    exit 1
fi

docker compose --env-file .env config --quiet
IMAGE=$(docker compose --env-file .env config --images)
docker build --pull -t "$IMAGE" "$PROJECT_DIR"
docker push "$IMAGE"

printf 'Image %s berhasil di-build dan di-push ke Docker Hub.\n' "$IMAGE"