#!/bin/bash
# data/ のスナップショットを backups/YYYY-MM-DD/ に保存する
# - 30日より古いバックアップを自動削除
# - 毎日 run-daily-complete.sh から呼ばれる

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="$DIR/backups"
TODAY="$(date '+%Y-%m-%d')"
DEST="$BACKUP_ROOT/$TODAY"

mkdir -p "$DEST"

# data/ 配下の JSONL / JSON を圧縮コピー（reports/ など大きいディレクトリは除く）
tar -czf "$DEST/data.tar.gz" -C "$DIR" \
  data/hypothesis_predictions.jsonl \
  data/hypothesis_outcomes.jsonl \
  data/hypothesis_accuracy_summary.json \
  data/analogy_predictions_latest.json \
  data/analogy_usage_latest.json \
  data/universe_candidates_latest.json \
  data/generated_company_rules_latest.json \
  data/world_event_reflections_latest.json \
  data/run-cursors.json \
  data/company_context_registry.jsonl \
  data/company_non_move_history.jsonl \
  2>/dev/null || true

# 30日より古いバックアップを削除（最新30件を残す）
mapfile -t all_backups < <(find "$BACKUP_ROOT" -maxdepth 1 -type d -name '????-??-??' | sort)
count=${#all_backups[@]}
if [ "$count" -gt 30 ]; then
  for old in "${all_backups[@]:0:$((count - 30))}"; do
    rm -rf "$old"
    echo "backup: removed old $old"
  done
fi

echo "backup: completed $DEST/data.tar.gz ($(du -sh "$DEST/data.tar.gz" 2>/dev/null | cut -f1))"
