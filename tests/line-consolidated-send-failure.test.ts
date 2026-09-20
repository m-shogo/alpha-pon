// 通知が届かなかったときの扱いのテスト（src/send-consolidated-line.ts）。
//
// なぜ要るか（2026-09-21 に台帳で確かめたこと）:
//   回線が上がっていない朝があり、2026-09-17 朝の分は**翌朝に1日遅れで**届いていた。
//   原因は2つ。(1) 送信CLIが失敗しても終了コード 0 を返すので、ラッパーは「ok」と記録し、
//   同じ朝に送り直せなかった。(2) 回線の失敗が再送回数（5回）を消費するので、
//   回線の落ちた朝が5回あるだけで本文が永久に消える（`requeueFailed` はテスト専用）。
//
// 守りたい性質:
//   1. 届かなかった回は終了コード 1（ラッパーが送り直せる）
//   2. 回線の失敗では回数を消費しない。状態は pending-retry で残る
//   3. ただし積まれてから MAX_PENDING_DAYS を過ぎたものは諦める（古い朝の通知は値がない）
//   4. 送信は実際には行わない（fetch を差し替えるので外に出ない）

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { enqueueFragment, MAX_PENDING_DAYS } from "../src/line-batch-queue.js";

const CLI = resolve(process.cwd(), "src/send-consolidated-line.ts");
const root = mkdtempSync(join(tmpdir(), "alpha-pon-line-fail-"));

/** 回線が届かない fetch に差し替える読み込みモジュール（外に出さない）。 */
const FAIL_FETCH = join(root, "fail-fetch.mjs");
writeFileSync(
  FAIL_FETCH,
  "globalThis.fetch = async () => { throw new TypeError('fetch failed'); };\n",
);

function runCli(batchDir: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [
    "--import", "tsx/esm",
    "--import", `file://${FAIL_FETCH}`,
    CLI,
  ], {
    cwd: process.cwd(),
    encoding: "utf-8",
    // 本物の資格情報を渡さない。fetch も差し替えてあるので送信は起きない。
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      LINE_BATCH_DIR: batchDir,
      LINE_CHANNEL_TOKEN: "dummy-token-for-test",
      LINE_USER_ID: "dummy-user-for-test",
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function ledgerOf(batchDir: string): Record<string, { status: string; attempts: number; lastError?: string }> {
  return JSON.parse(readFileSync(join(batchDir, ".ledger.json"), "utf-8")).entries;
}

function testUndeliveredRunExitsNonZeroAndKeepsThePending() {
  const batchDir = join(root, "fresh");
  const { hash } = enqueueFragment(batchDir, { text: "🤖 AI\n・テスト用の断片" });
  const result = runCli(batchDir);
  assert.equal(result.status, 1, `届かなかった回は終了コード 1: ${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /"status":"failed"/);
  assert.match(result.stdout, /fetch failed/);
  const entry = ledgerOf(batchDir)[hash]!;
  assert.equal(entry.status, "pending-retry", "次の試行に残す");
  assert.equal(entry.attempts, 0, "回線の失敗では再送回数を消費しない（これが5回で消える原因だった）");
  assert.match(entry.lastError ?? "", /fetch failed/);
}

function testTooOldPendingIsGivenUp() {
  const batchDir = join(root, "stale");
  const staleNow = new Date(Date.now() - (MAX_PENDING_DAYS + 1) * 86400000).toISOString();
  const { hash } = enqueueFragment(batchDir, { text: "🚀 宇宙\n・古い断片", now: staleNow });
  const result = runCli(batchDir);
  assert.equal(result.status, 1);
  assert.equal(
    ledgerOf(batchDir)[hash]!.status,
    "failed",
    `${MAX_PENDING_DAYS}日を過ぎた送信待ちは諦める（際限なく溜めない）`,
  );
}

try {
  testUndeliveredRunExitsNonZeroAndKeepsThePending();
  testTooOldPendingIsGivenUp();
  console.log("line-consolidated-send-failure: 全テスト成功");
} finally {
  rmSync(root, { recursive: true, force: true });
}
