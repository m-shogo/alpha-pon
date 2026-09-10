// matched drawdown control のテスト。
//
// 守りたい性質:
//   1. 同程度の下落を示した非イベント銘柄を選ぶ（generic reversal との比較）
//   2. treatment 自身・既知イベント日・除外銘柄を対照にしない
//   3. 対照が見つからなかった treatment を必ず報告する（生存バイアス回避）
//   4. 選定が決定論的
//   5. 対照にも treatment と同じガードを通す

import assert from "node:assert/strict";
import type { PriceSeries } from "../../src/research/backtest.js";
import {
  buildMatchedControls,
  type MatchedControlParams,
  type TreatmentEvent,
} from "../../src/research/signals/matched-controls.js";

const DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];

function series(code: string, closes: number[], volume = 2_000_000): PriceSeries {
  return {
    code,
    bars: closes.map((close, index) => {
      const open = index === 0 ? close : closes[index - 1];
      return {
        date: DATES[index], open,
        high: Math.max(open, close) + 5,
        low: Math.max(1, Math.min(open, close) - 5),
        close, volume,
      };
    }),
  };
}

const BENCHMARK = series("1306", [2000, 2000, 2000, 2000, 2000]);
const EVENT_DATE = "2026-01-07";

/** 2026-01-07 に指定 % 下げる銘柄を作る。 */
function dropOn07(code: string, pct: number, volume = 2_000_000): PriceSeries {
  const after = Math.round(1000 * (1 + pct / 100) * 100) / 100;
  return series(code, [1000, 1000, after, after, after], volume);
}

const TREATMENT: TreatmentEvent = {
  id: "t-1", code: "8136", date: EVENT_DATE, abnormalReturnPct: -12, averageTurnoverJpy: 2_000_000_000,
};

function params(over: Partial<MatchedControlParams> = {}): MatchedControlParams {
  return {
    abnormalReturnTolerancePct: 2,
    maxDateOffsetDays: 0,
    controlsPerTreatment: 2,
    allowReuse: false,
    knownEventDates: new Map(),
    corporateActionDates: new Map(),
    ...over,
  };
}

function pool(): Map<string, PriceSeries> {
  return new Map([
    ["8136", dropOn07("8136", -12)],   // treatment 自身
    ["1111", dropOn07("1111", -12)],   // ぴったり一致
    ["2222", dropOn07("2222", -11)],   // 許容内
    ["3333", dropOn07("3333", -5)],    // 許容外
    ["4444", dropOn07("4444", -13)],   // 許容内（差1.0）
  ]);
}

function testSelectsClosestMatches() {
  const result = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params());
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches.map((one) => one.controlCode), ["1111", "2222"], "差が小さい順");
  assert.equal(result.matches[0].abnormalReturnGapPct, 0);
  assert.equal(result.matches[0].controlDate, EVENT_DATE);
  assert.equal(result.unmatchedTreatmentIds.length, 0);
  assert.ok(result.rejectedCounts.abnormal_return_out_of_band > 0, "許容外は理由付きで落ちる");
}

function testSelectionPrefersClosestNotAlphabetical() {
  // 最も近い対照がコード順で後ろに来るケース。
  // コード順で選んでいると 1111 を先に採ってしまい、この検査で落ちる。
  const securities = new Map([
    ["8136", dropOn07("8136", -12)],
    ["1111", dropOn07("1111", -10.5)],  // 差 1.5（コード順では先頭）
    ["9111", dropOn07("9111", -12)],    // 差 0（コード順では末尾）
  ]);
  const result = buildMatchedControls([TREATMENT], securities, BENCHMARK, params({
    controlsPerTreatment: 1,
  }));
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].controlCode, "9111", "コード順ではなく異常リターン差の近い順で選ぶ");
  assert.equal(result.matches[0].abnormalReturnGapPct, 0);
}

function testSelectionPrefersNearerDate() {
  // 差が同じなら日付の近い方。
  const securities = new Map([
    ["8136", dropOn07("8136", -12)],
    ["1111", series("1111", [1000, 1000, 1000, 1000, 880])],  // 2日後
    ["2222", dropOn07("2222", -12)],                          // 同日
  ]);
  const result = buildMatchedControls([TREATMENT], securities, BENCHMARK, params({
    maxDateOffsetDays: 5, controlsPerTreatment: 1,
  }));
  assert.equal(result.matches[0].controlCode, "2222");
  assert.equal(result.matches[0].dateOffsetDays, 0, "差が同じなら日付が近い方");
}

function testTreatmentItselfIsNeverAControl() {
  const result = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params());
  assert.ok(
    result.matches.every((one) => one.controlCode !== "8136"),
    "treatment 銘柄を自分の対照にしない",
  );
  assert.ok(result.rejectedCounts.same_code > 0);
}

function testOtherTreatmentsAreNotControls() {
  const treatments: TreatmentEvent[] = [
    TREATMENT,
    { id: "t-2", code: "1111", date: EVENT_DATE, abnormalReturnPct: -12 },
  ];
  const result = buildMatchedControls(treatments, pool(), BENCHMARK, params({ controlsPerTreatment: 1 }));
  assert.ok(
    result.matches.every((one) => one.controlCode !== "1111" && one.controlCode !== "8136"),
    "他の treatment を対照に流用しない",
  );
  assert.ok(result.rejectedCounts.is_treatment > 0);
}

function testKnownEventDayIsNotAControl() {
  const result = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params({
    knownEventDates: new Map([["1111", new Set([EVENT_DATE])]]),
    controlsPerTreatment: 1,
  }));
  assert.equal(result.matches[0].controlCode, "2222", "決算日などが判っている銘柄は対照にしない");
  assert.ok(result.rejectedCounts.explained_by_known_event > 0);
}

function testExcludedCodesAreSkipped() {
  const result = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params({
    excludedCodes: new Set(["1111", "2222"]),
    controlsPerTreatment: 1,
  }));
  assert.equal(result.matches[0].controlCode, "4444");
  assert.ok(result.rejectedCounts.excluded_code > 0);
}

function testExcludedSampleKeysAreSkipped() {
  // 原因が特定できていない下落を対照に混ぜない。
  // 実は研究対象の事件だった場合、対照へ入れると差が過小評価される。
  const result = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params({
    excludedSampleKeys: new Set([`1111|${EVENT_DATE}`, `2222|${EVENT_DATE}`]),
    controlsPerTreatment: 1,
  }));
  assert.equal(result.matches[0].controlCode, "4444", "除外した (code,date) は対照にしない");
  assert.ok(result.rejectedCounts.excluded_sample > 0);
}

function testExcludedSampleKeysAreDateSpecific() {
  // 銘柄まるごとではなく (code, date) 単位で外せる。
  const securities = pool();
  securities.set("1111", series("1111", [1000, 1000, 880, 880, 880]));
  const result = buildMatchedControls([TREATMENT], securities, BENCHMARK, params({
    excludedSampleKeys: new Set(["1111|2026-01-05"]),
    controlsPerTreatment: 1,
  }));
  assert.equal(result.matches[0].controlCode, "1111", "別日は対照に使える");
  assert.equal(result.matches[0].controlDate, EVENT_DATE);
}

function testUnmatchedTreatmentIsReported() {
  const lonely: TreatmentEvent = { id: "t-x", code: "8136", date: EVENT_DATE, abnormalReturnPct: -30 };
  const result = buildMatchedControls([lonely], pool(), BENCHMARK, params());
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.unmatchedTreatmentIds, ["t-x"], "見つからなかった分を隠さない");
}

function testPartialMatchIsReported() {
  const result = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params({
    controlsPerTreatment: 5,
  }));
  assert.deepEqual(result.partiallyMatched, [{ treatmentId: "t-1", found: 3, requested: 5 }]);
}

function testReuseIsControlledByFlag() {
  const treatments: TreatmentEvent[] = [
    { id: "t-a", code: "8136", date: EVENT_DATE, abnormalReturnPct: -12 },
    { id: "t-b", code: "9999", date: EVENT_DATE, abnormalReturnPct: -12 },
  ];
  const securities = pool();
  securities.set("9999", dropOn07("9999", -12));

  const noReuse = buildMatchedControls(treatments, securities, BENCHMARK, params({
    controlsPerTreatment: 1, allowReuse: false,
  }));
  const usedCodes = noReuse.matches.map((one) => one.controlCode);
  assert.equal(new Set(usedCodes).size, usedCodes.length, "同じ対照を使い回さない");
  assert.ok(noReuse.rejectedCounts.already_used > 0);

  const withReuse = buildMatchedControls(treatments, securities, BENCHMARK, params({
    controlsPerTreatment: 1, allowReuse: true,
  }));
  assert.deepEqual(withReuse.matches.map((one) => one.controlCode), ["1111", "1111"], "許可すれば共有できる");
}

function testDateWindow() {
  // 2026-01-08 に下げる銘柄。同日限定なら選ばれない。
  const securities = new Map([
    ["8136", dropOn07("8136", -12)],
    ["5555", series("5555", [1000, 1000, 1000, 880, 880])],
  ]);
  const sameDayOnly = buildMatchedControls([TREATMENT], securities, BENCHMARK, params());
  assert.equal(sameDayOnly.matches.length, 0);
  assert.ok(sameDayOnly.rejectedCounts.date_out_of_window > 0);

  const windowed = buildMatchedControls([TREATMENT], securities, BENCHMARK, params({
    maxDateOffsetDays: 2, controlsPerTreatment: 1,
  }));
  assert.equal(windowed.matches.length, 1);
  assert.equal(windowed.matches[0].controlDate, "2026-01-08");
  assert.equal(windowed.matches[0].dateOffsetDays, 1);
}

function testTurnoverRatioBand() {
  const securities = pool();
  securities.set("6666", dropOn07("6666", -12, 10));  // 極端に薄い
  const result = buildMatchedControls([TREATMENT], securities, BENCHMARK, params({
    turnoverRatioBand: [0.2, 5], controlsPerTreatment: 5,
  }));
  assert.ok(
    result.matches.every((one) => one.controlCode !== "6666"),
    "売買代金が桁違いの銘柄を対照にしない",
  );
  assert.ok(result.rejectedCounts.turnover_ratio_out_of_band > 0);
}

function testGuardsApplyToControlsToo() {
  const securities = pool();
  // 売買停止明け。1日の値動きに見えるが実際は多日分。
  securities.set("7777", {
    code: "7777",
    bars: [
      { date: "2025-10-01", open: 1000, high: 1010, low: 990, close: 1000, volume: 2_000_000 },
      { date: EVENT_DATE, open: 880, high: 890, low: 870, close: 880, volume: 2_000_000 },
    ],
  });
  const result = buildMatchedControls([TREATMENT], securities, BENCHMARK, params({ controlsPerTreatment: 5 }));
  assert.ok(
    result.matches.every((one) => one.controlCode !== "7777"),
    "対照にも treatment と同じガードを通す",
  );
  assert.ok(result.rejectedCounts.guard_failed > 0);
}

function testOutputIsDeterministic() {
  const first = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params());
  const second = buildMatchedControls([TREATMENT], pool(), BENCHMARK, params());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
}

function testInvalidParamsFailClosed() {
  for (const [over, pattern] of [
    [{ abnormalReturnTolerancePct: 0 }, /abnormalReturnTolerancePct/],
    [{ abnormalReturnTolerancePct: -1 }, /abnormalReturnTolerancePct/],
    [{ maxDateOffsetDays: -1 }, /maxDateOffsetDays/],
    [{ controlsPerTreatment: 0 }, /controlsPerTreatment/],
    [{ turnoverRatioBand: [0, 5] as const }, /turnoverRatioBand/],
    [{ turnoverRatioBand: [5, 1] as const }, /turnoverRatioBand/],
  ] as const) {
    assert.throws(
      () => buildMatchedControls([], new Map(), BENCHMARK, params(over as Partial<MatchedControlParams>)),
      pattern,
    );
  }
}

testSelectsClosestMatches();
testSelectionPrefersClosestNotAlphabetical();
testSelectionPrefersNearerDate();
testTreatmentItselfIsNeverAControl();
testOtherTreatmentsAreNotControls();
testKnownEventDayIsNotAControl();
testExcludedCodesAreSkipped();
testExcludedSampleKeysAreSkipped();
testExcludedSampleKeysAreDateSpecific();
testUnmatchedTreatmentIsReported();
testPartialMatchIsReported();
testReuseIsControlledByFlag();
testDateWindow();
testTurnoverRatioBand();
testGuardsApplyToControlsToo();
testOutputIsDeterministic();
testInvalidParamsFailClosed();

console.log("research/matched-controls: 全テスト成功");
