#!/bin/bash
# 失敗したら間隔を置いて何度か試す。最後の終了コードを返す。
#
# なぜ要るのか（2026-09-21 に台帳で確かめたこと）:
#   朝の通知の送信は、回線が上がっていない朝に失敗する。
#   2026-09-17 朝の分は失敗し、**翌朝に1日遅れで**届いていた。朝の通知は遅れると値が下がる。
#   同じ朝のうちに送り直せば、その日のうちに届く。
#   回線が原因の失敗は再送の回数を消費しない（src/line-batch-queue.ts の markFailed）ので、
#   同じ朝に何度試しても本文の寿命は縮まない。
#
# 使い方: retry_until_ok <試行回数> <待ち秒数> <コマンド...>
#   - 1回でも成功したら 0 を返す（そこで止める）
#   - 全部失敗したら最後の終了コードを返す（呼び出し側が失敗として記録できる）
#   - 待ちは試行の**あいだ**だけ。最後の失敗のあとには待たない
retry_until_ok() {
  local attempts="$1"
  local wait_seconds="$2"
  shift 2
  local attempt=1
  local code=0
  while :; do
    echo "[retry] 試行 $attempt/$attempts: $1"
    # `if cmd; then ... fi` は条件が失敗しても複合コマンド自体は 0 を返すので、
    # `fi` のあとで $? を読むと終了コードを取り違える。else の中で読む。
    # 全角の「）」は変数名に食われるため ${} で囲む。
    if "$@"; then
      [ "$attempt" -gt 1 ] && echo "[retry] 試行 $attempt で成功しました"
      return 0
    else
      code=$?
    fi
    if [ "$attempt" -ge "$attempts" ]; then
      echo "[retry] $attempts 回すべて失敗しました（最後の終了コード ${code}）"
      return "$code"
    fi
    echo "[retry] 失敗（終了コード ${code}）。${wait_seconds}秒後に試し直します"
    sleep "$wait_seconds"
    attempt=$((attempt + 1))
  done
}
