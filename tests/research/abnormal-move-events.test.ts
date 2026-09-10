// 価格逆引きイベント検出 (F1) のテスト。
//
// 守りたい性質:
//   1. benchmark 調整後で判定する（地合いの悪い日に全銘柄を拾わない）
//   2. 説明のつく日（決算・コーポレートアクション）を除外する
//   3. 売買停止明け・分割を業績無関係ショックと取り違えない
//   4. 出力は候補であって Signal ではない（原因ラベル前に昇格させない）
//   5. 落とした理由が必ず件数で返る

import assert from "node:assert/strict";
import type { PriceSeries } from "../../src/research/backtest.js";
import {
  detectAbnormalMoveEvents,
  type AbnormalMoveParams,
} from "../../src/research/signals/abnormal-move-events.js";

const DATES = [
  "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
  "2026-01-13", "2026-01-14",
];

function series(code: string, closes: number[], volume = 2_000_000): PriceSeries {
  return {
    code,
    bars: closes.map((close, index) => {
      const open = index === 0 ? close : closes[index - 1];
      return {
        date: DATES[index],
        open,
        high: Math.max(open, close) + 5,
        low: Math.max(1, Math.min(open, close) - 5),
        close,
        volume,
      };
    }),
  };
}

const FLAT_BENCHMARK = series("1306", [2000, 2000, 2000, 2000, 2000, 2000, 2000]);

function params(over: Partial<AbnormalMoveParams> = {}): AbnormalMoveParams {
  return {
    abnormalReturnThresholdPct: -8,
    knownEventDates: new Map(),
    corporateActionDates: new Map(),
    ...over,
  };
}

function testDetectsAbnormalDropAgainstFlatBenchmark() {
  // 2026-01-07 に -10%。benchmark は横ばい。
  const stock = series("1234", [1000, 1000, 900, 905, 910, 915, 920]);
  const result = detectAbnormalMoveEvents([stock], FLAT_BENCHMARK, params());
  assert.equal(result.candidates.length, 1);
  const [candidate] = result.candidates;
  assert.equal(candidate.candidateId, "am-1234-2026-01-07");
  assert.equal(candidate.date, "2026-01-07");
  assert.equal(candidate.priorCloseDate, "2026-01-06");
  assert.equal(candidate.rawReturnPct, -10);
  assert.equal(candidate.benchmarkReturnPct, 0);
  assert.equal(candidate.abnormalReturnPct, -10);
  assert.equal(candidate.observedAt, "2026-01-07T15:30:00+09:00", "observedAt は当日の引け");
}

function testMarketWideDropIsNotAnEvent() {
  // 銘柄も benchmark も同じだけ下げた日は「その銘柄固有の事件」ではない。
  const stock = series("1234", [1000, 1000, 900, 900, 900, 900, 900]);
  const benchmark = series("1306", [2000, 2000, 1800, 1800, 1800, 1800, 1800]);
  const result = detectAbnormalMoveEvents([stock], benchmark, params());
  assert.equal(result.candidates.length, 0, "地合いで説明できる下落は拾わない");
  assert.equal(result.rejectedCounts.move_not_extreme_enough, 6);
}

function testOutperformingDropIsStillDetected() {
  // benchmark が -3%、銘柄が -12% → 異常分は -9% なので拾う。
  const stock = series("1234", [1000, 1000, 880, 880, 880, 880, 880]);
  const benchmark = series("1306", [2000, 2000, 1940, 1940, 1940, 1940, 1940]);
  const result = detectAbnormalMoveEvents([stock], benchmark, params());
  assert.equal(result.candidates.length, 1);
  assert.equal(Math.round(result.candidates[0].abnormalReturnPct * 10) / 10, -9);
}

function testKnownEventDateIsExcluded() {
  const stock = series("1234", [1000, 1000, 900, 905, 910, 915, 920]);
  const result = detectAbnormalMoveEvents([stock], FLAT_BENCHMARK, params({
    knownEventDates: new Map([["1234", new Set(["2026-01-07"])]]),
  }));
  assert.equal(result.candidates.length, 0, "決算日など説明のつく日は F1 の対象外");
  assert.equal(result.rejectedCounts.explained_by_known_event, 1);
}

function testCorporateActionIsExcluded() {
  const stock = series("1234", [1000, 1000, 900, 905, 910, 915, 920]);

  // アクション日 X は、X 当日の判定と、X を前営業日終値に使う X+1 の判定の
  // 両方を汚すので、2日分が除外されるのが正しい。
  const onDropDay = detectAbnormalMoveEvents([stock], FLAT_BENCHMARK, params({
    corporateActionDates: new Map([["1234", new Set(["2026-01-07"])]]),
  }));
  assert.equal(onDropDay.candidates.length, 0);
  assert.deepEqual(
    onDropDay.rejected.filter((one) => one.reason === "corporate_action_in_window").map((one) => one.date),
    ["2026-01-07", "2026-01-08"],
    "アクション日とその翌日の両方を除外する",
  );

  // 前営業日側にアクションがある場合も、その日の判定は基準終値が汚れている。
  const onPriorDay = detectAbnormalMoveEvents([stock], FLAT_BENCHMARK, params({
    corporateActionDates: new Map([["1234", new Set(["2026-01-06"])]]),
  }));
  assert.equal(onPriorDay.candidates.length, 0, "下落日の基準終値が汚れているので候補にしない");
  assert.deepEqual(
    onPriorDay.rejected.filter((one) => one.reason === "corporate_action_in_window").map((one) => one.date),
    ["2026-01-06", "2026-01-07"],
  );
}

function testUnknownSplitIsCaughtByImplausibleGuard() {
  // 1:2 分割。コーポレートアクション情報が無くても通さない。
  const stock = series("1234", [1000, 1000, 500, 502, 505, 508, 510]);
  const result = detectAbnormalMoveEvents([stock], FLAT_BENCHMARK, params());
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejectedCounts.implausible_single_day_move, 1);
}

function testTradingSuspensionIsExcluded() {
  const suspended: PriceSeries = {
    code: "1234",
    bars: [
      { date: "2026-01-05", open: 1000, high: 1010, low: 990, close: 1000, volume: 2_000_000 },
      { date: "2026-03-16", open: 880, high: 890, low: 870, close: 880, volume: 2_000_000 },
    ],
  };
  const benchmark: PriceSeries = {
    code: "1306",
    bars: [
      { date: "2026-01-05", open: 2000, high: 2010, low: 1990, close: 2000, volume: 1_000_000 },
      { date: "2026-03-16", open: 2000, high: 2010, low: 1990, close: 2000, volume: 1_000_000 },
    ],
  };
  const result = detectAbnormalMoveEvents([suspended], benchmark, params());
  assert.equal(result.candidates.length, 0, "70日の停止明けを単日ショックにしない");
  assert.equal(result.rejectedCounts.prior_bar_too_far, 1);
}

function testMissingBenchmarkBarFailsClosed() {
  const stock = series("1234", [1000, 1000, 900, 905, 910, 915, 920]);
  const shortBenchmark: PriceSeries = {
    code: "1306",
    bars: FLAT_BENCHMARK.bars.filter((bar) => bar.date !== "2026-01-07"),
  };
  const result = detectAbnormalMoveEvents([stock], shortBenchmark, params());
  assert.equal(result.candidates.length, 0, "benchmark が無い日は素のリターンで判定しない");
  assert.equal(result.rejectedCounts.benchmark_bar_missing, 1);
  assert.equal(result.rejectedCounts.benchmark_prior_bar_missing, 1, "翌日は前日 benchmark が無い");
}

function testLiquidityFloor() {
  const thin = series("1234", [1000, 1000, 900, 905, 910, 915, 920], 100);
  const withoutFloor = detectAbnormalMoveEvents([thin], FLAT_BENCHMARK, params());
  assert.equal(withoutFloor.candidates.length, 1, "未指定なら流動性で絞らない");

  const withFloor = detectAbnormalMoveEvents([thin], FLAT_BENCHMARK, params({
    minAverageTurnoverJpy: 100_000_000,
  }));
  assert.equal(withFloor.candidates.length, 0);
  assert.equal(withFloor.rejectedCounts.below_min_turnover, 1);
}

function testCandidatesAreNotSignals() {
  const stock = series("1234", [1000, 1000, 900, 905, 910, 915, 920]);
  const [candidate] = detectAbnormalMoveEvents([stock], FLAT_BENCHMARK, params()).candidates;
  assert.equal(candidate.causeLabelled, false, "原因未特定のまま Edge サンプルにしない");
  assert.deepEqual([...candidate.blockers], ["cause_not_labelled"]);
}

function testEveryEvaluationIsAccountedFor() {
  const stocks = [
    series("1111", [1000, 1000, 900, 905, 910, 915, 920]),
    series("2222", [500, 500, 505, 510, 515, 520, 525]),
  ];
  const result = detectAbnormalMoveEvents(stocks, FLAT_BENCHMARK, params());
  const counted = Object.values(result.rejectedCounts).reduce((sum, count) => sum + count, 0);
  assert.equal(result.rejected.length, counted, "件数と明細が一致する");
  assert.equal(
    result.candidates.length + result.rejected.length,
    result.evaluatedCount,
    "silent drop を作らない",
  );
  assert.equal(result.evaluatedCount, 14, "2銘柄 × 7営業日");
}

function testOutputIsDeterministic() {
  const stocks = [
    series("2222", [1000, 1000, 900, 905, 910, 915, 920]),
    series("1111", [1000, 1000, 880, 885, 890, 895, 900]),
  ];
  const first = detectAbnormalMoveEvents(stocks, FLAT_BENCHMARK, params());
  const second = detectAbnormalMoveEvents(stocks, FLAT_BENCHMARK, params());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(
    first.candidates.map((one) => one.candidateId),
    ["am-1111-2026-01-07", "am-2222-2026-01-07"],
    "candidateId 昇順",
  );
}

function testInvalidParamsFailClosed() {
  assert.throws(
    () => detectAbnormalMoveEvents([], FLAT_BENCHMARK, params({ abnormalReturnThresholdPct: 8 })),
    /must be a negative finite number/,
  );
  assert.throws(
    () => detectAbnormalMoveEvents([], FLAT_BENCHMARK, params({ implausibleSingleDayMovePct: -5 })),
    /must be below/,
    "保険の閾値が本閾値より緩いと全件落ちる。設定ミスを起動時に止める",
  );
  assert.throws(
    () => detectAbnormalMoveEvents([], FLAT_BENCHMARK, params({ maxPriorGapDays: 0 })),
    /must be a positive integer/,
  );
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
    () => detectAbnormalMoveEvents([broken], FLAT_BENCHMARK, params()),
    /strictly ascending/,
  );
}

testDetectsAbnormalDropAgainstFlatBenchmark();
testMarketWideDropIsNotAnEvent();
testOutperformingDropIsStillDetected();
testKnownEventDateIsExcluded();
testCorporateActionIsExcluded();
testUnknownSplitIsCaughtByImplausibleGuard();
testTradingSuspensionIsExcluded();
testMissingBenchmarkBarFailsClosed();
testLiquidityFloor();
testCandidatesAreNotSignals();
testEveryEvaluationIsAccountedFor();
testOutputIsDeterministic();
testInvalidParamsFailClosed();
testUnsortedSeriesThrows();

console.log("research/abnormal-move-events: 全テスト成功");
