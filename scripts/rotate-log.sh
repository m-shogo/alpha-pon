#!/bin/bash
# ログを「同じファイル（inode）のまま」切り詰める。
#
# なぜ inode を保つのか（2026-09-21 に気づいた）:
#   launchd は StandardOutPath / StandardErrorPath を**ジョブ開始時に開いたまま**保持する。
#   `tail -n N log > tmp && mv tmp log` は inode を差し替えるので、launchd の fd は
#   消えた古い inode を指し続け、**回転より後にその回が出力した全部が捨てられる**。
#   実測: 6000行のログに追記中のプロセスが mv 方式で回転すると、回転後の行は残らない。
#   その結果、朝の処理のログは「回転より前に出した数行」だけが残り、
#   ファイル末尾には古い回の行が並ぶ（診断のときに最新と読み違える）。
#
#   だから中身を書き戻す（`cat tmp > log`）。fd は生きたままで、追記は新しい末尾に続く。
#
# 使い方: rotate_log <ログのパス> [残す行数]
rotate_log() {
  local log="$1"
  local keep="${2:-5000}"
  [ -f "$log" ] || return 0
  local lines
  lines="$(wc -l < "$log" | tr -d ' ')"
  [ "$lines" -gt "$keep" ] || return 0
  local tmp="$log.rotate-tmp.$$"
  if tail -n "$keep" "$log" > "$tmp"; then
    cat "$tmp" > "$log"   # ← mv しない。同じ inode に書き戻す
    rm -f "$tmp"
    echo "[rotate-log] $log を $lines → $keep 行に切り詰めました（同じファイルのまま）"
  else
    rm -f "$tmp"
    echo "[rotate-log] WARNING: $log の切り詰めに失敗しました（そのまま続行）" >&2
    return 1
  fi
}
