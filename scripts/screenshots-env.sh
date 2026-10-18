#!/usr/bin/env bash
# Brings up everything `pnpm screenshots` needs: local Postgres, schema, demo
# data, a Node-server build and the running app on port 3000. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3000
BASE="http://127.0.0.1:${PORT}"

export DB_DRIVER="${DB_DRIVER:-pg}"
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/pos}"
export JWT_SECRET="${JWT_SECRET:-local-dev-secret-0123456789abcdef0123456789}"
export CRON_SECRET="${CRON_SECRET:-local}"

if curl -sf "${BASE}/api/healthz" > /dev/null; then
  echo "screenshots-env: app already running on ${BASE}"
  exit 0
fi

# Postgres 16 cluster, password and database (only for the default local URL).
if [ "${DATABASE_URL}" = "postgres://postgres:postgres@localhost:5432/pos" ]; then
  if ! pg_lsclusters | grep -q ' online'; then
    pg_ctlcluster 16 main start
    until su postgres -c "psql -tAc 'select 1'" > /dev/null 2>&1; do sleep 1; done
  fi
  su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres'\"" > /dev/null
  if ! su postgres -c "psql -tAc \"select 1 from pg_database where datname='pos'\"" | grep -q 1; then
    su postgres -c "psql -c 'CREATE DATABASE pos'" > /dev/null
  fi
fi

MIGRATE=1 node --experimental-strip-types scripts/migrate.ts
pnpm db:seed

# Rebuild only when app/ or server/ changed after the last build.
if [ ! -f .output/server/index.mjs ] || [ -n "$(find app server -type f -newer .output/server/index.mjs -print -quit)" ]; then
  NITRO_PRESET=node-server pnpm exec nuxt build
else
  echo "screenshots-env: build is up to date, skipping"
fi

nohup node .output/server/index.mjs > server.log 2>&1 &
for _ in $(seq 1 60); do
  curl -sf "${BASE}/api/healthz" > /dev/null && { echo "screenshots-env: app is up on ${BASE}"; exit 0; }
  sleep 1
done
echo "screenshots-env: app did not become healthy, see server.log" >&2
exit 1
