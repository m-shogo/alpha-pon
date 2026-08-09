import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runBacktest, type BacktestSpec, type PriceSeries } from "../../src/research/backtest.js";
import { aggregate, computeCosts, computeNetAlpha, falseDiscoveryGuard } from "../../src/research/net-alpha.js";

function series(code: string, closes: number[], volume = 1_000_000): PriceSeries {
  const dates = [
    "2024-01-04", "2024-01-05", "2024-01-09", "2024-01-10", "2024-01-11",
    "2024-01-12", "2024-01-15", "2024-01-16", "2024-01-17", "2024-01-18",
  ];
  return {
    code,
    bars: closes.map((close, index) => {
      const open = index === 0 ? close : closes[index - 1];
      return {
        date: dates[index],
        open,
        high: Math.max(open, close) + 10,
        low: Math.min(open, close) - 10,
        close,
        volume,
      };
    }),
  };
}

const BASE_SPEC: BacktestSpec = {
  schemaVersion: 1,
  id: "test-spec",
  edgeId: "test-edge",
  side: "long",
  entry: { mode: "next_open" },
  exit: { mode: "holding_period", holdingPeriodDays: 2 },
  costs: { commissionBps: 2, spreadBps: 8, slippageBps: 5 },
  liquidity: { participationLimitPct: 5 },
};

function testCostsCountBothLegs() {
  const costs = computeCosts({ commissionBps: 2, spreadBps: 8, slippageBps: 5 }, {
    side: "long",
    holdingDays: 5,
    participationPct: 0,
  });
  assert.equal(costs.commissionBps, 4, "手数料は往復2回");
  assert.equal(costs.spreadBps, 8, "スプレッドは片道半値幅 × 2");
  assert.equal(costs.slippageBps, 10);
  assert.equal(costs.borrowCostBps, 0, "ロングに借株コストは付かない");
  assert.equal(costs.totalBps, 22);
  console.log("research/backtest: コスト計上 OK");
}

function testBorrowCostAppliesToShortOnly() {
  const model = { commissionBps: 0, spreadBps: 0, slippageBps: 0, borrowCostAnnualBps: 365 };
  const short = computeCosts(model, { side: "short", holdingDays: 10, participationPct: 0 });
  assert.equal(Math.round(short.borrowCostBps), 10, "年率365bps を10日保有 = 約10bps");
  const long = computeCosts(model, { side: "long", holdingDays: 10, participationPct: 0 });
  assert.equal(long.borrowCostBps, 0);
  console.log("research/backtest: 借株コスト OK");
}

function testNetAlphaSubtractsBenchmarkAndCosts() {
  const result = computeNetAlpha({
    grossReturnBps: 300,
    benchmarkReturnBps: 100,
    costs: computeCosts({ commissionBps: 2, spreadBps: 8, slippageBps: 5 }, {
      side: "long",
      holdingDays: 5,
      participationPct: 0,
    }),
  });
  assert.equal(result.grossAlphaBps, 200);
  assert.equal(result.netAlphaBps, 178, "超過リターンからコストを引く");
  console.log("research/backtest: Net Alpha 計算 OK");
}

function testEntryUsesNextOpenAfterObservation() {
  const prices = new Map([["9001", series("9001", [1000, 1010, 1020, 1030, 1040])]]);
  const report = runBacktest(
    BASE_SPEC,
    [{ id: "s1", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" }],
    prices,
  );
  const trade = report.trades[0];
  assert.equal(trade.executable, true);
  assert.equal(trade.entryDate, "2024-01-05", "観測の翌営業日");
  assert.equal(trade.entryPrice, 1000, "翌営業日の寄付（= 前日終値を open に置いたフィクスチャ）");
  assert.equal(trade.exitDate, "2024-01-10", "保有2営業日後");
  console.log("research/backtest: エントリー/エグジット OK");
}

function testSameCloseAfterMarketIsPitViolation() {
  const prices = new Map([["9001", series("9001", [1000, 1010, 1020, 1030, 1040])]]);
  const spec: BacktestSpec = { ...BASE_SPEC, entry: { mode: "same_close" } };
  const report = runBacktest(spec, [{ id: "s1", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" }], prices);
  assert.equal(report.trades[0].skipReason, "pit_violation_same_close", "引け後の開示で当日引け約定はできない");
  assert.equal(report.executedCount, 0);
  console.log("research/backtest: PIT 違反の遮断 OK");
}

function testLiquidityLimitBlocksExecution() {
  const prices = new Map([["9001", series("9001", [1000, 1010, 1020, 1030, 1040], 1_000)]]);
  const spec: BacktestSpec = { ...BASE_SPEC, notionalJpy: 100_000_000 };
  const report = runBacktest(spec, [{ id: "s1", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" }], prices);
  assert.equal(report.trades[0].skipReason, "liquidity_participation_exceeded", "出来高を超える執行は落とす");
  console.log("research/backtest: Liquidity 制約 OK");
}

function testShortSideFlipsSign() {
  const prices = new Map([["9001", series("9001", [1000, 1000, 900, 900, 900])]]);
  const spec: BacktestSpec = { ...BASE_SPEC, side: "short" };
  const report = runBacktest(spec, [{ id: "s1", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" }], prices);
  assert.ok((report.trades[0].grossReturnBps ?? 0) > 0, "下落局面のショートはプラス");
  console.log("research/backtest: ショートの符号 OK");
}

function testStopLossTriggers() {
  const prices = new Map([["9001", series("9001", [1000, 1000, 800, 900, 900])]]);
  const spec: BacktestSpec = {
    ...BASE_SPEC,
    exit: { mode: "stop_or_period", holdingPeriodDays: 3, stopLossBps: 500 },
  };
  const report = runBacktest(spec, [{ id: "s1", code: "9001", observedAt: "2024-01-04T16:00:00+09:00" }], prices);
  assert.equal(report.trades[0].stopped, true, "逆行でストップが作動する");
  assert.equal(Math.round(report.trades[0].grossReturnBps ?? 0), -500);
  console.log("research/backtest: ストップロス OK");
}

function testEventResolutionCannotPrecedeEntry() {
  const prices = new Map([["9001", series("9001", [1000, 1010, 1020, 1030, 1040])]]);
  const spec: BacktestSpec = { ...BASE_SPEC, exit: { mode: "event_resolution" } };

  const impossible = runBacktest(spec, [{
    id: "resolved-before-entry",
    code: "9001",
    observedAt: "2024-01-09T16:00:00+09:00",
    resolutionDate: "2024-01-05",
  }], prices);
  assert.equal(impossible.executedCount, 0);
  assert.equal(impossible.trades[0]?.skipReason, "resolution_before_entry");
  assert.equal(impossible.trades[0]?.holdingDays, undefined);

  const sameDay = runBacktest(spec, [{
    id: "resolved-on-entry-day",
    code: "9001",
    observedAt: "2024-01-09T16:00:00+09:00",
    resolutionDate: "2024-01-10",
  }], prices);
  assert.equal(sameDay.executedCount, 1, "entry当日のresolutionは既存仕様どおり許可する");
  assert.equal(sameDay.trades[0]?.holdingDays, 0);
  console.log("research/backtest: event resolution cannot exit before entry OK");
}

function testTemporalInputsFailClosed() {
  const validSeries = series("9001", [1000, 1010, 1020, 1030, 1040]);
  const validPrices = new Map([["9001", validSeries]]);

  assert.throws(
    () => runBacktest(BASE_SPEC, [{ id: "implicit", code: "9001", observedAt: "2024-01-04T16:00:00" }], validPrices),
    /explicit timezone/,
  );
  assert.throws(
    () => runBacktest(BASE_SPEC, [{
      id: "bad-resolution",
      code: "9001",
      observedAt: "2024-01-04T16:00:00+09:00",
      resolutionDate: "2024-02-31",
    }], validPrices),
    /resolutionDate must be a real YYYY-MM-DD date/,
  );

  const invalidDateSeries = structuredClone(validSeries);
  invalidDateSeries.bars[1]!.date = "2024-02-31";
  assert.throws(
    () => runBacktest(BASE_SPEC, [], new Map([["9001", invalidDateSeries]])),
    /bars\[1\]\.date must be a real YYYY-MM-DD date/,
  );

  const duplicateDateSeries = structuredClone(validSeries);
  duplicateDateSeries.bars[1]!.date = duplicateDateSeries.bars[0]!.date;
  assert.throws(
    () => runBacktest(BASE_SPEC, [], new Map([["9001", duplicateDateSeries]])),
    /strictly increasing by date without duplicates/,
  );

  assert.throws(
    () => runBacktest(BASE_SPEC, [], new Map([["9999", validSeries]])),
    /price map key 9999 must match series\.code 9001/,
  );
  console.log("research/backtest: temporal and series identity inputs fail closed OK");
}

function testPriceBarSemanticsFailClosed() {
  const validSeries = series("9001", [1000, 1010, 1020, 1030, 1040]);
  const expectRejected = (
    mutate: (invalid: PriceSeries) => void,
    pattern: RegExp,
  ) => {
    const invalid = structuredClone(validSeries);
    mutate(invalid);
    assert.throws(() => runBacktest(BASE_SPEC, [], new Map([["9001", invalid]])), pattern);
  };

  expectRejected((invalid) => { invalid.bars[0]!.close = Number.NaN; }, /close must be a finite positive price/);
  expectRejected((invalid) => { invalid.bars[0]!.open = 0; }, /open must be a finite positive price/);
  expectRejected((invalid) => { invalid.bars[0]!.high = Number.POSITIVE_INFINITY; }, /high must be a finite positive price/);
  expectRejected((invalid) => {
    Object.assign(invalid.bars[0]!, { open: 1000, low: 990, close: 1010, high: 1005 });
  }, /high must be greater than or equal to open\/low\/close/);
  expectRejected((invalid) => {
    Object.assign(invalid.bars[0]!, { open: 1000, close: 1010, high: 1200, low: 1100 });
  }, /low must be less than or equal to open\/high\/close/);
  expectRejected((invalid) => { invalid.bars[0]!.volume = -1; }, /volume must be a non-negative safe integer/);
  expectRejected((invalid) => { invalid.bars[0]!.volume = 1.5; }, /volume must be a non-negative safe integer/);

  const invalidBenchmark = series("TOPIX", [2000, 2010, 2020, 2030, 2040]);
  invalidBenchmark.bars[0]!.close = Number.NaN;
  assert.throws(
    () => runBacktest(BASE_SPEC, [], new Map([["9001", validSeries]]), invalidBenchmark),
    /backtest benchmark TOPIX\.bars\[0\]\.close must be a finite positive price/,
  );
  console.log("research/backtest: malformed OHLC and volume inputs fail closed OK");
}

function testSignalOrderingUsesActualInstant() {
  const prices = new Map([["9001", series("9001", [1000, 1010, 1020, 1030, 1040])]]);
  const report = runBacktest(BASE_SPEC, [
    { id: "later-instant", code: "9001", observedAt: "2024-01-04T08:00:00-05:00" },
    { id: "earlier-instant", code: "9001", observedAt: "2024-01-04T15:00:00+09:00" },
  ], prices);
  assert.deepEqual(
    report.trades.map((trade) => trade.signalId),
    ["earlier-instant", "later-instant"],
    "offset表現の文字列順ではなく実instant順に並べる",
  );
  console.log("research/backtest: signal ordering uses actual instant OK");
}

function testAggregateAndFalseDiscoveryGuard() {
  const stats = aggregate([100, -50, 200, 0]);
  assert.equal(stats.count, 4);
  assert.equal(stats.meanNetAlphaBps, 62.5);
  assert.equal(stats.hitRate, 0.5);
  assert.equal(stats.worstBps, -50);

  const guard = falseDiscoveryGuard(2.2, 20);
  assert.equal(guard.passed, false, "20回試したなら |t|=2.2 では足りない");
  assert.equal(falseDiscoveryGuard(null, 1).passed, false, "サンプル不足は PASS しない");
  console.log("research/backtest: 集計と False Discovery Guard OK");
}

function testFixtureBundleIsReproducible() {
  const bundle = JSON.parse(readFileSync("research/fixtures/backtests/synthetic-known-bad-event.json", "utf-8"));
  const prices = new Map<string, PriceSeries>(bundle.prices.map((s: PriceSeries) => [s.code, s]));
  const first = runBacktest(bundle.spec, bundle.signals, prices, bundle.benchmark);
  const second = runBacktest(bundle.spec, bundle.signals, prices, bundle.benchmark);
  assert.deepEqual(first, second, "同じ入力なら同じ結果（CI で回せる）");
  assert.equal(first.executedCount, 2);
  assert.equal(first.skipped[0].reason, "liquidity_adtv_too_low");
  console.log("research/backtest: フィクスチャの再現性 OK");
}

testCostsCountBothLegs();
testBorrowCostAppliesToShortOnly();
testNetAlphaSubtractsBenchmarkAndCosts();
testEntryUsesNextOpenAfterObservation();
testSameCloseAfterMarketIsPitViolation();
testLiquidityLimitBlocksExecution();
testShortSideFlipsSign();
testStopLossTriggers();
testEventResolutionCannotPrecedeEntry();
testTemporalInputsFailClosed();
testPriceBarSemanticsFailClosed();
testSignalOrderingUsesActualInstant();
testAggregateAndFalseDiscoveryGuard();
testFixtureBundleIsReproducible();

console.log("research/backtest: 全テスト成功");
