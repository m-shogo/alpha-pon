// 保存した価格と API の生の返答の突き合わせテスト。
//
// `verify-price-store-integrity` はストアの中だけを見る（重複・日付混入・
// hardening 違反）。それだけでは「取り込みの変換が間違っている」形の
// 壊れ方を見つけられない。
//
// 守りたい性質:
//   1. OHLCV の値そのものを比べる
//   2. **両方向を見る**。API にあってストアに無い／その逆、どちらも差分
//   3. 「板が立たなかった」を traded にしていないか／その逆も見る
//      （片方だけだと「全部 missing にする」変換が通る）

import assert from "node:assert/strict";
import { diffStoreAgainstApi } from "../src/research/providers/jquants-store-api-diff.js";
import type { DailyQuote } from "../src/fetcher/jquants.js";
import type { PitPriceRecord } from "../src/research/price-store.js";

const DATE = "2025-09-17";

function quote(over: Partial<DailyQuote> = {}): DailyQuote {
  return {
    Code: "72030", Date: "20250917",
    Open: 3000, High: 3050, Low: 2980, Close: 3020, Volume: 1_000_000,
    AdjustmentFactor: 1, AdjustmentClose: 3020, AdjustmentVolume: 1_000_000,
    ...over,
  };
}

function record(over: Partial<PitPriceRecord> = {}): PitPriceRecord {
  return {
    schemaVersion: 1, seriesKind: "security", code: "72030", market: "TSE",
    tradingDate: DATE, dataAsOf: `${DATE}T15:30:00+09:00`,
    observedAt: `${DATE}T23:59:59.999999999+09:00`,
    retrievedAt: "2026-09-01T00:00:00.000Z", firstExecutableAt: "2026-09-01T00:00:00.000Z",
    source: "jquants", sourceVersion: "v1", providerPlan: "free",
    delayDays: 84, isDelayed: true, ingestionRunId: "t", currency: "JPY",
    status: "traded",
    ohlcv: { open: 3000, high: 3050, low: 2980, close: 3020, volume: 1_000_000 },
    adjusted: false, adjustmentFactor: 1, corporateActions: [],
    license: "local_only", contentHash: "h",
    ...over,
  };
}

function diff(apiQuotes: DailyQuote[], storedRecords: PitPriceRecord[]) {
  return diffStoreAgainstApi({ tradingDate: DATE, apiQuotes, storedRecords });
}

function testMatchingDataHasNoDifference(): void {
  const report = diff([quote()], [record()]);
  assert.deepEqual(report.differences, []);
  assert.equal(report.comparedCount, 1);
}

function testValueMismatchIsReported(): void {
  const report = diff([quote()], [record({
    ohlcv: { open: 3000, high: 3050, low: 2980, close: 9999, volume: 1_000_000 },
  })]);
  assert.equal(report.differences.length, 1);
  assert.equal(report.differences[0]!.field, "close");
  assert.equal(report.differences[0]!.stored, "9999");
  assert.equal(report.differences[0]!.api, "3020");
}

function testVolumeMismatchIsReported(): void {
  const report = diff([quote()], [record({
    ohlcv: { open: 3000, high: 3050, low: 2980, close: 3020, volume: 42 },
  })]);
  assert.equal(report.differences[0]!.field, "volume");
}

function testMissingStoredRowIsReported(): void {
  const report = diff([quote()], []);
  assert.equal(report.differences[0]!.field, "row");
  assert.equal(report.differences[0]!.stored, "(なし)");
}

function testExtraStoredRowIsReported(): void {
  // 逆向き。API に無い行がストアにあるのは別の日の行が混ざった可能性。
  const report = diff([], [record()]);
  assert.equal(report.differences[0]!.field, "row");
  assert.equal(report.differences[0]!.api, "(なし)");
}

function testNoBarMustNotBeTraded(): void {
  // API が値を持たないのに traded で保存されている。
  const report = diff([quote({ Open: 0, High: 0, Low: 0, Close: 0, Volume: 0 })], [record()]);
  assert.equal(report.differences[0]!.field, "status");
  assert.equal(report.differences[0]!.api, "値なし");
}

function testBarMustNotBeMarkedNotTraded(): void {
  // 逆向き。API に値があるのに no_trade で保存されている。
  // これを見ないと「全部 missing にする」変換が素通りする。
  const report = diff([quote()], [record({
    status: "no_trade", missingReason: "no_execution", ohlcv: undefined,
  })]);
  assert.equal(report.differences[0]!.field, "status");
  assert.equal(report.differences[0]!.api, "値あり");
}

function testNoBarAndNotTradedIsFine(): void {
  const report = diff([quote({ Open: 0, High: 0, Low: 0, Close: 0, Volume: 0 })], [record({
    status: "no_trade", missingReason: "no_execution", ohlcv: undefined,
  })]);
  assert.deepEqual(report.differences, []);
  assert.equal(report.comparedCount, 0, "値の無い行は OHLCV 照合に数えない");
}

function testForeignTradingDateIsReported(): void {
  const report = diff([quote()], [record({ tradingDate: "2025-09-16" })]);
  assert.equal(report.differences[0]!.field, "tradingDate");
}

function testDifferencesAreOrdered(): void {
  const report = diff(
    [quote({ Code: "99840" }), quote({ Code: "13060" })],
    [],
  );
  assert.deepEqual(report.differences.map((one) => one.code), ["13060", "99840"]);
}

testMatchingDataHasNoDifference();
testValueMismatchIsReported();
testVolumeMismatchIsReported();
testMissingStoredRowIsReported();
testExtraStoredRowIsReported();
testNoBarMustNotBeTraded();
testBarMustNotBeMarkedNotTraded();
testNoBarAndNotTradedIsFine();
testForeignTradingDateIsReported();
testDifferencesAreOrdered();

console.log("jquants-store-api-diff: 全テスト成功");
