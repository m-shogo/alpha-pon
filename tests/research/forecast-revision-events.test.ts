// 業績予想の上方修正イベントのテスト。
//
// 守りたい性質（事前登録 docs/research/preregistrations/2026-09-17-forecast-revision-up.md）:
//   1. 基準は同じ会計年度の直前の予想（決算短信の FOP / 本決算の NxFOP / 以前の修正）
//   2. 基準 > 0 かつ 修正後 ≥ 基準 × 1.10 だけを通す（境界ちょうどは通す）
//   3. 反応日は引け前なら当日、引け以降なら翌営業日。観測は反応日の引け
//   4. 同じ銘柄・同じ反応日は早い開示の1件だけ
//   5. 反応日・前営業日の分割は落とす
//   6. 落とした開示は理由つきで全件数える

import assert from "node:assert/strict";
import type { PriceSeries } from "../../src/research/backtest.js";
import type { EarningsDisclosureInput } from "../../src/research/signals/earnings-gap.js";
import {
  detectForecastRevisionEvents,
  type ForecastRevisionParams,
} from "../../src/research/signals/forecast-revision-events.js";

const DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-13"];

function flat(code: string): PriceSeries {
  return {
    code,
    bars: DATES.map((date) => ({ date, open: 1000, high: 1010, low: 990, close: 1000, volume: 1_000_000 })),
  };
}

function quarter(over: Partial<EarningsDisclosureInput> = {}): EarningsDisclosureInput {
  return {
    code: "1234",
    disclosedDate: "2025-11-05",
    disclosedTime: "15:30",
    forecastOperatingProfit: 100,
    fiscalYearEnd: "2026-03-31",
    nextFiscalYearEnd: null,
    nextForecastOperatingProfit: null,
    typeOfDocument: "2QFinancialStatements_Consolidated_JP",
    ...over,
  };
}

function revision(over: Partial<EarningsDisclosureInput> = {}): EarningsDisclosureInput {
  return quarter({
    disclosedDate: "2026-01-06",
    disclosedTime: "15:30",
    forecastOperatingProfit: 120,
    typeOfDocument: "EarnForecastRevision",
    ...over,
  });
}

const PARAMS: ForecastRevisionParams = { minRevisionRatio: 1.1, corporateActionDates: new Map() };
const PRICES = new Map([["1234", flat("1234")]]);

function testUpwardRevisionBecomesASignal() {
  const result = detectForecastRevisionEvents([quarter(), revision()], PRICES, PARAMS);
  assert.equal(result.signals.length, 1);
  const candidate = result.candidates[0]!;
  assert.equal(candidate.reactionDate, "2026-01-07", "引けちょうどの開示は翌営業日が反応日");
  assert.equal(candidate.priorCloseDate, "2026-01-06");
  assert.equal(candidate.observedAt, "2026-01-07T15:30:00+09:00", "反応日の引けで観測");
  assert.equal(candidate.baselineForecastOperatingProfit, 100);
  assert.equal(candidate.baselineDisclosedAt, "2025-11-05T15:30:00+09:00");
  assert.ok(Math.abs(candidate.revisionRatio - 1.2) < 1e-12);
  assert.equal(result.signals[0]!.id, "fr-1234-2026-01-07");
  assert.equal(result.rejectedCounts.not_forecast_revision, 1, "決算短信そのものは対象外として数える");
}

function testIntradayRevisionReactsTheSameDay() {
  const result = detectForecastRevisionEvents([quarter(), revision({ disclosedTime: "13:00" })], PRICES, PARAMS);
  assert.equal(result.candidates[0]!.reactionDate, "2026-01-06", "引け前の開示は当日が反応日");
}

function testThresholdIsInclusiveAndSmallRevisionsAreDropped() {
  // 100 * 1.1 は浮動小数点で 110.00000000000001 になる（実測）。
  // 「修正後 ≥ 基準 × 1.1」と掛け算で書くと、ちょうど +10% が落ちる。比で比べる。
  assert.ok(100 * 1.1 > 110, "前提: 掛け算だと境界を越えてしまう");
  const exactly = detectForecastRevisionEvents([quarter(), revision({ forecastOperatingProfit: 110 })], PRICES, PARAMS);
  assert.equal(exactly.signals.length, 1, "ちょうど +10% は通す（≥）");
  const largeExact = detectForecastRevisionEvents(
    [quarter({ forecastOperatingProfit: 90_000_000 }), revision({ forecastOperatingProfit: 99_000_000 })], PRICES, PARAMS,
  );
  assert.equal(largeExact.signals.length, 1, "円単位の大きな金額でもちょうど +10% は通す");
  const small = detectForecastRevisionEvents([quarter(), revision({ forecastOperatingProfit: 109 })], PRICES, PARAMS);
  assert.equal(small.signals.length, 0);
  assert.equal(small.rejectedCounts.revision_below_threshold, 1);
  const down = detectForecastRevisionEvents([quarter(), revision({ forecastOperatingProfit: 50 })], PRICES, PARAMS);
  assert.equal(down.rejectedCounts.revision_below_threshold, 1, "下方修正はこの登録の対象外");
}

function testBaselineRules() {
  const none = detectForecastRevisionEvents([revision()], PRICES, PARAMS);
  assert.equal(none.rejectedCounts.baseline_missing, 1, "基準が無ければ判定しない");

  const otherYear = detectForecastRevisionEvents(
    [quarter({ fiscalYearEnd: "2025-03-31" }), revision()], PRICES, PARAMS,
  );
  assert.equal(otherYear.rejectedCounts.baseline_missing, 1, "別の年度の予想とは比べない");

  const loss = detectForecastRevisionEvents(
    [quarter({ forecastOperatingProfit: -50 }), revision({ forecastOperatingProfit: 10 })], PRICES, PARAMS,
  );
  assert.equal(loss.rejectedCounts.baseline_not_positive, 1, "赤字予想からの比は定義しない");

  const guidance = detectForecastRevisionEvents([
    quarter({
      typeOfDocument: "FYFinancialStatements_Consolidated_JP",
      disclosedDate: "2025-05-13",
      forecastOperatingProfit: null,
      fiscalYearEnd: "2025-03-31",
      nextFiscalYearEnd: "2026-03-31",
      nextForecastOperatingProfit: 100,
    }),
    revision(),
  ], PRICES, PARAMS);
  assert.equal(guidance.candidates[0]?.baselineForecastOperatingProfit, 100, "本決算の来期予想を基準にする");

  const previousRevision = detectForecastRevisionEvents([
    quarter(),
    revision({ disclosedDate: "2025-12-01", forecastOperatingProfit: 130 }),
    revision({ forecastOperatingProfit: 140 }),
  ], PRICES, PARAMS);
  // 2つ目の修正の基準は1つ目の修正（130）。140/130 = 1.077 < 1.1 なので落ちる。
  assert.equal(previousRevision.signals.length, 0, "12-01 の修正は価格の範囲外、01-06 の修正は基準 130 で +7.7%");
  assert.equal(previousRevision.rejectedCounts.revision_below_threshold, 1);

  const sameInstant = detectForecastRevisionEvents([
    quarter({ disclosedDate: "2025-08-05" }),
    quarter({ disclosedDate: "2026-01-06", forecastOperatingProfit: 130 }),
    revision({ forecastOperatingProfit: 130 }),
  ], PRICES, PARAMS);
  assert.equal(sameInstant.candidates[0]?.baselineForecastOperatingProfit, 100, "同時刻の決算短信は基準にしない");
}

function testForecastMissingAndUnknownTimeAreCounted() {
  const missing = detectForecastRevisionEvents([quarter(), revision({ forecastOperatingProfit: null })], PRICES, PARAMS);
  assert.equal(missing.rejectedCounts.forecast_missing, 1);
  const badTime = detectForecastRevisionEvents([quarter(), revision({ disclosedTime: "25:00" })], PRICES, PARAMS);
  assert.equal(badTime.rejectedCounts.invalid_disclosed_timestamp, 1);
}

function testPriceGuards() {
  const noSeries = detectForecastRevisionEvents([quarter(), revision()], new Map(), PARAMS);
  assert.equal(noSeries.rejectedCounts.no_price_series, 1, "流動性で絞られた銘柄は価格が無い");

  const afterData = detectForecastRevisionEvents(
    [quarter(), revision({ disclosedDate: "2026-01-13", disclosedTime: "16:00" })], PRICES, PARAMS,
  );
  assert.equal(afterData.rejectedCounts.no_reaction_bar, 1);

  const firstBar = detectForecastRevisionEvents(
    [quarter(), revision({ disclosedDate: "2026-01-05", disclosedTime: "10:00" })], PRICES, PARAMS,
  );
  assert.equal(firstBar.rejectedCounts.no_prior_bar, 1);

  const split = detectForecastRevisionEvents([quarter(), revision()], PRICES, {
    ...PARAMS,
    corporateActionDates: new Map([["1234", new Set(["2026-01-06"])]]),
  });
  assert.equal(split.rejectedCounts.corporate_action_in_window, 1, "前営業日の分割は落とす");

  const gapSeries: PriceSeries = {
    code: "1234",
    bars: [
      { date: "2025-12-01", open: 1000, high: 1000, low: 1000, close: 1000, volume: 1 },
      { date: "2026-01-07", open: 1000, high: 1000, low: 1000, close: 1000, volume: 1 },
    ],
  };
  const stale = detectForecastRevisionEvents([quarter(), revision()], new Map([["1234", gapSeries]]), PARAMS);
  assert.equal(stale.rejectedCounts.prior_bar_too_far, 1, "売買停止明けは反応ではない");
}

function testDuplicateReactionKeepsTheEarliest() {
  // 01-06 引け後と 01-07 場中は、どちらも反応日 01-07。早い方（01-06）を残す。
  const result = detectForecastRevisionEvents([
    quarter(),
    revision({ disclosedDate: "2026-01-07", disclosedTime: "10:00", forecastOperatingProfit: 150 }),
    revision({ disclosedDate: "2026-01-06", disclosedTime: "17:00", forecastOperatingProfit: 120 }),
  ], PRICES, PARAMS);
  assert.equal(result.signals.length, 1);
  assert.equal(result.candidates[0]!.disclosedAt, "2026-01-06T17:00:00+09:00");
  assert.equal(result.rejectedCounts.duplicate_reaction_date, 1);
}

function testEveryDisclosureIsAccountedFor() {
  const disclosures = [
    quarter(),
    revision(),
    revision({ code: "9999" }),
    revision({ forecastOperatingProfit: 101, disclosedDate: "2026-01-08" }),
  ];
  const result = detectForecastRevisionEvents(disclosures, PRICES, PARAMS);
  assert.equal(result.disclosureCount, disclosures.length);
  assert.equal(result.signals.length + result.rejected.length, disclosures.length, "silent drop を作らない");
}

function testInvalidParamsFailClosed() {
  assert.throws(() => detectForecastRevisionEvents([], PRICES, { ...PARAMS, minRevisionRatio: 1 }), /above 1/);
  assert.throws(() => detectForecastRevisionEvents([], PRICES, { ...PARAMS, minRevisionRatio: Number.NaN }), /above 1/);
  assert.throws(() => detectForecastRevisionEvents([revision({ code: "12-4" })], PRICES, PARAMS), /alphanumeric/);
}

function testOutputIsDeterministic() {
  const disclosures = [
    quarter({ code: "2222" }), revision({ code: "2222" }),
    quarter(), revision(),
  ];
  const prices = new Map([["1234", flat("1234")], ["2222", flat("2222")]]);
  const forward = detectForecastRevisionEvents(disclosures, prices, PARAMS);
  const backward = detectForecastRevisionEvents([...disclosures].reverse(), prices, PARAMS);
  assert.deepEqual(forward.signals, backward.signals, "入力の順序に依存しない");
  assert.deepEqual(forward.candidates, backward.candidates);
}

testUpwardRevisionBecomesASignal();
testIntradayRevisionReactsTheSameDay();
testThresholdIsInclusiveAndSmallRevisionsAreDropped();
testBaselineRules();
testForecastMissingAndUnknownTimeAreCounted();
testPriceGuards();
testDuplicateReactionKeepsTheEarliest();
testEveryDisclosureIsAccountedFor();
testInvalidParamsFailClosed();
testOutputIsDeterministic();

console.log("research/forecast-revision-events: 全テスト成功");
