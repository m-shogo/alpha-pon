// 朝の処理のログ回転が「その回のログを捨てない」ことのテスト。
//
// なぜ要るか（2026-09-21 に起きたこと）:
//   launchd は StandardOutPath を**ジョブ開始時に開いたまま**保持する。
//   回転が `mv` で inode を差し替えると、launchd の fd は消えた inode を指し続け、
//   **回転より後にその回が出した出力が全部消える**。
//   実際に logs/daily.log は 5000行ちょうどで止まり、末尾には古い回の行が並んでいた。
//   そのため「最新の回で通知が失敗した」と読み違えた（台帳では届いていた）。
//
// 守りたい性質:
//   1. 回転しても、そのあとに書いた行がログに残る
//   2. 同じファイル（inode）のまま切り詰める
//   3. 上限以下なら何もしない
//   4. mv 方式だと 1 が壊れる（この比較をテストに残す。直したことの意味が消えないように）

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROTATE_SH = resolve(process.cwd(), "scripts/rotate-log.sh");
const dir = mkdtempSync(join(tmpdir(), "alpha-pon-rotate-"));

/** launchd と同じ形: 親が追記モードで開いたログに、子プロセスが回転をかける。 */
function runWithAppendedLog(log: string, script: string): void {
  execFileSync("/bin/bash", ["-c", `{ ${script} ; } >> "${log}" 2>&1`], { cwd: dir });
}

function lines(log: string): string[] {
  return readFileSync(log, "utf-8").split("\n").filter((one) => one !== "");
}

function testRotationKeepsWhatTheRunPrintsAfterIt() {
  const log = join(dir, "daily.log");
  writeFileSync(log, `${Array.from({ length: 6000 }, (_value, index) => `古い行${index + 1}`).join("\n")}\n`);
  const before = statSync(log).ino;
  runWithAppendedLog(
    log,
    `. "${ROTATE_SH}"; echo "回転より前の行"; rotate_log "${log}" 5000; echo "回転より後の行"`,
  );
  const after = lines(log);
  assert.ok(after.includes("回転より後の行"), "回転のあとに書いた行が残る（ここが壊れていた）");
  assert.ok(after.includes("回転より前の行"), "回転の前に書いた行も残る");
  assert.equal(statSync(log).ino, before, "同じファイル（inode）のまま切り詰める");
  assert.ok(after.length <= 5004, `切り詰められている: ${after.length}行`);
  assert.ok(after.includes("古い行6000"), "新しいほうの古い行は残る");
  assert.equal(after.includes("古い行1"), false, "古すぎる行は落とす");
}

function testNoRotationBelowTheLimit() {
  const log = join(dir, "small.log");
  writeFileSync(log, "1行目\n");
  const before = statSync(log).ino;
  runWithAppendedLog(log, `. "${ROTATE_SH}"; rotate_log "${log}" 5000; echo "その後の行"`);
  assert.deepEqual(lines(log), ["1行目", "その後の行"], "上限以下なら何もしない");
  assert.equal(statSync(log).ino, before);
}

function testMissingLogIsNotAnError() {
  const log = join(dir, "does-not-exist.log");
  runWithAppendedLog(join(dir, "out.log"), `. "${ROTATE_SH}"; rotate_log "${log}" 10; echo "続行した"`);
  assert.ok(lines(join(dir, "out.log")).includes("続行した"), "ログが無くても止まらない");
}

/** 直した理由の記録。mv 方式だと「回転より後の行」が消える。 */
function testTheOldMoveApproachLosesTheRun() {
  const log = join(dir, "old-way.log");
  writeFileSync(log, `${Array.from({ length: 6000 }, (_value, index) => `古い行${index + 1}`).join("\n")}\n`);
  const before = statSync(log).ino;
  runWithAppendedLog(
    log,
    `echo "回転より前の行"; tail -n 5000 "${log}" > "${log}.tmp" && mv "${log}.tmp" "${log}"; echo "回転より後の行"`,
  );
  const after = lines(log);
  assert.equal(after.includes("回転より後の行"), false, "mv 方式では、その回の出力が消える");
  assert.notEqual(statSync(log).ino, before, "mv 方式は inode が変わる");
}

try {
  testRotationKeepsWhatTheRunPrintsAfterIt();
  testNoRotationBelowTheLimit();
  testMissingLogIsNotAnError();
  testTheOldMoveApproachLosesTheRun();
  console.log("daily-log-rotation: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
