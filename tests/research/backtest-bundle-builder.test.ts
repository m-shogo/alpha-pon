import assert from "node:assert/strict";
import type { BacktestSignal, BacktestSpec } from "../../src/research/backtest.js";
import { withPriceRecordHash, type PitPriceRecord } from "../../src/research/price-store.js";
import {
  buildBacktestBundle,
  type BundleSourceSelector,
} from "../../src/research/signals/backtest-bundle.js";

const SELECTOR: BundleSourceSelector = {
  market: "TSE",
  source: "jquants-free",
  providerPlan: "free",
};

const AS_OF = "2026-06-01T00:00:00+09:00";

function record(over: {
  code: string;
  tradingDate: string;
  close?: number;
  seriesKind?: "security" | "benchmark";
  observedAt?: string;
  firstExecutableAt?: string;
  retrievedAt?: string;
  status?: PitPriceRecord["status"];
  source?: string;
}): PitPriceRecord {
  const close = over.close ?? 1000;
  const stamp = `${over.tradingDate}T15:30:00+09:00`;
  const base = {
    schemaVersion: 1 as const,
    seriesKind: over.seriesKind ?? ("security" as const),
    code: over.code,
    market: "TSE",
    tradingDate: over.tradingDate,
    dataAsOf: stamp,
    observedAt: over.observedAt ?? stamp,
    retrievedAt: over.retrievedAt ?? stamp,
    firstExecutableAt: over.firstExecutableAt ?? stamp,
    source: over.source ?? "jquants-free",
    sourceVersion: "jquants-free-unadjusted-v1",
    providerPlan: "free" as const,
    delayDays: 84,
    isDelayed: true,
    ingestionRunId: "test-run",
    currency: "JPY",
    status: over.status ?? ("traded" as const),
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: "local_only" as const,
    ...(over.status === "missing"
      ? { missingReason: "provider_gap" as const }
      : { ohlcv: { open: close, high: close + 5, low: close - 5, close, volume: 1_000_000 } }),
  };
  return withPriceRecordHash(base);
}

function securityRecords(code: string, dates: string[]): PitPriceRecord[] {
  return dates.map((date, index) => record({ code, tradingDate: date, close: 1000 + index }));
}

function spec(over: Partial<BacktestSpec> = {}): BacktestSpec {
  return {
    schemaVersion: 1,
    id: "bundle-test-spec",
    edgeId: "earnings-gap-overreaction",
    side: "long",
    notionalJpy: 1_000_000,
    entry: { mode: "next_open" },
    exit: { mode: "holding_period", holdingPeriodDays: 2 },
    costs: { commissionBps: 2, spreadBps: 8, slippageBps: 5 },
    liquidity: { participationLimitPct: 5 },
    ...over,
  };
}

const DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];

function signal(id: string, code: string): BacktestSignal {
  return { id, code, observedAt: "2026-01-06T15:30:00+09:00" };
}

function testBuildsBundleForReferencedCodesOnly() {
  const result = buildBacktestBundle({
    spec: spec(),
    signals: [signal("s-1", "1111")],
    securityRecords: new Map([
      ["1111", securityRecords("1111", DATES)],
      ["2222", securityRecords("2222", DATES)],
    ]),
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.equal(result.bundle.prices.length, 1, "signal が参照しない code は載せない");
  assert.equal(result.bundle.prices[0].code, "1111");
  assert.equal(result.bundle.prices[0].bars.length, 4);
  assert.equal(result.includedSignalCount, 1);
  assert.equal(result.excluded.length, 0);
}

function testMissingPriceRecordsAreReportedNotDropped() {
  const result = buildBacktestBundle({
    spec: spec(),
    signals: [signal("s-1", "1111"), signal("s-2", "9999")],
    securityRecords: new Map([["1111", securityRecords("1111", DATES)]]),
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.equal(result.bundle.signals.length, 2, "signal は落とさない。母集団を保つ");
  assert.deepEqual(result.excluded, [{ code: "9999", reason: "no_price_records", signalIds: ["s-2"] }]);
  assert.equal(result.includedSignalCount, 1);
}

function testAsOfExcludesRecordsNotYetExecutable() {
  // firstExecutableAt が asOf より後の行は Backtest へ渡さない。
  const records = [
    record({ code: "1111", tradingDate: "2026-01-05" }),
    record({
      code: "1111",
      tradingDate: "2026-01-06",
      firstExecutableAt: "2027-01-01T09:00:00+09:00",
    }),
  ];
  const result = buildBacktestBundle({
    spec: spec(),
    signals: [signal("s-1", "1111")],
    securityRecords: new Map([["1111", records]]),
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.equal(result.bundle.prices[0].bars.length, 1, "実行可能になっていない行は除外される");
  assert.equal(result.bundle.prices[0].bars[0].date, "2026-01-05");
}

function testNonTradedRecordsAreNotBars() {
  const records = [
    record({ code: "1111", tradingDate: "2026-01-05" }),
    record({ code: "1111", tradingDate: "2026-01-06", status: "missing" }),
  ];
  const result = buildBacktestBundle({
    spec: spec(),
    signals: [signal("s-1", "1111")],
    securityRecords: new Map([["1111", records]]),
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.equal(result.bundle.prices[0].bars.length, 1, "missing は bar にしない（forward fill もしない）");
}

function testAllRecordsFilteredOutIsReported() {
  const records = [
    record({ code: "1111", tradingDate: "2026-01-05", firstExecutableAt: "2027-01-01T09:00:00+09:00" }),
  ];
  const result = buildBacktestBundle({
    spec: spec(),
    signals: [signal("s-1", "1111")],
    securityRecords: new Map([["1111", records]]),
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.deepEqual(result.excluded, [{ code: "1111", reason: "no_executable_bars", signalIds: ["s-1"] }]);
  assert.equal(result.bundle.prices.length, 0);
}

function testBenchmarkIsAttachedWhenDeclared() {
  const benchmark = DATES.map((date, index) =>
    record({ code: "1306", tradingDate: date, close: 2000 + index, seriesKind: "benchmark" }),
  );
  const result = buildBacktestBundle({
    spec: spec({ benchmark: "1306" }),
    signals: [signal("s-1", "1111")],
    securityRecords: new Map([["1111", securityRecords("1111", DATES)]]),
    benchmarkRecords: benchmark,
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.ok(result.bundle.benchmark, "benchmark が載る");
  assert.equal(result.bundle.benchmark?.code, "1306");
  assert.equal(result.bundle.benchmark?.bars.length, 4);
}

function testDeclaredBenchmarkWithoutRecordsFailsClosed() {
  assert.throws(
    () =>
      buildBacktestBundle({
        spec: spec({ benchmark: "1306" }),
        signals: [signal("s-1", "1111")],
        securityRecords: new Map([["1111", securityRecords("1111", DATES)]]),
        asOf: AS_OF,
        selector: SELECTOR,
      }),
    /no benchmark price records were provided/,
    "benchmark を宣言したのに系列が無いなら止める",
  );
}

function testBenchmarkWithoutExecutableBarsFailsClosed() {
  const benchmark = [
    record({
      code: "1306",
      tradingDate: "2026-01-05",
      seriesKind: "benchmark",
      firstExecutableAt: "2027-01-01T09:00:00+09:00",
    }),
  ];
  assert.throws(
    () =>
      buildBacktestBundle({
        spec: spec({ benchmark: "1306" }),
        signals: [signal("s-1", "1111")],
        securityRecords: new Map([["1111", securityRecords("1111", DATES)]]),
        benchmarkRecords: benchmark,
        asOf: AS_OF,
        selector: SELECTOR,
      }),
    /refusing to report unadjusted returns/,
    "benchmark 調整できないなら黙って素のリターンを返さない",
  );
}

function testBenchmarkRecordsWithoutSpecFailsClosed() {
  assert.throws(
    () =>
      buildBacktestBundle({
        spec: spec(),
        signals: [signal("s-1", "1111")],
        securityRecords: new Map([["1111", securityRecords("1111", DATES)]]),
        benchmarkRecords: [record({ code: "1306", tradingDate: "2026-01-05", seriesKind: "benchmark" })],
        asOf: AS_OF,
        selector: SELECTOR,
      }),
    /spec.benchmark is not set/,
  );
}

function testDuplicateSignalIdFailsClosed() {
  assert.throws(
    () =>
      buildBacktestBundle({
        spec: spec(),
        signals: [signal("s-1", "1111"), signal("s-1", "2222")],
        securityRecords: new Map([["1111", securityRecords("1111", DATES)]]),
        asOf: AS_OF,
        selector: SELECTOR,
      }),
    /signal id must be unique/,
  );
}

function testMixedProviderSeriesFailsClosed() {
  // 同じ日に複数 source の価格があるとき、selector で一意化できなければ止まる。
  const records = [
    record({ code: "1111", tradingDate: "2026-01-05", source: "jquants-free" }),
    record({ code: "1111", tradingDate: "2026-01-05", source: "other-provider" }),
  ];
  const result = buildBacktestBundle({
    spec: spec(),
    signals: [signal("s-1", "1111")],
    securityRecords: new Map([["1111", records]]),
    asOf: AS_OF,
    selector: SELECTOR,
  });
  assert.equal(result.bundle.prices[0].bars.length, 1, "selector.source で一意化される");
}

function testOutputIsDeterministic() {
  const input = {
    spec: spec(),
    signals: [signal("s-2", "2222"), signal("s-1", "1111")],
    securityRecords: new Map([
      ["1111", securityRecords("1111", DATES)],
      ["2222", securityRecords("2222", DATES)],
    ]),
    asOf: AS_OF,
    selector: SELECTOR,
  };
  const first = buildBacktestBundle(input);
  const second = buildBacktestBundle(input);
  assert.equal(JSON.stringify(first.bundle), JSON.stringify(second.bundle), "同じ入力で同じ出力");
  assert.deepEqual(first.bundle.signals.map((one) => one.id), ["s-1", "s-2"], "signal は id 昇順");
  assert.deepEqual(first.bundle.prices.map((one) => one.code), ["1111", "2222"], "price は code 昇順");
}

testBuildsBundleForReferencedCodesOnly();
testMissingPriceRecordsAreReportedNotDropped();
testAsOfExcludesRecordsNotYetExecutable();
testNonTradedRecordsAreNotBars();
testAllRecordsFilteredOutIsReported();
testBenchmarkIsAttachedWhenDeclared();
testDeclaredBenchmarkWithoutRecordsFailsClosed();
testBenchmarkWithoutExecutableBarsFailsClosed();
testBenchmarkRecordsWithoutSpecFailsClosed();
testDuplicateSignalIdFailsClosed();
testMixedProviderSeriesFailsClosed();
testOutputIsDeterministic();

console.log("research/backtest-bundle-builder: 全テスト成功");
