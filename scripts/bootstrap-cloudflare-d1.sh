#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DATABASE_NAME=""
APPLY=0
KEEP_EXPORT=0
WRANGLER_VERSION="${WRANGLER_VERSION:-4.114.0}"
REMOTE_MIGRATION_DIR="migrations/d1"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/bootstrap-cloudflare-d1.sh --database <name> [--apply] [--keep-export]

Default mode is dry-run. It validates local event seeds, creates a temporary
SQLite database, audits it, and produces a D1 bootstrap SQL preview.

--apply       Apply the trigger-free remote D1 migrations and bootstrap SQL to
              the named remote D1 database. Requires an already-created
              Cloudflare account/database and authenticated Wrangler. This
              script never creates the account, Worker, D1 database, Access
              policy, or billing settings.
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

if grep -Eq '^[[:space:]]*--' "$BOOTSTRAP_SQL"; then
  echo "D1 bootstrap SQL must not contain line comments" >&2
  exit 1
fi

if grep -Eiq '^[[:space:]]*(BEGIN[[:space:]]+TRANSACTION|SAVEPOINT|COMMIT|ROLLBACK)([[:space:];]|$)' "$BOOTSTRAP_SQL"; then
  echo "D1 bootstrap SQL contains unsupported explicit transaction control" >&2
  exit 1
fi

REMOTE_MIGRATION_FILES=("$REMOTE_MIGRATION_DIR"/[0-9]*.sql)
if [[ "${#REMOTE_MIGRATION_FILES[@]}" -eq 0 ]]; then
  echo "No remote D1 migrations found under $REMOTE_MIGRATION_DIR" >&2
  exit 1
fi

for migration_file in "${REMOTE_MIGRATION_FILES[@]}"; do
  if grep -Eq '^[[:space:]]*--' "$migration_file"; then
    echo "Remote D1 migration contains a line comment: $migration_file" >&2
    exit 1
  fi
  if grep -Eiq '\b(BEGIN[[:space:]]+TRANSACTION|SAVEPOINT|COMMIT|ROLLBACK)\b' "$migration_file"; then
    echo "Remote D1 migration contains explicit transaction control: $migration_file" >&2
    exit 1
  fi
  if grep -Eiq '\bCREATE[[:space:]]+TRIGGER\b' "$migration_file"; then
    echo "Remote D1 migration must remain trigger-free: $migration_file" >&2
    exit 1
  fi
done

if [[ "$KEEP_EXPORT" -eq 1 ]]; then
  mkdir -p data/exports
  cp "$BOOTSTRAP_SQL" "data/exports/market-events-d1-bootstrap.sql"
  echo "Kept export: data/exports/market-events-d1-bootstrap.sql"
fi

if [[ "$APPLY" -ne 1 ]]; then
  echo "DRY_RUN_ONLY: no Cloudflare state changed."
  echo "After authentication, rerun with --apply."
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required for Wrangler" >&2
  exit 1
fi

WRANGLER_PACKAGE="wrangler@${WRANGLER_VERSION}"
npx --yes "$WRANGLER_PACKAGE" whoami >/dev/null

echo "Applying trigger-free remote D1 migrations to database: $DATABASE_NAME"
npx --yes "$WRANGLER_PACKAGE" d1 migrations apply "$DATABASE_NAME" --remote

echo "Applying INSERT OR IGNORE bootstrap rows to remote D1 database: $DATABASE_NAME"
npx --yes "$WRANGLER_PACKAGE" d1 execute "$DATABASE_NAME" \
  --remote \
  --file="$BOOTSTRAP_SQL"

echo "Verifying remote migration mode and row counts"
npx --yes "$WRANGLER_PACKAGE" d1 execute "$DATABASE_NAME" \
  --remote \
  --command="SELECT version, applied_at FROM schema_migrations ORDER BY version; SELECT COUNT(*) AS events FROM market_events; SELECT COUNT(*) AS revisions FROM event_revisions; SELECT COUNT(*) AS sources FROM event_sources; SELECT COUNT(*) AS decisions FROM decision_snapshots; SELECT COUNT(*) AS triggers FROM sqlite_master WHERE type = 'trigger';"

echo "cloudflare-d1-bootstrap: applied"
