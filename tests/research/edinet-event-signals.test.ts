// EDINET のイベントを backtest のシグナルにするときの絞り方のテスト。
//
// なぜ要るか:
//   イベントスタディと backtest が別々の絞り方をすると、
//   「イベントスタディでは出たのに backtest では出ない」の原因が分からなくなる。
//   ここは両方が通る1本の経路なので、性質を固定する。
//
// 守りたい性質:
//   1. observedAt は**反応日の引け**（翌営業日の寄付で建てるため）
//   2. 流動性は反応日を**含む**直近20本で見る（反応日の出来高は判断時点で分かっている）
//   3. 決算日に当たるイベントは、呼び出し側が指定したときだけ落とす
//   4. 落としたものは理由つきで全部数える（黙って消えない）

import assert from "node:assert/strict";
import { buildEdinetEventSignals } from "../../src/research/signals/edinet-event-signals.js";
import type { EdinetReasonEvent } from "../../src/research/signals/edinet-reason-events.js";
import type { PriceSeries } from "../../src/research/backtest.js";

const DATES = Array.from({ length: 30 }, (_value, index) => {
  const cursor = new Date("2025-01-06T00:00:00Z");
  cursor.setUTCDate(cursor.getUTCDate() + index);
  return cursor.toISOString().slice(0, 10);
});

function series(code: string, turnoverJpy: number): PriceSeries {
  return {
    code,
    bars: DATES.map((date) => ({
      date,
      open: 1000,
      high: 1010,
      low: 990,
      close: 1000,
      volume: turnoverJpy / 1000,
    })),
  };
}

function event(over: Partial<EdinetReasonEvent> = {}): EdinetReasonEvent {
  return {
    eventId: "51100|2025-01-20",
    code: "51100",
    reactionDate: "2025-01-20",
    publishedAt: "2025-01-20T10:00:00+09:00",
    reasonCodes: ["第19条第2項第19号"],
    documentDescriptions: [],
    publishedBeforeClose: true,
    evidenceUrl: null,
    ...over,
  };
}

const EMPTY = new Map<string, ReadonlySet<string>>();

function testSignalIsObservedAtTheReactionClose() {
  const result = buildEdinetEventSignals({
    events: [event()],
    priceByCode: new Map([["51100", series("51100", 1_000_000_000)]]),
    knownEarningsByCode: EMPTY,
    minAverageTurnoverJpy: 500_000_000,
  });
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0]!.id, "51100|2025-01-20");
  assert.match(
    result.signals[0]!.observedAt,
    /^2025-01-20T15:30:00\+09:00$/,
    "反応日の引け（2024-11-05 以降は 15:30）",
  );
}

function testTurnoverIsJudgedAtTheReactionBar() {
  const thin = buildEdinetEventSignals({
    events: [event()],
    priceByCode: new Map([["51100", series("51100", 100_000_000)]]),
    knownEarningsByCode: EMPTY,
    minAverageTurnoverJpy: 500_000_000,
  });
  assert.deepEqual(thin.signals, [], "売買代金が足りなければ建てない");
  assert.equal(thin.rejectedCounts.below_min_turnover, 1);
}

function testKnownEarningsAreDroppedOnlyWhenAsked() {
  const prices = new Map([["51100", series("51100", 1_000_000_000)]]);
  const kept = buildEdinetEventSignals({
    events: [event()],
    priceByCode: prices,
    knownEarningsByCode: EMPTY,
    minAverageTurnoverJpy: 500_000_000,
  });
  assert.equal(kept.signals.length, 1, "空の Map を渡せば落とさない");
  const dropped = buildEdinetEventSignals({
    events: [event()],
    priceByCode: prices,
    knownEarningsByCode: new Map([["51100", new Set(["2025-01-20"])]]),
    minAverageTurnoverJpy: 500_000_000,
  });
  assert.deepEqual(dropped.signals, [], "決算日なら落とす");
  assert.equal(dropped.rejectedCounts.known_earnings, 1);
}

function testMissingPriceAndBarAreCounted() {
  const result = buildEdinetEventSignals({
    events: [
      event({ code: "99999", eventId: "99999|2025-01-20" }),
      event({ reactionDate: "2025-12-31", eventId: "51100|2025-12-31" }),
    ],
    priceByCode: new Map([["51100", series("51100", 1_000_000_000)]]),
    knownEarningsByCode: EMPTY,
    minAverageTurnoverJpy: 500_000_000,
  });
  assert.deepEqual(result.signals, []);
  assert.equal(result.rejectedCounts.no_price_series, 1, "価格系列が無い");
  assert.equal(result.rejectedCounts.no_reaction_bar, 1, "反応日に足が無い");
}

function testNegativeThresholdIsRejected() {
  assert.throws(
    () => buildEdinetEventSignals({
      events: [],
      priceByCode: new Map(),
      knownEarningsByCode: EMPTY,
      minAverageTurnoverJpy: -1,
    }),
    /0以上の数値/,
  );
}

testSignalIsObservedAtTheReactionClose();
testTurnoverIsJudgedAtTheReactionBar();
testKnownEarningsAreDroppedOnlyWhenAsked();
testMissingPriceAndBarAreCounted();
testNegativeThresholdIsRejected();

console.log("research/edinet-event-signals: 全テスト成功");
