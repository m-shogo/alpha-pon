// 日付メジャー保存からの読み出しテスト。
//
// 危ないところ:
//   1. 高速化のための文字列篩（needle）。保存形式が変われば黙ってすり抜ける。
//      → 「0件だった銘柄」を必ず報告させ、黙って空系列を返さないこと。
//   2. `"7203"` が `"72030"` に誤爆しないこと。桁が違う別銘柄を掴む。
//   3. 期間で絞ったとき、境界日を落とさないこと。

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  codeNeedle,
  listIngestedDates,
  loadSeriesForCodes,
  readDateRecords,
  universeOn,
} from "../src/research/providers/jquants-daily-store.js";
import type { PitPriceRecord } from "../src/research/price-store.js";

function record(code: string, tradingDate: string, close: number, status: "traded" | "missing" = "traded"): PitPriceRecord {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code,
    market: "TSE",
    tradingDate,
    dataAsOf: `${tradingDate}T15:30:00+09:00`,
    observedAt: `${tradingDate}T23:59:59.999999999+09:00`,
    retrievedAt: "2026-09-01T00:00:00.000Z",
    firstExecutableAt: "2026-09-01T00:00:00.000Z",
    source: "jquants",
    sourceVersion: "test",
    providerPlan: "free",
    delayDays: 84,
    isDelayed: true,
    ingestionRunId: "test",
    currency: "JPY",
    status,
    ...(status === "traded"
      ? { ohlcv: { open: close, high: close, low: close, close, volume: 100 } }
      : { missingReason: "unknown" as const }),
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: "local_only",
    contentHash: `hash-${code}-${tradingDate}`,
  };
}

function makeStore(days: Record<string, PitPriceRecord[]>): string {
  const root = mkdtempSync(resolve(tmpdir(), "jq-daily-store-"));
  for (const [date, records] of Object.entries(days)) {
    writeFileSync(
      resolve(root, `${date}.jsonl`),
      `${records.map((value) => JSON.stringify(value)).join("\n")}\n`,
    );
  }
  return root;
}

function testNeedleDoesNotMatchLongerCode(): void {
  // 4桁 `7203` と5桁 `72030` は別銘柄。閉じ引用符が誤爆を止める。
  const line = JSON.stringify(record("72030", "2025-09-01", 1000));
  assert.ok(line.includes(codeNeedle("72030")));
  assert.ok(!line.includes(codeNeedle("7203")), "4桁の needle が5桁の行に当たってはいけない");
}

function testLoadSeriesPicksOnlyRequestedCodes(): void {
  const root = makeStore({
    "2025-09-01": [record("13060", "2025-09-01", 100), record("72030", "2025-09-01", 200), record("99840", "2025-09-01", 300)],
    "2025-09-02": [record("13060", "2025-09-02", 101), record("72030", "2025-09-02", 201), record("99840", "2025-09-02", 301)],
  });
  try {
    const result = loadSeriesForCodes({ codes: ["72030"], root });
    assert.deepEqual([...result.series.keys()], ["72030"]);
    assert.equal(result.series.get("72030")!.length, 2);
    assert.deepEqual(result.missingCodes, []);
    assert.equal(result.datesScanned, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testIngestedDatesAreSorted(): void {
  // 系列の時系列順は listIngestedDates の昇順に依存している。
  //
  // 注: macOS の readdirSync は実測でソート済みを返すため、この検査は
  // 「ソートを消しても落ちない」等価変異になる。それでも契約は契約なので
  // 明示しておく（readdir 順に依存しない FS へ移したときの防波堤）。
  const root = makeStore({
    "2025-09-03": [record("72030", "2025-09-03", 3)],
    "2025-09-01": [record("72030", "2025-09-01", 1)],
    "2025-12-31": [record("72030", "2025-12-31", 9)],
    "2025-09-10": [record("72030", "2025-09-10", 5)],
  });
  try {
    assert.deepEqual(listIngestedDates(root),
      ["2025-09-01", "2025-09-03", "2025-09-10", "2025-12-31"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testStringFieldCannotImpersonateTheCodeField(): void {
  // 篩（文字列一致）が安全である根拠を固定する。
  //
  // JSON.stringify は文字列値の中の `"` を `\"` にエスケープするので、
  // `"code":"13060"` という並びは「本物の code フィールド」としてしか
  // 行に現れない。文字列値が code フィールドになりすますことはできない。
  // この性質が崩れたら（保存形式を変えたら）、別会社の値段が要求した銘柄の
  // 系列に紛れ込み、検証が静かに嘘になる。
  const foreign = record("99840", "2025-09-01", 500);
  foreign.ingestionRunId = 'run-containing-"code":"13060"-by-accident';

  const root = makeStore({ "2025-09-01": [foreign] });
  try {
    const result = loadSeriesForCodes({ codes: ["13060"], root });
    assert.equal(result.series.get("13060")!.length, 0, "文字列値が code になりすませてはいけない");
    assert.deepEqual(result.missingCodes, ["13060"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testSeriesIsChronological(): void {
  // 日付ファイルの読み順に依存させない。
  const root = makeStore({
    "2025-09-03": [record("72030", "2025-09-03", 203)],
    "2025-09-01": [record("72030", "2025-09-01", 201)],
    "2025-09-02": [record("72030", "2025-09-02", 202)],
  });
  try {
    const result = loadSeriesForCodes({ codes: ["72030"], root });
    assert.deepEqual(
      result.series.get("72030")!.map((value) => value.tradingDate),
      ["2025-09-01", "2025-09-02", "2025-09-03"],
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testMissingCodesAreReportedNotSilentlyEmpty(): void {
  // ここが篩の安全装置。形式が変わって全部すり抜けても、空系列を「データ無し」
  // として黙って返さず、呼び出し側が fail closed できるようにする。
  const root = makeStore({ "2025-09-01": [record("13060", "2025-09-01", 100)] });
  try {
    const result = loadSeriesForCodes({ codes: ["13060", "99999"], root });
    assert.deepEqual(result.missingCodes, ["99999"]);
    assert.equal(result.series.get("99999")!.length, 0);
    assert.equal(result.series.get("13060")!.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testDateRangeIncludesBoundaries(): void {
  const root = makeStore({
    "2025-09-01": [record("72030", "2025-09-01", 1)],
    "2025-09-02": [record("72030", "2025-09-02", 2)],
    "2025-09-03": [record("72030", "2025-09-03", 3)],
    "2025-09-04": [record("72030", "2025-09-04", 4)],
  });
  try {
    const result = loadSeriesForCodes({ codes: ["72030"], from: "2025-09-02", to: "2025-09-03", root });
    assert.deepEqual(
      result.series.get("72030")!.map((value) => value.tradingDate),
      ["2025-09-02", "2025-09-03"],
      "from と to の当日を含む",
    );
    assert.equal(result.datesScanned, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testUniverseExcludesNonTradedRows(): void {
  // 板が立たなかった行をユニバースに入れると、対照群に売買できない銘柄が混ざる。
  const root = makeStore({
    "2025-09-01": [
      record("13060", "2025-09-01", 100),
      record("99999", "2025-09-01", 0, "missing"),
      record("72030", "2025-09-01", 200),
    ],
  });
  try {
    assert.deepEqual(universeOn("2025-09-01", root), ["13060", "72030"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testListIngestedDatesIgnoresPartials(): void {
  const root = makeStore({ "2025-09-01": [record("13060", "2025-09-01", 100)] });
  try {
    writeFileSync(resolve(root, "2025-09-02.jsonl.partial"), "{broken\n");
    writeFileSync(resolve(root, "_ingest-log.jsonl"), "{}\n");
    assert.deepEqual(listIngestedDates(root), ["2025-09-01"], "書きかけと台帳は日付ではない");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function testMissingStoreIsEmptyNotError(): void {
  const root = resolve(tmpdir(), "jq-daily-store-does-not-exist");
  assert.deepEqual(listIngestedDates(root), []);
  assert.deepEqual(readDateRecords("2025-09-01", root), []);
}

function testInvalidCodeFailsClosed(): void {
  assert.throws(() => loadSeriesForCodes({ codes: ["abc"] }), /invalid security code/);
  assert.throws(() => loadSeriesForCodes({ codes: ["1306"], from: "2025-09-05", to: "2025-09-01" }),
    /from must be on or before to/);
}

function testCorruptLineFailsClosed(): void {
  // 壊れた行を黙って飛ばすと、欠損に気づかないまま検証が進む。
  const root = mkdtempSync(resolve(tmpdir(), "jq-daily-store-"));
  try {
    writeFileSync(resolve(root, "2025-09-01.jsonl"), '{"code":"13060"\n');
    assert.throws(() => readDateRecords("2025-09-01", root), /JSON を解析できません/);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

testNeedleDoesNotMatchLongerCode();
testLoadSeriesPicksOnlyRequestedCodes();
testIngestedDatesAreSorted();
testStringFieldCannotImpersonateTheCodeField();
testSeriesIsChronological();
testMissingCodesAreReportedNotSilentlyEmpty();
testDateRangeIncludesBoundaries();
testUniverseExcludesNonTradedRows();
testListIngestedDatesIgnoresPartials();
testMissingStoreIsEmptyNotError();
testInvalidCodeFailsClosed();
testCorruptLineFailsClosed();

console.log("jquants-daily-store: 全テスト成功");
