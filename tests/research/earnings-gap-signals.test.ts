import assert from "node:assert/strict";
import { runBacktest, type BacktestSpec, type PriceBar, type PriceSeries } from "../../src/research/backtest.js";
import {
  corporateActionDatesFromPriceRecords,
  generateEarningsGapSignals,
  type EarningsDisclosureInput,
  type EarningsGapParams,
} from "../../src/research/signals/earnings-gap.js";

const DATES = [
  "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
  "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16", "2026-01-19",
];

/** closes から bars を作る。open は前日終値（ギャップなし）を既定にし、必要な日だけ上書きする。 */
function series(code: string, closes: number[], openOverrides: Record<number, number> = {}): PriceSeries {
  const bars: PriceBar[] = closes.map((close, index) => {
    const open = openOverrides[index] ?? (index === 0 ? close : closes[index - 1]);
    return {
      date: DATES[index],
      open,
      high: Math.max(open, close) + 5,
      low: Math.min(open, close) - 5,
      close,
      volume: 2_000_000,
    };
  });
  return { code, bars };
}

/** 2026-01-07 に -10% するシリーズ。反応日は index 2。 */
function gapSeries(code = "1234"): PriceSeries {
  return series(code, [1000, 1000, 900, 905, 910, 915, 920, 925, 930, 935]);
}

function priceMap(...all: PriceSeries[]): Map<string, PriceSeries> {
  return new Map(all.map((one) => [one.code, one]));
}

function disclosure(over: Partial<EarningsDisclosureInput> = {}): EarningsDisclosureInput {
  return {
    code: "1234",
    disclosedDate: "2026-01-06",
    disclosedTime: "15:00",
    forecastOperatingProfit: 100,
    typeOfDocument: "FYFinancialStatements_Consolidated_JP",
    ...over,
  };
}

const NO_ACTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map();
const PARAMS: EarningsGapParams = {
  gapThresholdPct: -7,
  requireForecastNotCut: true,
  corporateActionDates: NO_ACTIONS,
};
const NO_FORECAST_CHECK: EarningsGapParams = {
  gapThresholdPct: -7,
  requireForecastNotCut: false,
  corporateActionDates: NO_ACTIONS,
};

function testGeneratesSignalOnDeepGap() {
  const result = generateEarningsGapSignals([disclosure()], priceMap(gapSeries()), NO_FORECAST_CHECK);
  assert.equal(result.signals.length, 1, "閾値を超える下落で1件生成される");
  const [signal] = result.signals;
  assert.equal(signal.id, "eg-1234-2026-01-07");
  assert.equal(signal.code, "1234");
  assert.equal(signal.observedAt, "2026-01-07T15:30:00+09:00", "observedAt は反応日の引け");

  const [candidate] = result.candidates;
  assert.equal(candidate.reactionDate, "2026-01-07");
  assert.equal(candidate.priorCloseDate, "2026-01-06");
  assert.equal(candidate.priorClose, 1000);
  assert.equal(candidate.reactionClose, 900);
  assert.equal(candidate.gapPct, -10);
}

function testIntradayDisclosureDoesNotUseSameDayMove() {
  // 場中(11:00)の開示でも、当日の値動きは使わず翌営業日を反応日にする。
  const intraday = generateEarningsGapSignals(
    [disclosure({ disclosedTime: "11:00" })],
    priceMap(gapSeries()),
    NO_FORECAST_CHECK,
  );
  const afterClose = generateEarningsGapSignals([disclosure()], priceMap(gapSeries()), NO_FORECAST_CHECK);
  assert.deepEqual(
    intraday.candidates[0].reactionDate,
    afterClose.candidates[0].reactionDate,
    "場中開示と引け後開示で反応日が変わってはいけない",
  );
  assert.equal(intraday.candidates[0].reactionDate, "2026-01-07");
}

function testEntryIsTheDayAfterReaction() {
  // observedAt が反応日の引けなので、next_open は反応日の翌営業日の寄付になる。
  const result = generateEarningsGapSignals([disclosure()], priceMap(gapSeries()), NO_FORECAST_CHECK);
  const spec: BacktestSpec = {
    schemaVersion: 1,
    id: "eg-test",
    edgeId: "earnings-gap-overreaction",
    side: "long",
    entry: { mode: "next_open" },
    exit: { mode: "holding_period", holdingPeriodDays: 2 },
    costs: { commissionBps: 2, spreadBps: 8, slippageBps: 5 },
    liquidity: { participationLimitPct: 5 },
  };
  const report = runBacktest(spec, result.signals, priceMap(gapSeries()));
  assert.equal(report.executedCount, 1, "執行できるはず");
  const [trade] = report.trades;
  assert.equal(trade.entryDate, "2026-01-08", "エントリーは反応日の翌営業日");
  assert.equal(trade.entryPrice, 900, "寄付は前日終値ベースの open");
}

function testShallowGapIsRejected() {
  const shallow = series("1234", [1000, 1000, 970, 975, 980, 985, 990, 995, 1000, 1005]);
  const result = generateEarningsGapSignals([disclosure()], priceMap(shallow), NO_FORECAST_CHECK);
  assert.equal(result.signals.length, 0);
  assert.equal(result.rejectedCounts.gap_not_deep_enough, 1);
}

function testForecastCutIsRejected() {
  const disclosures = [
    disclosure({ disclosedDate: "2026-01-05", disclosedTime: "15:00", forecastOperatingProfit: 100 }),
    disclosure({ disclosedDate: "2026-01-06", disclosedTime: "15:00", forecastOperatingProfit: 80 }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  assert.equal(result.signals.length, 0, "会社予想が減額されていたら候補にしない");
  assert.equal(result.rejectedCounts.forecast_cut, 1);
}

function testForecastHeldIsAccepted() {
  const disclosures = [
    disclosure({ disclosedDate: "2026-01-05", disclosedTime: "15:00", forecastOperatingProfit: 100 }),
    disclosure({ disclosedDate: "2026-01-06", disclosedTime: "15:00", forecastOperatingProfit: 100 }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  assert.equal(result.signals.length, 1, "据え置きは候補になる");
  assert.equal(result.candidates[0].previousForecastOperatingProfit, 100);
}

function testFirstDisclosureHasNoBaselineAndFailsClosed() {
  const result = generateEarningsGapSignals([disclosure()], priceMap(gapSeries()), PARAMS);
  assert.equal(result.signals.length, 0, "比較対象がない開示は減額判定できないので落とす");
  assert.equal(result.rejectedCounts.forecast_missing, 1);
}

function testNullForecastFailsClosed() {
  const disclosures = [
    disclosure({ disclosedDate: "2026-01-05", forecastOperatingProfit: 100 }),
    disclosure({ disclosedDate: "2026-01-06", forecastOperatingProfit: null }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  assert.equal(result.signals.length, 0, "null は 0 ではなく「不明」なので落とす");
  assert.equal(result.rejectedCounts.forecast_missing, 1);
}

function testCorrectionDocumentIsExcludedAndDoesNotMoveBaseline() {
  // 訂正が baseline を動かすと、その後の据え置きが誤って「減額」に見える。
  const disclosures = [
    disclosure({ disclosedDate: "2026-01-05", forecastOperatingProfit: 100 }),
    disclosure({
      disclosedDate: "2026-01-05",
      disclosedTime: "16:00",
      forecastOperatingProfit: 200,
      typeOfDocument: "RevisedForecast_Consolidated_JP",
    }),
    disclosure({ disclosedDate: "2026-01-06", forecastOperatingProfit: 150 }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  assert.equal(result.rejectedCounts.document_type_excluded, 1, "訂正は除外される");
  assert.equal(result.signals.length, 1, "baseline は訂正前の 100 のままなので減額にならない");
  assert.equal(result.candidates[0].previousForecastOperatingProfit, 100);
}

function testDuplicateDisclosureIsRejected() {
  const disclosures = [
    disclosure({ disclosedDate: "2026-01-05", forecastOperatingProfit: 100 }),
    disclosure({ disclosedDate: "2026-01-06" }),
    disclosure({ disclosedDate: "2026-01-06" }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  assert.equal(result.rejectedCounts.duplicate_disclosure, 1);
  assert.equal(result.signals.length, 1);
}

function testDuplicateReactionDateIsRejected() {
  // 別日の開示が同じ反応日へ落ちる場合、シグナルは1件だけにする。
  const disclosures = [
    disclosure({ disclosedDate: "2026-01-05", disclosedTime: "09:00", forecastOperatingProfit: 100 }),
    disclosure({ disclosedDate: "2026-01-06", disclosedTime: "09:00", forecastOperatingProfit: 100 }),
    disclosure({ disclosedDate: "2026-01-06", disclosedTime: "17:00", forecastOperatingProfit: 100 }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  assert.equal(result.signals.length, 1);
  assert.equal(result.rejectedCounts.duplicate_reaction_date, 1);
}

function testInvalidTimestampIsRejected() {
  const cases: EarningsDisclosureInput[] = [
    disclosure({ disclosedTime: "" }),
    disclosure({ disclosedTime: "25:00" }),
    disclosure({ disclosedDate: "2026-02-30" }),
    disclosure({ disclosedDate: "20260106" }),
  ];
  for (const one of cases) {
    const result = generateEarningsGapSignals([one], priceMap(gapSeries()), NO_FORECAST_CHECK);
    assert.equal(result.signals.length, 0, `落とすべき: ${one.disclosedDate} ${one.disclosedTime}`);
    assert.equal(result.rejectedCounts.invalid_disclosed_timestamp, 1);
  }
}

function testMissingPriceSeriesIsRejected() {
  const result = generateEarningsGapSignals([disclosure({ code: "9999" })], priceMap(gapSeries()), NO_FORECAST_CHECK);
  assert.equal(result.rejectedCounts.no_price_series, 1);
}

function testNoReactionBarIsRejected() {
  const result = generateEarningsGapSignals(
    [disclosure({ disclosedDate: "2026-01-19" })],
    priceMap(gapSeries()),
    NO_FORECAST_CHECK,
  );
  assert.equal(result.rejectedCounts.no_reaction_bar, 1, "最終営業日より後の反応日は存在しない");
}

function testNoPriorBarIsRejected() {
  const result = generateEarningsGapSignals(
    [disclosure({ disclosedDate: "2026-01-01" })],
    priceMap(gapSeries()),
    NO_FORECAST_CHECK,
  );
  assert.equal(result.rejectedCounts.no_prior_bar, 1, "反応日が系列先頭だと前営業日終値が無い");
}

function testUnsortedSeriesThrows() {
  const broken: PriceSeries = {
    code: "1234",
    bars: [
      { date: "2026-01-07", open: 1, high: 2, low: 1, close: 1, volume: 1 },
      { date: "2026-01-06", open: 1, high: 2, low: 1, close: 1, volume: 1 },
    ],
  };
  assert.throws(
    () => generateEarningsGapSignals([disclosure()], priceMap(broken), NO_FORECAST_CHECK),
    /strictly ascending/,
  );
}

function testPositiveThresholdThrows() {
  assert.throws(
    () =>
      generateEarningsGapSignals([], new Map(), {
        gapThresholdPct: 7,
        requireForecastNotCut: false,
        corporateActionDates: NO_ACTIONS,
      }),
    /must be a negative finite number/,
  );
}

function testEveryRejectionIsCounted() {
  const disclosures = [
    disclosure({ disclosedTime: "99:99" }),
    disclosure({ code: "9999", disclosedDate: "2026-01-05" }),
    disclosure({ disclosedDate: "2026-01-05", forecastOperatingProfit: 100 }),
  ];
  const result = generateEarningsGapSignals(disclosures, priceMap(gapSeries()), PARAMS);
  const totalCounted = Object.values(result.rejectedCounts).reduce((sum, count) => sum + count, 0);
  assert.equal(result.rejected.length, totalCounted, "件数と明細が一致する");
  assert.equal(result.disclosureCount, disclosures.length);
  assert.equal(result.signals.length + result.rejected.length, disclosures.length, "silent drop を作らない");
}


function splitSeries(): PriceSeries {
  // 2026-01-07 に 1:2 分割。未調整価格なので終値が 1000 -> 500 に見える。
  return {
    code: "1234",
    bars: [
      { date: "2026-01-05", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2026-01-06", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2026-01-07", open: 500, high: 505, low: 495, close: 500, volume: 2_000_000 },
      { date: "2026-01-08", open: 500, high: 505, low: 495, close: 502, volume: 2_000_000 },
    ],
  };
}

function testKnownCorporateActionIsRejected() {
  const result = generateEarningsGapSignals([disclosure()], priceMap(splitSeries()), {
    gapThresholdPct: -7,
    requireForecastNotCut: false,
    corporateActionDates: new Map([["1234", new Set(["2026-01-07"])]]),
  });
  assert.equal(result.signals.length, 0, "分割日を知っていれば偽シグナルを出さない");
  assert.equal(result.rejectedCounts.corporate_action_in_window, 1);
}

function testCorporateActionOnPriorCloseDateIsRejected() {
  const result = generateEarningsGapSignals([disclosure()], priceMap(splitSeries()), {
    gapThresholdPct: -7,
    requireForecastNotCut: false,
    corporateActionDates: new Map([["1234", new Set(["2026-01-06"])]]),
  });
  assert.equal(result.rejectedCounts.corporate_action_in_window, 1, "基準となる前営業日側も見る");
}

function testUnknownSplitIsCaughtByImplausibleGuard() {
  // provider が adjustmentFactor を捨てている現状では、これが唯一の防御線。
  const result = generateEarningsGapSignals([disclosure()], priceMap(splitSeries()), NO_FORECAST_CHECK);
  assert.equal(result.signals.length, 0, "分割情報が無くても -50% は通さない");
  assert.equal(result.rejectedCounts.implausible_single_day_move, 1);
}

function testRealCrashIsStillAccepted() {
  // 値幅制限内の本物の急落(-10%)は落とさない。保険が効きすぎないことを確認する。
  const result = generateEarningsGapSignals([disclosure()], priceMap(gapSeries()), NO_FORECAST_CHECK);
  assert.equal(result.signals.length, 1);
  assert.equal(result.rejectedCounts.implausible_single_day_move, 0);
}

function testImplausibleThresholdMustBeBelowGapThreshold() {
  assert.throws(
    () =>
      generateEarningsGapSignals([], new Map(), {
        gapThresholdPct: -7,
        requireForecastNotCut: false,
        corporateActionDates: NO_ACTIONS,
        implausibleSingleDayMovePct: -5,
      }),
    /must be below gapThresholdPct/,
    "保険の閾値が本閾値より緩いと全件落ちる。設定ミスを起動時に止める",
  );
}

function testCorporateActionDatesFromRecords() {
  const dates = corporateActionDatesFromPriceRecords([
    { code: "1234", tradingDate: "2026-01-05", adjustmentFactor: 1, corporateActions: [] },
    { code: "1234", tradingDate: "2026-01-07", adjustmentFactor: 0.5, corporateActions: [] },
    { code: "5678", tradingDate: "2026-01-09", adjustmentFactor: 1, corporateActions: [{ type: "split" }] },
  ]);
  assert.deepEqual([...(dates.get("1234") ?? [])], ["2026-01-07"], "adjustmentFactor != 1 を拾う");
  assert.deepEqual([...(dates.get("5678") ?? [])], ["2026-01-09"], "corporateActions 非空を拾う");
}


function testTradingSuspensionIsRejected() {
  // 開示後に長期の売買停止があると、停止明けの初値は「決算への反応」ではなく
  // 停止期間中の全材料の反映になる。停止明け銘柄はサンプルを最も汚す。
  const suspended: PriceSeries = {
    code: "1234",
    bars: [
      { date: "2026-01-05", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2026-01-06", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2026-03-16", open: 850, high: 860, low: 840, close: 850, volume: 1_000_000 },
      { date: "2026-03-17", open: 850, high: 860, low: 840, close: 855, volume: 1_000_000 },
    ],
  };
  const result = generateEarningsGapSignals([disclosure()], priceMap(suspended), NO_FORECAST_CHECK);
  assert.equal(result.signals.length, 0, "69日の停止明けを決算ギャップにしない");
  assert.equal(result.rejectedCounts.reaction_bar_too_far, 1);
}

function testYearEndHolidayIsStillAccepted() {
  // 年末年始・GW の連休(最長でも約9日)まで落としてしまうと使い物にならない。
  const holiday: PriceSeries = {
    code: "1234",
    bars: [
      { date: "2025-12-29", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2025-12-30", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2026-01-05", open: 900, high: 910, low: 890, close: 900, volume: 1_000_000 },
      { date: "2026-01-06", open: 900, high: 910, low: 890, close: 905, volume: 1_000_000 },
    ],
  };
  const result = generateEarningsGapSignals(
    [disclosure({ disclosedDate: "2025-12-30" })],
    priceMap(holiday),
    NO_FORECAST_CHECK,
  );
  assert.equal(result.signals.length, 1, "6日の連休は通す");
  assert.equal(result.candidates[0].gapPct, -10);
}

function testStalePriorBarIsRejected() {
  // 反応日は開示直後でも、その前の営業日が古いとギャップが累積変化になる。
  const staleBefore: PriceSeries = {
    code: "1234",
    bars: [
      { date: "2025-11-04", open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 },
      { date: "2026-01-07", open: 900, high: 910, low: 890, close: 900, volume: 1_000_000 },
      { date: "2026-01-08", open: 900, high: 910, low: 890, close: 905, volume: 1_000_000 },
    ],
  };
  const result = generateEarningsGapSignals([disclosure()], priceMap(staleBefore), NO_FORECAST_CHECK);
  assert.equal(result.signals.length, 0);
  assert.equal(result.rejectedCounts.prior_bar_too_far, 1);
}

function testInvalidDayLimitsThrow() {
  for (const params of [
    { maxReactionLagDays: 0 },
    { maxReactionLagDays: -1 },
    { maxPriorGapDays: 0 },
    { maxPriorGapDays: 1.5 },
  ]) {
    assert.throws(
      () =>
        generateEarningsGapSignals([], new Map(), {
          gapThresholdPct: -7,
          requireForecastNotCut: false,
          corporateActionDates: NO_ACTIONS,
          ...params,
        }),
      /must be a positive integer/,
      `設定ミスを起動時に止める: ${JSON.stringify(params)}`,
    );
  }
}

testGeneratesSignalOnDeepGap();
testIntradayDisclosureDoesNotUseSameDayMove();
testEntryIsTheDayAfterReaction();
testShallowGapIsRejected();
testForecastCutIsRejected();
testForecastHeldIsAccepted();
testFirstDisclosureHasNoBaselineAndFailsClosed();
testNullForecastFailsClosed();
testCorrectionDocumentIsExcludedAndDoesNotMoveBaseline();
testDuplicateDisclosureIsRejected();
testDuplicateReactionDateIsRejected();
testInvalidTimestampIsRejected();
testMissingPriceSeriesIsRejected();
testNoReactionBarIsRejected();
testNoPriorBarIsRejected();
testUnsortedSeriesThrows();
testPositiveThresholdThrows();
testKnownCorporateActionIsRejected();
testCorporateActionOnPriorCloseDateIsRejected();
testUnknownSplitIsCaughtByImplausibleGuard();
testRealCrashIsStillAccepted();
testImplausibleThresholdMustBeBelowGapThreshold();
testCorporateActionDatesFromRecords();
testTradingSuspensionIsRejected();
testYearEndHolidayIsStillAccepted();
testStalePriorBarIsRejected();
testInvalidDayLimitsThrow();
testEveryRejectionIsCounted();

console.log("research/earnings-gap-signals: 全テスト成功");
