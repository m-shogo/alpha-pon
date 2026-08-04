#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DATABASE_NAME=""
APPLY=0
KEEP_EXPORT=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/bootstrap-cloudflare-d1.sh --database <name> [--apply] [--keep-export]

Default mode is dry-run. It validates local event seeds, creates a temporary
SQLite database, audits it, and produces a D1 bootstrap SQL preview.

--apply       Apply every ordered migration and the bootstrap SQL to the named
              remote D1 database. Requires an already-created Cloudflare
              account/database and authenticated Wrangler. This script never
              creates the account, Pages project, D1 database, Access policy,
              or billing settings.
--keep-export Keep the generated bootstrap SQL under data/exports/.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --database)
      DATABASE_NAME="${2:-}"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    --keep-export)
      KEEP_EXPORT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$DATABASE_NAME" ]]; then
  echo "--database is required" >&2
  usage >&2
  exit 1
fi

run_ts() {
  node --import tsx/esm "$@"
}

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alpha-pon-d1-bootstrap.XXXXXX")"
DB_PATH="$TEMP_DIR/market-events.db"
BOOTSTRAP_SQL="$TEMP_DIR/market-events-d1-bootstrap.sql"
trap 'rm -rf "$TEMP_DIR"' EXIT

run_ts scripts/verify-cloudflare-calendar-readiness.ts
run_ts scripts/verify-d1-bootstrap-export.ts
run_ts scripts/market-events.ts init --db "$DB_PATH" --write >/dev/null

shopt -s nullglob
EVENT_FILES=(config/market-events/*.json)
for event_file in "${EVENT_FILES[@]}"; do
  run_ts scripts/market-events.ts add --db "$DB_PATH" --file "$event_file" --write >/dev/null
done

run_ts scripts/market-events.ts audit --db "$DB_PATH"
run_ts scripts/export-market-events-d1-bootstrap.ts \
  --db "$DB_PATH" \
  --out "$BOOTSTRAP_SQL" \
  --write

if [[ "$KEEP_EXPORT" -eq 1 ]]; then
  mkdir -p data/exports
  cp "$BOOTSTRAP_SQL" "data/exports/market-events-d1-bootstrap.sql"
  echo "Kept export: data/exports/market-events-d1-bootstrap.sql"
fi

if [[ "$APPLY" -ne 1 ]]; then
  echo "DRY_RUN_ONLY: no Cloudflare state changed."
  echo "After registration/authentication, rerun with --apply."
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for Wrangler" >&2
  exit 1
fi

# Confirm the user is authenticated before attempting remote writes.
npx --yes wrangler@latest whoami >/dev/null

MIGRATION_FILES=(migrations/[0-9]*.sql)
if [[ "${#MIGRATION_FILES[@]}" -eq 0 ]]; then
  echo "No migrations found" >&2
  exit 1
fi

for migration_file in "${MIGRATION_FILES[@]}"; do
  echo "Applying $(basename "$migration_file") to remote D1 database: $DATABASE_NAME"
  npx --yes wrangler@latest d1 execute "$DATABASE_NAME" \
    --remote \
    --file="$migration_file"
done

echo "Applying INSERT OR IGNORE bootstrap rows to remote D1 database: $DATABASE_NAME"
npx --yes wrangler@latest d1 execute "$DATABASE_NAME" \
  --remote \
  --file="$BOOTSTRAP_SQL"

echo "Verifying remote migration and row counts"
npx --yes wrangler@latest d1 execute "$DATABASE_NAME" \
  --remote \
  --command="SELECT version, applied_at FROM schema_migrations ORDER BY version; SELECT COUNT(*) AS events FROM market_events; SELECT COUNT(*) AS revisions FROM event_revisions; SELECT COUNT(*) AS sources FROM event_sources; SELECT COUNT(*) AS decisions FROM decision_snapshots;"

echo "cloudflare-d1-bootstrap: applied"
