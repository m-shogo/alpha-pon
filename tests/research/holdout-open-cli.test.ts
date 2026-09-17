// research:holdout:open を合成データで端から端まで通すテスト。
//
// 本物の封印は1回しか開けられないので、実行の経路（--execute）は実データで試せない。
// 一時ディレクトリに保存庫・封印・事前登録（git にコミット）を作って確かめる。
//
// 守りたい性質:
//   1. 引数だけなら計画の表示だけで、記録を残さない
//   2. --execute で1回だけ実行し、スキーマに合う記録を1行残す
//   3. 同じ Edge は2回目を拒否する
//   4. 事前登録が変更中なら拒否する

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadSchema } from "../../src/research/io.js";
import { validate } from "../../src/research/schema.js";
import { toEquityMasterRecord } from "../../src/research/providers/jquants-master-store.js";
import { toFinsDisclosureRecord } from "../../src/research/providers/jquants-fins-store.js";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "src/research/cli/holdout-open.ts");
const dir = mkdtempSync(join(realpathSync(tmpdir()), "alpha-pon-holdout-open-"));

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function git(args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
    cwd: dir, encoding: "utf-8",
  });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
}

function runCli(extra: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [
    "--import", "tsx/esm", CLI,
    "--bundle=research/studies/short.json",
    "--prereg=docs/prereg.md",
    "--from=2025-08-01",
    "--trading-days=40",
    "--min-t=1.96",
    "--actor=test",
    ...extra,
  ], { cwd: dir, encoding: "utf-8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

try {
  // --- 保存庫を組む ---------------------------------------------------------
  for (const sub of ["prices/jquants-free-daily", "fins/jquants-free-daily", "master/jquants-free-daily", "holdout", "studies"]) {
    mkdirSync(join(dir, "research", sub), { recursive: true });
  }
  mkdirSync(join(dir, "docs"), { recursive: true });
  // スキーマの読み込みはリンクを受け付けない（standalone regular file のみ）。複製する。
  cpSync(join(REPO, "research/schemas"), join(dir, "research/schemas"), { recursive: true });
  symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"));

  const dates = weekdays("2025-01-06", "2025-10-31");
  const codes = Array.from({ length: 110 }, (_, index) => String(1001 + index));
  // 確認期間（2025-08-01 以降）に 10 銘柄が個別に急落し、その後も下げる。
  const confirmDates = dates.filter((date) => date >= "2025-08-01");
  const crashDayByCode = new Map(codes.slice(0, 10).map((code, index) => [code, confirmDates[3 + index * 3]!]));
  const random = lcg(7);
  const closes = new Map(codes.map((code) => [code, 1000]));
  const fileLines = new Map<string, string[]>(dates.map((date) => [date, []]));
  const downDays = new Map<string, number>();
  for (const date of dates) {
    const market = (random() - 0.5) * 0.02;
    for (const code of codes) {
      const previous = closes.get(code)!;
      let move = market + (random() - 0.5) * 0.01;
      let open = previous;
      if (crashDayByCode.get(code) === date) {
        move = -0.15;
        downDays.set(code, 5);
      } else if ((downDays.get(code) ?? 0) > 0) {
        move = market - 0.01;
        downDays.set(code, downDays.get(code)! - 1);
      }
      const close = Math.round(previous * (1 + move) * 100) / 100;
      if (crashDayByCode.get(code) === date) open = close;
      closes.set(code, close);
      const stamp = `${date}T15:30:00+09:00`;
      fileLines.get(date)!.push(JSON.stringify({
        schemaVersion: 1, seriesKind: "security", code, market: "TSE", tradingDate: date,
        dataAsOf: stamp, observedAt: stamp, retrievedAt: stamp, firstExecutableAt: stamp,
        source: "synthetic", sourceVersion: "synthetic-v1", providerPlan: "synthetic",
        delayDays: 0, isDelayed: false, ingestionRunId: "synthetic", currency: "JPY", status: "traded",
        ohlcv: { open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1_000_000 },
        adjusted: false, adjustmentFactor: 1, corporateActions: [], license: "local_only",
      }));
    }
  }
  for (const [date, lines] of fileLines) {
    writeFileSync(join(dir, "research/prices/jquants-free-daily", `${date}.jsonl`), `${lines.join("\n")}\n`);
  }
  writeFileSync(join(dir, "research/prices/jquants-free-daily/_adjustments.jsonl"), "");

  writeFileSync(join(dir, "research/fins/jquants-free-daily/2025-01-06.jsonl"), `${JSON.stringify(toFinsDisclosureRecord({
    queryDate: "2025-01-06",
    raw: { DiscDate: "2025-01-06", DiscTime: "15:30:00", Code: "1110", DiscNo: "1", DocType: "3QFinancialStatements_Consolidated_JP" },
    retrievedAt: "2025-04-01T00:00:00.000Z",
    ingestionRunId: "synthetic",
  }))}\n`);

  // 1001 だけ信用銘柄（売れない）。
  writeFileSync(join(dir, "research/master/jquants-free-daily/2025-01-06.jsonl"), `${codes.map((code) => JSON.stringify(toEquityMasterRecord({
    queryDate: "2025-01-06",
    raw: {
      Date: "2025-01-06", Code: code, CoName: `会社${code}`, S17: "1", S33: "3050", S33Nm: "食料品",
      ScaleCat: "TOPIX Small 1", Mkt: "0111", Mrgn: code === "1001" ? "1" : "2",
    },
    retrievedAt: "2025-04-01T00:00:00.000Z",
    ingestionRunId: "synthetic",
  }))).join("\n")}\n`);

  writeFileSync(join(dir, "research/holdout/vault.manifest.json"), JSON.stringify({
    schemaVersion: 1,
    sealedAt: "2025-06-01",
    policy: "test",
    windows: [{ id: "vault-test", from: "2025-07-01", to: "2025-12-31", scope: "all_universe" }],
  }));
  writeFileSync(join(dir, "research/holdout/access_log.jsonl"), "");

  writeFileSync(join(dir, "research/studies/short.json"), JSON.stringify({
    spec: {
      schemaVersion: 1, id: "synthetic-short-d5", edgeId: "synthetic-reversal", side: "short",
      notionalJpy: 1_000_000, entry: { mode: "next_open" },
      exit: { mode: "holding_period", holdingPeriodDays: 5 },
      costs: { commissionBps: 5, spreadBps: 10, slippageBps: 8, marketImpactBpsPerPctAdv: 10, borrowCostAnnualBps: 1825 },
      liquidity: { participationLimitPct: 3, minAdtvJpy: 500_000_000, minHistoryBars: 20, maxLots: 50, lotSize: 100 },
      benchmark: "UNIVERSE-EW",
    },
    detector: {
      kind: "abnormal_move",
      params: {
        abnormalReturnThresholdPct: -10,
        knownEventDates: {},
        marketModel: { estimationBars: 120, gapBars: 5, minObservations: 60, maxPriorGapDays: 10 },
        minAverageTurnoverJpy: 500_000_000,
      },
    },
    filters: { lendableOnly: true },
    trials: 1,
  }, null, 2));

  writeFileSync(join(dir, "docs/prereg.md"),
    "bundle: `research/studies/short.json`\n確認: 2025-08-01 以降の 40 営業日で1回だけ\n");
  git(["init", "-q"]);
  git(["add", "docs/prereg.md"]);
  git(["commit", "-q", "-m", "prereg"]);

  const accessLogPath = join(dir, "research/holdout/access_log.jsonl");

  // 1. 計画の表示だけ
  const plan = runCli([]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /確認期間: 2025-08-01 〜 2025-09-25（40営業日）\/ 封印の窓 vault-test/);
  assert.match(plan.stdout, /計画だけ表示しました/);
  assert.equal(readFileSync(accessLogPath, "utf-8"), "", "計画の表示では記録を残さない");

  // 2. 1回だけ実行
  const run = runCli(["--execute"]);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /貸借  : シグナル \d+ → \d+（貸借でない 1 \/ 区分不明 0）/, "信用銘柄 1001 は売らない");
  const lines = readFileSync(accessLogPath, "utf-8").trim().split("\n");
  assert.equal(lines.length, 1, "封印の窓1つにつき1行");
  const entry = JSON.parse(lines[0]!);
  assert.deepEqual(validate(entry, loadSchema("holdout-access")), []);
  assert.equal(entry.edgeId, "synthetic-reversal");
  assert.equal(entry.windowId, "vault-test");
  assert.equal(entry.actor, "test");
  assert.ok(entry.sampleCount > 0, "確認期間で約定している");
  const notes = JSON.parse(entry.notes);
  assert.equal(notes.from, "2025-08-01");
  assert.equal(notes.to, "2025-09-25");
  assert.equal(notes.tradingDays, 40);
  assert.equal(notes.specId, "synthetic-short-d5");
  assert.match(notes.preregCommit, /^[0-9a-f]{40}$/);
  assert.match(run.stdout, new RegExp(`判定    : ${entry.result.toUpperCase()}`));

  // 3. 2回目は拒否
  const again = runCli(["--execute"]);
  assert.notEqual(again.status, 0);
  assert.match(again.stdout + again.stderr, /開封済み/);
  assert.equal(readFileSync(accessLogPath, "utf-8").trim().split("\n").length, 1, "記録は増えない");

  // 4. 事前登録が変更中なら拒否（計画の表示でも）
  writeFileSync(join(dir, "docs/prereg.md"), "書き換え中\n");
  const dirty = runCli([]);
  assert.notEqual(dirty.status, 0);
  assert.match(dirty.stdout + dirty.stderr, /未コミットの変更/);

  console.log("research/holdout-open-cli: 全テスト成功");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
