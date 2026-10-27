#!/bin/sh
# Runs the panel's end-to-end tests on a throwaway stack: its own Compose project, ports and database,
# seeded with the development data and removed afterwards. Your own local data is never touched.
# Needs .env (as for `docker compose up`) and built images; set E2E_BUILD=1 to build them first.
set -eu
cd "$(dirname "$0")/../.."
export COMPOSE_PROJECT_NAME=pspk-e2e WEB_PORT="${E2E_WEB_PORT:-8090}" API_PORT="${E2E_API_PORT:-8010}" DB_PORT="${E2E_DB_PORT:-5442}"
export SEED_PASSWORD="${SEED_PASSWORD:-e2e-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')}"
cleanup() { docker compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
if [ "${E2E_BUILD:-0}" = 1 ]; then docker compose up -d --build --wait; else docker compose up -d --no-build --wait; fi
docker compose exec -T -e SEED_PASSWORD backend python -m app.seed >/dev/null
cd web
E2E_BASE_URL="http://localhost:$WEB_PORT" npx playwright test "$@"
