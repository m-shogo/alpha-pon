// 「届かなければ同じ朝に送り直す」再送関数のテスト（scripts/retry-until-ok.sh）。
//
// なぜ要るか（2026-09-21）:
//   朝の通知は回線が落ちている朝に失敗し、**翌朝に1日遅れで**届いていた（台帳で確認）。
//   同じ朝に送り直せばその日のうちに届く。1回でも成功したら止め、
//   全部失敗したときだけ呼び出し側が失敗として記録できること。
//
// 守りたい性質:
//   1. 1回で成功したら1回しか走らせない（待たない）
//   2. 途中で成功したらそこで止め、終了コード 0 を返す
//   3. 全部失敗したら最後の終了コードを返す
//   4. 待つのは試行のあいだだけ（最後の失敗のあとには待たない）

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RETRY_SH = resolve(process.cwd(), "scripts/retry-until-ok.sh");
const dir = mkdtempSync(join(tmpdir(), "alpha-pon-retry-"));

/**
 * 指定回数だけ失敗して、そのあと成功するコマンドを作る。
 * 走った回数はファイルに残す（1行 = 1回）。
 */
function fakeCommand(name: string, failTimes: number, exitCode = 1): { path: string; runs: () => number } {
  const countPath = join(dir, `${name}.runs`);
  const script = join(dir, `${name}.sh`);
  writeFileSync(countPath, "");
  writeFileSync(script, [
    "#!/bin/bash",
    `echo run >> "${countPath}"`,
    `runs=$(wc -l < "${countPath}" | tr -d ' ')`,
    `if [ "$runs" -le ${failTimes} ]; then exit ${exitCode}; fi`,
    "exit 0",
  ].join("\n"), { mode: 0o755 });
  return {
    path: script,
    runs: () => readFileSync(countPath, "utf-8").split("\n").filter((one) => one !== "").length,
  };
}

function runRetry(attempts: number, waitSeconds: number, command: string): { status: number | null; stdout: string } {
  const result = spawnSync("/bin/bash", [
    "-c",
    `. "${RETRY_SH}"; retry_until_ok ${attempts} ${waitSeconds} "${command}"`,
  ], { cwd: dir, encoding: "utf-8" });
  return { status: result.status, stdout: result.stdout };
}

function testSucceedsOnTheFirstTry() {
  const command = fakeCommand("ok", 0);
  const result = runRetry(3, 0, command.path);
  assert.equal(result.status, 0);
  assert.equal(command.runs(), 1, "成功したら1回で止める");
  assert.equal(/試行 2/.test(result.stdout), false, "2回目を走らせない");
}

function testStopsAtTheFirstSuccess() {
  const command = fakeCommand("second", 1);
  const result = runRetry(3, 0, command.path);
  assert.equal(result.status, 0, "2回目で成功したら成功として返す");
  assert.equal(command.runs(), 2);
  assert.match(result.stdout, /試行 2 で成功しました/);
}

function testReturnsTheLastExitCodeWhenAllFail() {
  const command = fakeCommand("never", 9, 3);
  const result = runRetry(3, 0, command.path);
  assert.equal(result.status, 3, "最後の終了コードを返す（呼び出し側が失敗として記録できる）");
  assert.equal(command.runs(), 3, "指定回数だけ試す");
  assert.match(result.stdout, /3 回すべて失敗しました（最後の終了コード 3）/);
}

/** 待ちは試行のあいだだけ。最後の失敗のあとに待つと、朝の処理が無駄に延びる。 */
function testWaitsOnlyBetweenAttempts() {
  const command = fakeCommand("slow", 9);
  const started = Date.now();
  const result = runRetry(3, 1, command.path);
  const elapsedMs = Date.now() - started;
  assert.equal(result.status, 1);
  assert.ok(elapsedMs >= 2000, `試行のあいだは待つ: ${elapsedMs}ms`);
  assert.ok(elapsedMs < 2900, `最後の失敗のあとには待たない: ${elapsedMs}ms`);
}

try {
  testSucceedsOnTheFirstTry();
  testStopsAtTheFirstSuccess();
  testReturnsTheLastExitCodeWhenAllFail();
  testWaitsOnlyBetweenAttempts();
  console.log("retry-until-ok: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
