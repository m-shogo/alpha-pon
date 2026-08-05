#!/usr/bin/env bash
# full complete pipeline の single-writer lock。
#
# run-daily-complete.sh 全体を1プロセスに限定し、通知 fragment/ledger の
# read-modify-write が並行実行で lost update しないようにする。
#
# 契約:
#  - atomic な mkdir で lock 取得。失敗時は非致命 skip（skipped_locked）。
#  - trap で EXIT/INT/TERM 時に**自分が取得した lock だけ**削除する。
#  - 生存 PID の lock は絶対に奪わない。
#  - PID が存在しない stale lock は started_at を退避してから再取得する。
#  - lock 処理から LINE 通知は呼ばない。
#
# 使い方:
#   source scripts/pipeline-lock.sh
#   pl_acquire "/path/to/lock.d" || { echo skipped_locked; exit 0; }
#   trap 'pl_release' EXIT INT TERM
#
# 既存 run-daily.sh の lock は run-daily.sh の実行区間のみを守る別責務。
# こちらは run-daily-complete.sh 全体（補助step + 通知enqueue + 統合送信）を守る。

# pl_acquire <lock_dir>
# 成功で 0（PL_LOCK_DIR / PL_LOCK_OWNED を設定）、取得不可で 1。
pl_acquire() {
  local lock_dir="$1"
  PL_LOCK_OWNED=0
  PL_LOCK_DIR="$lock_dir"

  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$$" > "$lock_dir/pid"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$lock_dir/started_at"
    PL_LOCK_OWNED=1
    return 0
  fi

  # 既存 lock あり。owner PID の生存を確認する。
  local owner_pid
  owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  if [ -n "$owner_pid" ] && kill -0 "$owner_pid" 2>/dev/null; then
    # 生存 owner。奪わない。
    return 1
  fi

  # stale lock（PID 不明 or 死亡）。started_at を記録して安全に退避してから再取得。
  local stale_backup
  stale_backup="${lock_dir}.stale-$(date -u '+%Y%m%d%H%M%S')-$$"
  if mv "$lock_dir" "$stale_backup" 2>/dev/null; then
    printf 'stale lock 退避: %s\n' "$stale_backup" >&2
  else
    # 退避に失敗（他プロセスが同時に処理した等）。安全側に取得しない。
    return 1
  fi

  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$$" > "$lock_dir/pid"
    date -u '+%Y-%m-%dT%H:%M:%SZ' > "$lock_dir/started_at"
    PL_LOCK_OWNED=1
    return 0
  fi
  return 1
}

# pl_release
# 自分が取得した lock だけ削除する。
pl_release() {
  if [ "${PL_LOCK_OWNED:-0}" = "1" ] && [ -n "${PL_LOCK_DIR:-}" ]; then
    rm -rf "$PL_LOCK_DIR"
    PL_LOCK_OWNED=0
  fi
}
