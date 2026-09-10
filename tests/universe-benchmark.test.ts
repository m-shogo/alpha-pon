// ユニバース由来ベンチマークのテスト。
//
// なぜ要るか（実測 2026-09-11、流動810銘柄の β 推定）:
//   benchmark = 1306 ETF            β中央 0.54  平均 0.59
//   benchmark = 同じ810本の等加重指数  β中央 0.92  平均 1.00
//
// 等加重の銘柄群に対する市場βの平均は定義上 1。0.59 は
// 説明変数側の測定誤差（ETF終値 ≠ 指数）で β が一様に 0 へ引かれた結果。
//
// 守りたい性質:
//   1. 構成銘柄は「その日までに分かっている実績」で決める（先読み禁止）
//   2. 当日の出来高で構成銘柄を決めない（事件で跳ねた銘柄が入る）
//   3. 構成銘柄が少ない日は指数を出さない（数銘柄の事件が市場になる）
//   4. 売買停止明けの「1日の値動き」を市場リターンに混ぜない

import assert from "node:assert/strict";
import {
  DEFAULT_UNIVERSE_BENCHMARK_PARAMS,
  UNIVERSE_BENCHMARK_CODE,
  buildUniverseBenchmark,
  type UniverseBenchmarkParams,
} from "../src/research/signals/universe-benchmark.js";
import type { PriceSeries } from "../src/research/backtest.js";

const PARAMS: UniverseBenchmarkParams = {
  minAverageTurnoverJpy: 1_000_000,
  turnoverLookbackBars: 2,
  minConstituents: 2,
  maxPriorGapDays: 10,
};

function isoDate(offset: number): string {
  return new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10);
}

/** 一定リターンで伸びる系列。売買代金は close×volume。 */
function series(code: string, input: {
  returnsPct: readonly number[];
  volume?: number;
  startClose?: number;
  dates?: readonly string[];
}): PriceSeries {
  let close = input.startClose ?? 1000;
  const volume = input.volume ?? 10_000;
  const bars = [{ date: input.dates?.[0] ?? isoDate(0), open: close, high: close, low: close, close, volume }];
  for (const [index, returnPct] of input.returnsPct.entries()) {
    close *= 1 + returnPct / 100;
    bars.push({
      date: input.dates?.[index + 1] ?? isoDate(index + 1),
      open: close, high: close, low: close, close, volume,
    });
  }
  return { code, bars };
}

function testEqualWeightedReturn(): void {
  // +2% と -1% の等加重は +0.5%。
  const result = buildUniverseBenchmark([
    series("10000", { returnsPct: [0, 0, 2] }),
    series("20000", { returnsPct: [0, 0, -1] }),
  ], PARAMS);

  const last = result.days.at(-1)!;
  assert.ok(Math.abs(last.returnPct - 0.5) < 1e-9, `returnPct=${last.returnPct}`);
  assert.equal(last.constituents, 2);
  assert.equal(result.series.code, UNIVERSE_BENCHMARK_CODE);
  assert.equal(result.series.bars.length, result.days.length);
}

function testLevelCompoundsFromOneHundred(): void {
  const result = buildUniverseBenchmark([
    series("10000", { returnsPct: [0, 0, 10, 10] }),
    series("20000", { returnsPct: [0, 0, 10, 10] }),
  ], PARAMS);
  const levels = result.days.map((day) => day.level);
  // 売買代金の窓（2本）が埋まるまでは構成銘柄に入らないので、
  // 指数に載るのは 0%, +10%, +10% の3日ぶん。
  assert.equal(levels.length, 3, JSON.stringify(levels));
  assert.ok(Math.abs(levels[0]! - 100) < 1e-9, "最初の採用日は 0% なので 100 のまま");
  assert.ok(Math.abs(levels.at(-1)! - 100 * 1.1 * 1.1) < 1e-9, JSON.stringify(levels));
}

function testConstituentsUsePriorTurnoverNotToday(): void {
  // 当日の出来高で選ぶと、事件で出来高が跳ねた銘柄がその日だけ市場に入る。
  // 「事件の日にだけ流動的になる銘柄」を用意して、入らないことを確かめる。
  const quiet = series("30000", { returnsPct: [0, 0, -30], volume: 1 });
  // 最終日だけ出来高が跳ねる。
  quiet.bars[quiet.bars.length - 1]!.volume = 10_000_000;

  const result = buildUniverseBenchmark([
    series("10000", { returnsPct: [0, 0, 1] }),
    series("20000", { returnsPct: [0, 0, 1] }),
    quiet,
  ], PARAMS);

  const last = result.days.at(-1)!;
  assert.equal(last.constituents, 2, "当日跳ねた銘柄は構成に入らない");
  assert.ok(Math.abs(last.returnPct - 1) < 1e-9, `-30% が混ざっている: ${last.returnPct}`);
}

function testIlliquidNamesAreExcluded(): void {
  const result = buildUniverseBenchmark([
    series("10000", { returnsPct: [0, 0, 1] }),
    series("20000", { returnsPct: [0, 0, 1] }),
    series("30000", { returnsPct: [0, 0, -50], volume: 1 }),
  ], PARAMS);
  assert.equal(result.days.at(-1)!.constituents, 2);
}

function testTooFewConstituentsProducesNoBar(): void {
  // 数銘柄の平均を「市場」として使うと、その数銘柄の事件が市場の動きになる。
  const result = buildUniverseBenchmark([
    series("10000", { returnsPct: [0, 0, 1] }),
    series("20000", { returnsPct: [0, 0, 1] }),
  ], { ...PARAMS, minConstituents: 5 });
  assert.deepEqual(result.days, []);
  assert.deepEqual(result.series.bars, []);
}

function testSkippedDatesAreReportedNotHidden(): void {
  // 途中で構成銘柄が足りなくなった日は報告する。黙って飛ばすと
  // 「その日は市場が動かなかった」と読まれる。
  const dates = [0, 1, 2, 3, 4].map(isoDate);
  const a = series("10000", { returnsPct: [0, 0, 1, 1], dates });
  const b = series("20000", { returnsPct: [0, 0, 1, 1], dates });
  // b の最終日を落とす。
  b.bars.pop();

  const result = buildUniverseBenchmark([a, b], PARAMS);
  assert.deepEqual(result.skippedDates, [dates[4]], "構成不足の日を報告する");
  assert.ok(!result.days.some((day) => day.date === dates[4]));
}

function testSuspensionGapIsNotCountedAsOneDayMove(): void {
  // 停止明けの1本は数週間ぶんの値動き。**他の銘柄が普通に動いている同じ日に**
  // それを混ぜると、市場が動いたことになってしまう。
  const activeDates = [0, 1, 2, 38, 39, 40].map(isoDate);
  // C は 0,1,2 のあと 40 まで停止（38日の空白）。明けの日に -60%。
  const haltedDates = [isoDate(0), isoDate(1), isoDate(2), isoDate(40)];

  const result = buildUniverseBenchmark([
    series("10000", { returnsPct: [0, 0, 1, 1, 1], dates: activeDates }),
    series("20000", { returnsPct: [0, 0, 1, 1, 1], dates: activeDates }),
    series("30000", { returnsPct: [0, 0, -60], dates: haltedDates }),
  ], PARAMS);

  const reopen = result.days.find((day) => day.date === isoDate(40));
  assert.ok(reopen, "他の2銘柄は普通に立っているので指数は出る");
  assert.equal(reopen.constituents, 2, "停止をまたいだ銘柄は構成に入らない");
  assert.ok(
    Math.abs(reopen.returnPct - 1) < 1e-9,
    `停止明けの -60% が市場リターンに混ざっている: ${reopen.returnPct}`,
  );
}

function testParamsValidation(): void {
  const bad = (patch: Partial<UniverseBenchmarkParams>) =>
    () => buildUniverseBenchmark([], { ...PARAMS, ...patch });
  assert.throws(bad({ minAverageTurnoverJpy: -1 }), /minAverageTurnoverJpy/);
  assert.throws(bad({ turnoverLookbackBars: 0 }), /turnoverLookbackBars/);
  assert.throws(bad({ minConstituents: 0 }), /minConstituents/);
  assert.throws(bad({ maxPriorGapDays: 0 }), /maxPriorGapDays/);
}

function testEmptyUniverse(): void {
  const result = buildUniverseBenchmark([], PARAMS);
  assert.deepEqual(result.days, []);
  assert.deepEqual(result.skippedDates, []);
}

function testDefaultsAreConservative(): void {
  assert.ok(DEFAULT_UNIVERSE_BENCHMARK_PARAMS.minConstituents >= 100,
    "少数銘柄を市場と呼ばない");
  assert.ok(DEFAULT_UNIVERSE_BENCHMARK_PARAMS.minAverageTurnoverJpy > 0,
    "非流動銘柄の古い終値を市場リターンに混ぜない");
}

testEqualWeightedReturn();
testLevelCompoundsFromOneHundred();
testConstituentsUsePriorTurnoverNotToday();
testIlliquidNamesAreExcluded();
testTooFewConstituentsProducesNoBar();
testSkippedDatesAreReportedNotHidden();
testSuspensionGapIsNotCountedAsOneDayMove();
testParamsValidation();
testEmptyUniverse();
testDefaultsAreConservative();

console.log("universe-benchmark: 全テスト成功");
