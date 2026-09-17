// 価格の集合を「期間中に一度でも流動だった銘柄」で絞るテスト。
//
// 守りたい性質:
//   1. 期間の途中だけ流動だった銘柄も残す（期間の最後で絞ると先読みになる）
//   2. 検出器（その日を含む窓）と backtest（前日までの窓）のどちらで通る銘柄も落とさない
//   3. 一度も閾値に届かない銘柄は落とす

import assert from "node:assert/strict";
import type { PriceSeries } from "../../src/research/backtest.js";
import { maxTrailingAverageTurnoverJpy } from "../../src/research/study-inputs-from-store.js";

function series(turnovers: number[]): PriceSeries {
  return {
    code: "1111",
    bars: turnovers.map((turnover, index) => ({
      date: `2025-01-${String(index + 1).padStart(2, "0")}`,
      open: 100, high: 100, low: 100, close: 100,
      volume: turnover / 100,
    })),
  };
}

function testMidPeriodLiquidityIsKept() {
  // 前半だけ売買が多く、後半は薄い（＝期間の最後の窓では落ちていた銘柄）。
  const turnovers = [...Array(5).fill(1_000), ...Array(10).fill(0)];
  const s = series(turnovers);
  assert.equal(maxTrailingAverageTurnoverJpy(s, 5), 1_000, "途中の窓の最大を返す");
  const lastWindow = turnovers.slice(-5).reduce((a, b) => a + b, 0) / 5;
  assert.equal(lastWindow, 0, "前提: 期間の最後の窓では 0");
}

function testPartialWindowsAtTheStartAreIncluded() {
  // 検出器の窓は期首で本数が足りなくても平均を取る。その値も上位集合に含める。
  const s = series([900, 0, 0, 0, 0, 0]);
  assert.equal(maxTrailingAverageTurnoverJpy(s, 5), 900, "1本だけの窓（900）が最大");
}

function testEveryWindowIsBelowTheMaximum() {
  const turnovers = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9].map((x) => x * 100);
  const s = series(turnovers);
  const best = maxTrailingAverageTurnoverJpy(s, 4);
  let brute = 0;
  for (let end = 0; end < turnovers.length; end += 1) {
    const window = turnovers.slice(Math.max(0, end - 3), end + 1);
    brute = Math.max(brute, window.reduce((a, b) => a + b, 0) / window.length);
  }
  assert.ok(Math.abs(best - brute) < 1e-9, `総当たりと一致する（${best} vs ${brute}）`);
}

function testEmptySeriesIsZero() {
  assert.equal(maxTrailingAverageTurnoverJpy({ code: "1111", bars: [] }, 20), 0);
}

testMidPeriodLiquidityIsKept();
testPartialWindowsAtTheStartAreIncluded();
testEveryWindowIsBelowTheMaximum();
testEmptySeriesIsZero();

console.log("research/study-inputs-liquidity: 全テスト成功");
