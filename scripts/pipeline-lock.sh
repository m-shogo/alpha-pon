#!/usr/bin/env bash
# full complete pipeline の single-writer lock。
#
# run-daily-complete.sh 全体を1プロセスに限定し、通知 fragment/ledger の
# read-modify-write が並行実行で lost update しないようにする。
#
# 契約:
#  - atomic な mkdir で lock 取得。失敗時は非致命 skip（skipped_locked）。
#  - PIDだけでなく owner token を記録し、自分のtokenと一致する lock だけ削除する。
#  - 生存 PID の lock は絶対に奪わない。
#  - PID/token が欠落・不正な初期化途中 lock は自動で奪わない（安全側に停止）。
#  - 有効なPID/tokenがあり、PID死亡を確認できた lock だけ stale 退避して再取得する。
#  - INT/TERM は lock 解放後に必ず終了し、解放後の処理継続を許さない。
#  - lock 処理から LINE 通知は呼ばない。
#
# 使い方:
#   source scripts/pipeline-lock.sh
#   pl_acquire "/path/to/lock.d" || { echo skipped_locked; exit 0; }
#   trap 'pl_release' EXIT
#   trap 'pl_exit_on_signal 130' INT
#   trap 'pl_exit_on_signal 143' TERM
#
# 既存 run-daily.sh の lock は run-daily.sh の実行区間のみを守る別責務。
# こちらは run-daily-complete.sh 全体（補助step + 通知enqueue + 統合送信）を守る。

pl_is_valid_pid() {
  case "${1:-}" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# mkdir 後の所有情報を作る。途中状態は他プロセスから busy 扱いされる。
pl_initialize_owner() {
  local lock_dir="$1"
  local token="$2"
  local tmp_suffix="tmp-$$-${RANDOM:-0}"

  if ! printf '%s\n' "$$" > "$lock_dir/pid.$tmp_suffix"; then
    return 1
  fi
  if ! mv "$lock_dir/pid.$tmp_suffix" "$lock_dir/pid"; then
    return 1
  fi
  if ! printf '%s\n' "$token" > "$lock_dir/token.$tmp_suffix"; then
    return 1
  fi
  if ! mv "$lock_dir/token.$tmp_suffix" "$lock_dir/token"; then
    return 1
  fi
  if ! date -u '+%Y-%m-%dT%H:%M:%SZ' > "$lock_dir/started_at.$tmp_suffix"; then
    return 1
  fi
  if ! mv "$lock_dir/started_at.$tmp_suffix" "$lock_dir/started_at"; then
    return 1
  fi
  return 0
}

pl_create_owned_lock() {
  local lock_dir="$1"
  local token="$2"

  if ! mkdir "$lock_dir" 2>/dev/null; then
    return 1
  fi
  if ! pl_initialize_owner "$lock_dir" "$token"; then
    # mkdir直後の初期化失敗。まだ自分だけが作成者なので掃除して失敗する。
    rm -rf -- "$lock_dir"
    return 1
  fi
  PL_LOCK_DIR="$lock_dir"
  PL_LOCK_TOKEN="$token"
  PL_LOCK_OWNED=1
  return 0
}

# pl_acquire <lock_dir>
# 成功で 0（PL_LOCK_DIR / PL_LOCK_TOKEN / PL_LOCK_OWNED を設定）、取得不可で 1。
pl_acquire() {
  local lock_dir="$1"
  local token="$$-$(date -u '+%s')-${RANDOM:-0}"
  local owner_pid owner_token stale_backup

  PL_LOCK_OWNED=0
  PL_LOCK_DIR="$lock_dir"
  PL_LOCK_TOKEN=""

  if pl_create_owned_lock "$lock_dir" "$token"; then
    return 0
  fi

  # 既存 lock。PID/token が揃わない初期化途中・破損lockは安全側に奪わない。
  owner_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  owner_token="$(cat "$lock_dir/token" 2>/dev/null || true)"
  if ! pl_is_valid_pid "$owner_pid" || [ -z "$owner_token" ]; then
    return 1
  fi

  if kill -0 "$owner_pid" 2>/dev/null; then
    # 生存 owner。絶対に奪わない。
    return 1
  fi

  # 有効な所有情報があり、PID死亡を確認できた場合だけ stale として退避する。
  stale_backup="${lock_dir}.stale-$(date -u '+%Y%m%d%H%M%S')-$$"
  if mv "$lock_dir" "$stale_backup" 2>/dev/null; then
    printf 'stale lock 退避: %s\n' "$stale_backup" >&2
  else
    # 他プロセスが同時に処理した可能性。安全側に取得しない。
    return 1
  fi

  pl_create_owned_lock "$lock_dir" "$token"
}

# pl_release
# 自分が取得した token と現在の lock token が一致する場合だけ削除する。
pl_release() {
  local current_token
  if [ "${PL_LOCK_OWNED:-0}" != "1" ] || [ -z "${PL_LOCK_DIR:-}" ] || [ -z "${PL_LOCK_TOKEN:-}" ]; then
    return 0
  fi

  current_token="$(cat "$PL_LOCK_DIR/token" 2>/dev/null || true)"
  if [ "$current_token" = "$PL_LOCK_TOKEN" ]; then
    rm -rf -- "$PL_LOCK_DIR"
  else
    printf 'lock token 不一致のため削除しません: %s\n' "$PL_LOCK_DIR" >&2
  fi
  PL_LOCK_OWNED=0
}

# signal handler。EXIT trapを解除して二重処理を避け、必ず指定codeで終了する。
pl_exit_on_signal() {
  local code="$1"
  pl_release
  trap - EXIT
  exit "$code"
}
