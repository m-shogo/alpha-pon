// イベントスタディのテスト。
//
// 守りたい性質:
//   1. エントリーはイベント日の翌営業日以降（当日には約定できない）
//   2. benchmark 調整後で測る
//   3. treatment と control を同じ手続きで測り、差分を出す
//   4. 同日イベントをクラスタとして扱い t を過大にしない
//   5. 測れなかった horizon を silent drop しない

import assert from "node:assert/strict";
import type { PriceSeries } from "../../src/research/backtest.js";
import {
  runEventStudy,
  type EventStudyParams,
  type EventStudySubject,
} from "../../src/research/signals/event-study.js";

const DATES = [
  "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
  "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16", "2026-01-19",
];

function series(code: string, closes: number[]): PriceSeries {
  return {
    code,
    bars: closes.map((close, index) => {
      const open = index === 0 ? close : closes[index - 1];
      return {
        date: DATES[index], open,
        high: Math.max(open, close) + 2,
        low: Math.max(1, Math.min(open, close) - 2),
        close, volume: 1_000_000,
      };
    }),
  };
}

const FLAT_BENCHMARK = series("1306", [2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000]);
const EVENT_DATE = "2026-01-07"; // index 2

function params(over: Partial<EventStudyParams> = {}): EventStudyParams {
  return { horizons: [1, 5], ...over };
}

function subject(over: Partial<EventStudySubject> = {}): EventStudySubject {
  return { id: "t-1", code: "1111", eventDate: EVENT_DATE, group: "treatment", pairId: "t-1", ...over };
}

function testEntryIsTheDayAfterTheEvent() {
  // イベント日 index2、エントリーは index3 の寄付 = index2 の終値。
  const stock = series("1111", [1000, 1000, 900, 910, 920, 930, 940, 950, 960, 970]);
  const result = runEventStudy([subject()], new Map([["1111", stock]]), FLAT_BENCHMARK, params());
  const [observation] = result.observations;
  assert.equal(observation.eventDate, EVENT_DATE);
  assert.equal(observation.entryDate, "2026-01-08", "イベント日当日には約定できない");
  assert.equal(observation.entryPrice, 900, "翌営業日の寄付（= イベント日の終値）");
  assert.equal(observation.preEventClose, 900);
}

function testAbnormalReturnIsBenchmarkAdjusted() {
  // 銘柄 +10%、benchmark +10% → 異常リターン 0。
  const stock = series("1111", [1000, 1000, 1000, 1000, 1100, 1100, 1100, 1100, 1100, 1100]);
  const bench = series("1306", [2000, 2000, 2000, 2000, 2200, 2200, 2200, 2200, 2200, 2200]);
  const result = runEventStudy([subject()], new Map([["1111", stock]]), bench, params({ horizons: [1] }));
  const point = result.observations[0].horizons[0];
  assert.equal(Math.round(point.rawReturnBps), 1000);
  assert.equal(Math.round(point.benchmarkReturnBps), 1000);
  assert.equal(Math.round(point.abnormalReturnBps), 0, "地合いで説明できる上昇を効果に数えない");
}

function testTreatmentVersusControlDifference() {
  // treatment は回復、control は横ばい。
  const treated = series("1111", [1000, 1000, 900, 900, 990, 990, 990, 990, 990, 990]);
  // control はイベント前終値 900 を終値で一度も回復しない。
  const flat = series("2222", [1000, 1000, 900, 880, 880, 880, 880, 880, 880, 880]);
  const subjects: EventStudySubject[] = [
    { id: "t-1", code: "1111", eventDate: EVENT_DATE, group: "treatment", pairId: "t-1" },
    { id: "c-1", code: "2222", eventDate: EVENT_DATE, group: "control", pairId: "t-1" },
  ];
  const result = runEventStudy(
    subjects,
    new Map([["1111", treated], ["2222", flat]]),
    FLAT_BENCHMARK,
    params({ horizons: [2] }),
  );
  const [summary] = result.summaryByHorizon;
  assert.equal(summary.treatment.count, 1);
  assert.equal(summary.control.count, 1);
  assert.ok(summary.differenceBps !== null && summary.differenceBps > 0, "回復した分が差として出る");
  assert.equal(summary.treatmentReclaimRate, 1, "イベント前終値を回復した");
  assert.equal(summary.controlReclaimRate, 0);
}

function testSameDayEventsAreClustered() {
  const securities = new Map<string, PriceSeries>();
  const subjects: EventStudySubject[] = [];
  for (let i = 0; i < 5; i += 1) {
    const code = String(1111 + i);
    securities.set(code, series(code, [1000, 1000, 900, 900, 950 + i, 950, 950, 950, 950, 950]));
    subjects.push({ id: `t-${i}`, code, eventDate: EVENT_DATE, group: "treatment", pairId: `t-${i}` });
  }
  const result = runEventStudy(subjects, securities, FLAT_BENCHMARK, params({ horizons: [1] }));
  const [summary] = result.summaryByHorizon;
  assert.equal(summary.treatment.count, 5);
  assert.equal(summary.treatment.clusterCount, 1, "同日イベントは1クラスタ");
  assert.equal(summary.treatment.clusteredTStat, null, "1クラスタでは判定用 t を出さない");
  assert.ok(summary.treatment.tStat !== null, "未補正 t は参考として出る");
}

function testMissingHorizonIsReportedNotDropped() {
  const stock = series("1111", [1000, 1000, 900, 910, 920, 930, 940, 950, 960, 970]);
  const result = runEventStudy(
    [subject()],
    new Map([["1111", stock]]),
    FLAT_BENCHMARK,
    params({ horizons: [1, 120] }),
  );
  const [observation] = result.observations;
  assert.equal(observation.horizons.length, 1);
  assert.deepEqual(observation.skippedHorizons, [{ horizonBars: 120, reason: "horizon_bar_missing" }]);
}

function testExcursionsAndReclaim() {
  // エントリー900、途中850まで下げてから960へ。イベント前終値は900。
  const stock: PriceSeries = {
    code: "1111",
    bars: [
      { date: DATES[0], open: 1000, high: 1005, low: 995, close: 1000, volume: 1_000_000 },
      { date: DATES[1], open: 1000, high: 1005, low: 995, close: 1000, volume: 1_000_000 },
      { date: DATES[2], open: 1000, high: 1000, low: 890, close: 900, volume: 1_000_000 },
      { date: DATES[3], open: 900, high: 905, low: 850, close: 860, volume: 1_000_000 },
      { date: DATES[4], open: 860, high: 965, low: 855, close: 960, volume: 1_000_000 },
    ],
  };
  const bench: PriceSeries = { code: "1306", bars: FLAT_BENCHMARK.bars.slice(0, 5) };
  const result = runEventStudy([subject()], new Map([["1111", stock]]), bench, params({ horizons: [1] }));
  const point = result.observations[0].horizons[0];
  assert.equal(Math.round(point.maxAdverseExcursionBps), Math.round(((850 - 900) / 900) * 10_000));
  assert.equal(Math.round(point.maxFavorableExcursionBps), Math.round(((965 - 900) / 900) * 10_000));
  assert.equal(point.reclaimedPreEventClose, true, "終値 960 がイベント前終値 900 を超えた");
}

function testIntradaySpikeIsNotAReclaim() {
  // 高値だけがイベント前終値を超え、終値は超えないケース。
  const stock: PriceSeries = {
    code: "1111",
    bars: [
      { date: DATES[0], open: 1000, high: 1005, low: 995, close: 1000, volume: 1_000_000 },
      { date: DATES[1], open: 1000, high: 1005, low: 995, close: 1000, volume: 1_000_000 },
      { date: DATES[2], open: 1000, high: 1000, low: 890, close: 900, volume: 1_000_000 },
      { date: DATES[3], open: 900, high: 950, low: 860, close: 870, volume: 1_000_000 },
      { date: DATES[4], open: 870, high: 930, low: 860, close: 880, volume: 1_000_000 },
    ],
  };
  const bench: PriceSeries = { code: "1306", bars: FLAT_BENCHMARK.bars.slice(0, 5) };
  const result = runEventStudy([subject()], new Map([["1111", stock]]), bench, params({ horizons: [1] }));
  const point = result.observations[0].horizons[0];
  assert.ok(point.maxFavorableExcursionBps > 0, "日中は上に振れている");
  assert.equal(
    point.reclaimedPreEventClose,
    false,
    "ヒゲが触れただけを回復と数えない（終値ベースで判定する）",
  );
}

function testSkipReasonsAreCounted() {
  const stock = series("1111", [1000, 1000, 900, 910, 920, 930, 940, 950, 960, 970]);
  const subjects: EventStudySubject[] = [
    subject(),
    subject({ id: "t-missing", code: "9999" }),
    subject({ id: "t-nodate", eventDate: "2030-01-01" }),
    subject({ id: "t-last", eventDate: DATES[9] }),
  ];
  const result = runEventStudy(subjects, new Map([["1111", stock]]), FLAT_BENCHMARK, params());
  assert.equal(result.skippedCounts.no_price_series, 1);
  assert.equal(result.skippedCounts.event_bar_missing, 1);
  assert.equal(result.skippedCounts.no_entry_bar, 1, "最終営業日のイベントはエントリーできない");
  assert.equal(result.observations.length + result.skipped.length, result.subjectCount);
}

function testInvalidParamsFailClosed() {
  const stock = series("1111", [1000, 1000, 900, 910, 920, 930, 940, 950, 960, 970]);
  const securities = new Map([["1111", stock]]);
  for (const [over, pattern] of [
    [{ horizons: [] }, /horizons must not be empty/],
    [{ horizons: [0] }, /horizon must be a positive/],
    [{ horizons: [1, 1] }, /duplicate horizon/],
    [{ entryOffsetBars: 0 }, /entryOffsetBars must be a positive/],
  ] as const) {
    assert.throws(
      () => runEventStudy([subject()], securities, FLAT_BENCHMARK, params(over as Partial<EventStudyParams>)),
      pattern,
    );
  }
}

function testOutputIsDeterministic() {
  const stock = series("1111", [1000, 1000, 900, 910, 920, 930, 940, 950, 960, 970]);
  const securities = new Map([["1111", stock]]);
  const first = runEventStudy([subject()], securities, FLAT_BENCHMARK, params());
  const second = runEventStudy([subject()], securities, FLAT_BENCHMARK, params());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
}

testEntryIsTheDayAfterTheEvent();
testAbnormalReturnIsBenchmarkAdjusted();
testTreatmentVersusControlDifference();
testSameDayEventsAreClustered();
testMissingHorizonIsReportedNotDropped();
testExcursionsAndReclaim();
testIntradaySpikeIsNotAReclaim();
testSkipReasonsAreCounted();
testInvalidParamsFailClosed();
testOutputIsDeterministic();

console.log("research/event-study: 全テスト成功");
