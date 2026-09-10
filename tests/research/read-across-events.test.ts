// read-across（関連銘柄伝播）検出のテスト。
//
// 守りたい性質:
//   1. 発生元が実際に異常下落していること（動いていない事件から伝播を語らない）
//   2. 関連銘柄が自前の材料を持つ日は伝播にしない
//   3. 逆方向・小さい動きは拾わない
//   4. 同じ銘柄・同じ日を二重計上しない
//   5. 実害の有無は価格から判定できないので候補止まりにする

import assert from "node:assert/strict";
import type { PriceSeries } from "../../src/research/backtest.js";
import { buildCompanyRelationGraph } from "../../src/research/signals/company-relations.js";
import {
  detectReadAcrossEvents,
  type ReadAcrossParams,
} from "../../src/research/signals/read-across-events.js";

const DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];

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

const BENCHMARK = series("1306", [2000, 2000, 2000, 2000, 2000]);
const EVENT_DATE = "2026-01-07";

// A(8136) が -15%、同業 B(7974) が -9%、同業 C(7832) は動かず。
function baseSecurities(): Map<string, PriceSeries> {
  return new Map([
    ["8136", series("8136", [1000, 1000, 850, 855, 860])],
    ["7974", series("7974", [1000, 1000, 910, 915, 920])],
    ["7832", series("7832", [1000, 1000, 1001, 1002, 1003])],
  ]);
}

const GRAPH = buildCompanyRelationGraph({
  companies: {
    "8136": { peers: [{ code: "7974", relation: "日本発IP" }, { code: "7832", relation: "玩具IP" }] },
  },
}).graph;

function params(over: Partial<ReadAcrossParams> = {}): ReadAcrossParams {
  return {
    sourceAbnormalReturnThresholdPct: -10,
    relatedAbnormalReturnThresholdPct: -5,
    knownEventDates: new Map(),
    corporateActionDates: new Map(),
    ...over,
  };
}

const SOURCE = [{ code: "8136", date: EVENT_DATE, label: "misconduct" }];

function testPropagatesToMovingPeerOnly() {
  const result = detectReadAcrossEvents(SOURCE, GRAPH, baseSecurities(), BENCHMARK, params());
  assert.equal(result.candidates.length, 1, "動いた同業だけを拾う");
  const [candidate] = result.candidates;
  assert.equal(candidate.candidateId, "ra-8136-7974-2026-01-07");
  assert.equal(candidate.relatedCode, "7974");
  assert.equal(candidate.relationType, "peer");
  assert.equal(candidate.sourceLabel, "misconduct");
  assert.equal(candidate.sourceAbnormalReturnPct, -15);
  assert.equal(candidate.relatedAbnormalReturnPct, -9);
  assert.equal(Math.round(candidate.propagationRatio * 100) / 100, 0.6);
  assert.equal(candidate.observedAt, "2026-01-07T15:30:00+09:00");
  assert.equal(result.rejectedCounts.related_not_moved, 1, "動かなかった同業は理由付きで落とす");
}

function testSourceMustActuallyMove() {
  const flat = baseSecurities();
  flat.set("8136", series("8136", [1000, 1000, 999, 998, 997]));
  const result = detectReadAcrossEvents(SOURCE, GRAPH, flat, BENCHMARK, params());
  assert.equal(result.candidates.length, 0, "動いていない事件から伝播を語らない");
  assert.equal(result.rejectedCounts.source_not_moved, 1);
  assert.equal(result.propagatedSourceCount, 0);
}

function testRelatedOwnEventIsNotPropagation() {
  const result = detectReadAcrossEvents(SOURCE, GRAPH, baseSecurities(), BENCHMARK, params({
    knownEventDates: new Map([["7974", new Set([EVENT_DATE])]]),
  }));
  assert.equal(result.candidates.length, 0, "関連銘柄自身の材料は伝播ではない");
  assert.equal(result.rejectedCounts.explained_by_own_event, 1);
}

function testOppositeDirectionIsNotPropagation() {
  const rotated = baseSecurities();
  rotated.set("7974", series("7974", [1000, 1000, 1090, 1095, 1100]));
  const result = detectReadAcrossEvents(SOURCE, GRAPH, rotated, BENCHMARK, params());
  assert.equal(result.candidates.length, 0, "逆方向はローテーションであって伝播ではない");
  assert.equal(result.rejectedCounts.related_not_moved, 2);
}

function testMarketWideDropIsNotPropagation() {
  // 銘柄も benchmark も同じだけ下げた日は、A の事件とは無関係。
  const securities = new Map([
    ["8136", series("8136", [1000, 1000, 850, 855, 860])],
    ["7974", series("7974", [1000, 1000, 910, 915, 920])],
  ]);
  const crashedBenchmark = series("1306", [2000, 2000, 1820, 1820, 1820]);
  const result = detectReadAcrossEvents(SOURCE, GRAPH, securities, crashedBenchmark, params());
  assert.equal(result.candidates.length, 0, "benchmark 調整後で見れば伝播ではない");
}

function testDuplicateRelatedEventIsNotDoubleCounted() {
  // 同じ日に A と D の2件が起き、どちらも B へ辿り着く場合。
  const graph = buildCompanyRelationGraph({
    companies: {
      "8136": { peers: [{ code: "7974" }] },
      "4661": { peers: [{ code: "7974" }] },
    },
  }).graph;
  const securities = baseSecurities();
  securities.set("4661", series("4661", [1000, 1000, 860, 865, 870]));
  const result = detectReadAcrossEvents(
    [{ code: "8136", date: EVENT_DATE }, { code: "4661", date: EVENT_DATE }],
    graph,
    securities,
    BENCHMARK,
    params(),
  );
  assert.equal(result.candidates.length, 1, "同じ銘柄・同じ日を二重計上しない");
  assert.equal(result.rejectedCounts.duplicate_related_event, 1);
}

function testRelationTypeFilter() {
  const graph = buildCompanyRelationGraph({
    companies: { "8136": { peers: [{ code: "7974" }], parents: [{ code: "7832" }] } },
  }).graph;
  const securities = baseSecurities();
  securities.set("7832", series("7832", [1000, 1000, 900, 905, 910]));
  const peersOnly = detectReadAcrossEvents(SOURCE, graph, securities, BENCHMARK, params({
    relationTypes: ["peer"],
  }));
  assert.deepEqual(peersOnly.candidates.map((one) => one.relatedCode), ["7974"]);
  const all = detectReadAcrossEvents(SOURCE, graph, securities, BENCHMARK, params());
  assert.deepEqual(all.candidates.map((one) => one.relatedCode).sort(), ["7832", "7974"]);
}

function testGuardReasonIsPreserved() {
  // 関連銘柄が売買停止明けなら、内訳の理由を残したまま落とす。
  const securities = baseSecurities();
  securities.set("7974", {
    code: "7974",
    bars: [
      { date: "2025-10-01", open: 1000, high: 1010, low: 990, close: 1000, volume: 2_000_000 },
      { date: EVENT_DATE, open: 910, high: 915, low: 905, close: 910, volume: 2_000_000 },
    ],
  });
  const result = detectReadAcrossEvents(SOURCE, GRAPH, securities, BENCHMARK, params());
  const guard = result.rejected.find((one) => one.reason === "related_guard_failed");
  assert.ok(guard, "guard で落ちた記録がある");
  assert.equal(guard?.guardReason, "prior_bar_too_far", "内訳の理由を捨てない");
}

function testMissingPriceIsReported() {
  const result = detectReadAcrossEvents(
    [{ code: "9999", date: EVENT_DATE }],
    GRAPH,
    baseSecurities(),
    BENCHMARK,
    params(),
  );
  assert.equal(result.rejectedCounts.source_price_unavailable, 1);

  const noRelations = detectReadAcrossEvents(
    [{ code: "7832", date: EVENT_DATE }],
    new Map(),
    baseSecurities(),
    BENCHMARK,
    params(),
  );
  assert.equal(noRelations.rejectedCounts.source_not_moved + noRelations.rejectedCounts.no_relations, 1);
}

function testCandidatesAreNotSignals() {
  const [candidate] = detectReadAcrossEvents(SOURCE, GRAPH, baseSecurities(), BENCHMARK, params()).candidates;
  assert.equal(candidate.actualDamageAssessed, false, "実害の有無は価格から判定できない");
  assert.deepEqual([...candidate.blockers], ["actual_damage_not_assessed"]);
}

function testLiquidityFloorAppliesAfterThreshold() {
  const thin = baseSecurities();
  thin.set("7974", series("7974", [1000, 1000, 910, 915, 920], 100));
  const result = detectReadAcrossEvents(SOURCE, GRAPH, thin, BENCHMARK, params({
    minAverageTurnoverJpy: 100_000_000,
  }));
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejectedCounts.below_min_turnover, 1, "候補相当と判定したあとに落とす");
  assert.equal(result.rejectedCounts.related_not_moved, 1, "動かなかった銘柄は別理由のまま");
}

function testInvalidParamsFailClosed() {
  assert.throws(
    () => detectReadAcrossEvents([], GRAPH, new Map(), BENCHMARK, params({ sourceAbnormalReturnThresholdPct: 10 })),
    /must be a negative finite number/,
  );
  assert.throws(
    () => detectReadAcrossEvents([], GRAPH, new Map(), BENCHMARK, params({ implausibleSingleDayMovePct: -3 })),
    /must be below/,
  );
}

function testOutputIsDeterministic() {
  const first = detectReadAcrossEvents(SOURCE, GRAPH, baseSecurities(), BENCHMARK, params());
  const second = detectReadAcrossEvents(SOURCE, GRAPH, baseSecurities(), BENCHMARK, params());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const counted = Object.values(first.rejectedCounts).reduce((sum, count) => sum + count, 0);
  assert.equal(first.rejected.length, counted, "件数と明細が一致する");
}

testPropagatesToMovingPeerOnly();
testSourceMustActuallyMove();
testRelatedOwnEventIsNotPropagation();
testOppositeDirectionIsNotPropagation();
testMarketWideDropIsNotPropagation();
testDuplicateRelatedEventIsNotDoubleCounted();
testRelationTypeFilter();
testGuardReasonIsPreserved();
testMissingPriceIsReported();
testCandidatesAreNotSignals();
testLiquidityFloorAppliesAfterThreshold();
testInvalidParamsFailClosed();
testOutputIsDeterministic();

console.log("research/read-across-events: 全テスト成功");
