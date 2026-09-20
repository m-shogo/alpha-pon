// 零点（無作為に買ったときの超過）が 0 にならない理由のテスト。
//
// なぜ要るか（2026-09-21 に実データで測ったこと）:
//   指数 B は**日次の等加重リターンを繋いだ複利**（Π(1 + その日の平均)）。
//   無作為に1銘柄を買って h 日持つ A は**銘柄ごとの複利の平均**（平均_i Π(1 + r)）。
//   2期間で展開すると **A - B = Cov_i(r_i1, r_i2)**（期間をまたぐ銘柄横断の共分散）。
//   つまり符号は算術ではなく**データ**で決まる。上がった銘柄が上がり続ける傾向があれば正、
//   反転する傾向なら負。
//
//   研究期間（2024-06-19〜2025-06-30）の実測: A-B は
//   1日 +0.4 / 5日 +2.3 / 20日 +14.5 / 60日 +30.2bps。
//   測られていた零点（backtest 5日 +2.4・20日 +11.2 / イベントスタディ 5日 +1.9・
//   20日 +14.7・60日 +30.3bps）とほぼ一致する。
//   → 零点の主因は「指数の構成替え」ではなく**指数の作り方と、銘柄ごとの持続する差**。
//   1日でも残る +0.4bps のほうが構成のずれ（指数の母集団と標本の差）。
//
//   **この量は期間によって変わる**（共分散だから）。固定の定数として引いてはいけない。
//
// 守りたい性質:
//   1. 1期間（1日）では差が出ない（同じ母集団なら厳密に 0）
//   2. 銘柄ごとの差が持続するなら、保有を伸ばすほど差が広がる（実データと同じ符号）
//   3. 差が大きいほど開く
//   4. 反転する動きなら符号が逆になる（算術ではなくデータで決まることの証明）

import assert from "node:assert/strict";
import {
  buildUniverseBenchmark,
  DEFAULT_UNIVERSE_BENCHMARK_SETTINGS,
} from "../../src/research/signals/universe-benchmark.js";
import type { PriceSeries } from "../../src/research/backtest.js";

const DATES = Array.from({ length: 130 }, (_value, index) => {
  // 2025-01-06 から平日だけ並べる（暦日の飛びを小さく保つ）。
  const base = new Date("2025-01-06T00:00:00Z");
  let added = 0;
  const cursor = new Date(base);
  while (added < index) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return cursor.toISOString().slice(0, 10);
});

/**
 * 120銘柄。半分が毎日 +driftPct、半分が毎日 -driftPct（**差が持続する**）。
 * 実データと同じ向き（上がる銘柄は上がり続ける）の作り。
 */
function buildPersistentUniverse(driftPct: number): PriceSeries[] {
  return buildUniverse((code) => (code % 2 === 0 ? driftPct : -driftPct));
}

/** 半分が +driftPct と -driftPct を毎日入れ替える（**反転する**）。符号が逆になる場。 */
function buildAlternatingUniverse(driftPct: number): PriceSeries[] {
  return buildUniverse((code, day) => ((code + day) % 2 === 0 ? driftPct : -driftPct));
}

function buildUniverse(dailyPctOf: (code: number, day: number) => number): PriceSeries[] {
  return Array.from({ length: 120 }, (_value, code) => {
    let close = 1000;
    const bars = DATES.map((date, day) => {
      const previous = close;
      close = previous * (1 + dailyPctOf(code, day) / 100);
      return {
        date,
        open: previous,
        high: Math.max(previous, close),
        low: Math.min(previous, close),
        close,
        // 売買代金の下限（5億円/日）を確実に超える出来高。
        volume: 10_000_000,
      };
    });
    return { code: `1${String(code).padStart(4, "0")}`, bars };
  });
}

function gapBps(universe: PriceSeries[], horizon: number): number {
  const benchmark = buildUniverseBenchmark(universe, {
    ...DEFAULT_UNIVERSE_BENCHMARK_SETTINGS,
    corporateActionDates: new Map<string, Set<string>>(),
  });
  // 指数の最初の日は「前日が無い」ので落ちる。指数にある日で揃える。
  const entryDate = benchmark.series.bars[1]!.date;
  const benchmarkEntry = benchmark.series.bars.findIndex((bar) => bar.date === entryDate);
  const benchmarkExit = benchmarkEntry + horizon;
  const benchmarkReturn =
    (benchmark.series.bars[benchmarkExit]!.close - benchmark.series.bars[benchmarkEntry]!.close)
    / benchmark.series.bars[benchmarkEntry]!.close;

  const perStock = universe.map((series) => {
    const entry = series.bars.findIndex((bar) => bar.date === entryDate);
    const exit = entry + horizon;
    return (series.bars[exit]!.close - series.bars[entry]!.close) / series.bars[entry]!.close;
  });
  const stockMean = perStock.reduce((sum, value) => sum + value, 0) / perStock.length;
  return (stockMean - benchmarkReturn) * 10_000;
}

function testOneDayHasNoGap() {
  const gap = gapBps(buildPersistentUniverse(3), 1);
  assert.ok(Math.abs(gap) < 0.01, `1期間では差が出ない: ${gap.toFixed(4)}bps`);
}

function testGapGrowsWhenPerStockDifferencesPersist() {
  const universe = buildPersistentUniverse(1);
  const gaps = [1, 5, 20, 60].map((horizon) => gapBps(universe, horizon));
  for (const [index, gap] of gaps.entries()) {
    if (index === 0) continue;
    assert.ok(
      gap > gaps[index - 1]!,
      `差が持続するなら保有を伸ばすほど開く: ${gaps.map((one) => one.toFixed(1)).join(" → ")}`,
    );
  }
  assert.ok(gaps.at(-1)! > 100, `60日では明確な差になる: ${gaps.at(-1)!.toFixed(1)}bps`);
}

function testGapGrowsWithDispersion() {
  const small = gapBps(buildPersistentUniverse(0.5), 20);
  const large = gapBps(buildPersistentUniverse(2), 20);
  assert.ok(large > small * 4, `差が大きいほど開く: ${small.toFixed(1)} → ${large.toFixed(1)}bps`);
}

/**
 * 反転する動きでは符号が逆になる。
 * A-B は期間をまたぐ共分散なので、**算術で正に決まっているのではない**。
 * だから零点を固定の定数として引いてはいけない（期間ごとに測り直す）。
 */
function testMeanRevertingUniverseFlipsTheSign() {
  const gap = gapBps(buildAlternatingUniverse(3), 20);
  assert.ok(gap < 0, `反転する動きでは指数のほうが上に出る: ${gap.toFixed(1)}bps`);
}

/** 全銘柄が同じ動きなら差は出ない（ばらつきが理由であることの裏返し）。 */
function testNoGapWithoutDispersion() {
  assert.equal(gapBps(buildPersistentUniverse(0), 20), 0, "ばらつきが無ければ差は出ない");
}

testOneDayHasNoGap();
testGapGrowsWhenPerStockDifferencesPersist();
testGapGrowsWithDispersion();
testMeanRevertingUniverseFlipsTheSign();
testNoGapWithoutDispersion();

console.log("research/zero-point-compounding-gap: 全テスト成功");
