// 発注サイズ決定のテスト。
//
// 守りたい性質（これが無いと期待値プラスでも破産する）:
//   1. 1単元も許容リスクに収まらないなら買わない
//   2. 許容リスクを超えるサイズを返さない
//   3. どの制約でサイズが決まったかを必ず返す
//   4. 単元株に切り捨てる

import assert from "node:assert/strict";
import {
  sizePosition,
  type PositionSizingInput,
} from "../src/execution/position-sizing.js";

function input(over: Partial<PositionSizingInput> = {}): PositionSizingInput {
  return {
    side: "long",
    accountEquityJpy: 3_000_000,
    riskPerTradePct: 1,
    entryPrice: 1000,
    stopPrice: 900,
    ...over,
  };
}

function testRiskDrivesTheSize() {
  // 口座300万 × 1% = 3万円のリスク。1株あたり100円逆行 → 300株 = 3単元。
  const result = sizePosition(input());
  assert.equal(result.rejected, false);
  assert.equal(result.lots, 3);
  assert.equal(result.shares, 300);
  assert.equal(result.riskJpy, 30_000);
  assert.equal(result.riskPctOfEquity, 1);
  assert.equal(result.bindingConstraint, "risk");
}

function testNeverExceedsTheRiskBudget() {
  // 端数は切り捨てる。3.5単元分のリスク許容でも3単元まで。
  const result = sizePosition(input({ riskPerTradePct: 1.16 }));
  assert.equal(result.lots, 3, "3.48単元 → 3単元へ切り捨て");
  assert.ok(result.riskJpy <= 3_000_000 * 0.0116, "許容リスクを超えない");
}

function testRefusesWhenOneLotExceedsRisk() {
  // 5000円の株、ストップ4500円 → 1単元のリスク5万円。許容3万円では買わない。
  const result = sizePosition(input({ entryPrice: 5000, stopPrice: 4500 }));
  assert.equal(result.rejected, true);
  assert.equal(result.rejectReason, "risk_budget_below_one_lot");
  assert.equal(result.lots, 0, "「1単元くらいなら」を作らない");
  assert.ok(result.warnings.some((one) => one.includes("ストップを近づけるか")));
}

function testWideStopShrinksSize() {
  // ストップが遠いほど買える量は減る。同じリスクを保つため。
  const tight = sizePosition(input({ stopPrice: 950 }));
  const wide = sizePosition(input({ stopPrice: 800 }));
  assert.ok(tight.lots > wide.lots, "ストップが近いほど大きく建てられる");
  assert.ok(Math.abs(tight.riskJpy - wide.riskJpy) <= 30_000 * 0.5, "どちらも許容リスク内に収まる");
}

function testMaxPositionCap() {
  // リスク的には10単元建てられるが、1銘柄上限20%（60万円 = 6単元）で頭打ち。
  const result = sizePosition(input({ stopPrice: 970, maxPositionPct: 20 }));
  assert.equal(result.bindingConstraint, "max_position");
  assert.equal(result.lots, 6);
  assert.ok(result.riskJpy < 30_000, "上限に当たった分リスクは許容以下になる");
}

function testConcurrencyCap() {
  // 同時5銘柄 → 1銘柄60万円 = 6単元。
  const result = sizePosition(input({ stopPrice: 970, maxConcurrentPositions: 5 }));
  assert.equal(result.bindingConstraint, "concurrency");
  assert.equal(result.lots, 6);
}

function testLiquidityCap() {
  // 日商1000万円の5% = 50万円 → 5単元。
  const result = sizePosition(input({
    stopPrice: 970, averageTurnoverJpy: 10_000_000, participationLimitPct: 5,
  }));
  assert.equal(result.bindingConstraint, "liquidity");
  assert.equal(result.lots, 5);
}

function testTightestConstraintWins() {
  const result = sizePosition(input({
    stopPrice: 990,                    // risk: 30単元
    maxPositionPct: 50,                // 15単元
    maxConcurrentPositions: 10,        // 3単元 ← 最も厳しい
    averageTurnoverJpy: 100_000_000,
    participationLimitPct: 5,          // 50単元
  }));
  assert.equal(result.bindingConstraint, "concurrency");
  assert.equal(result.lots, 3);
  assert.equal(result.lotsByConstraint.risk, 30);
  assert.equal(result.lotsByConstraint.max_position, 15);
  assert.equal(result.lotsByConstraint.liquidity, 50);
}

function testShortSide() {
  const result = sizePosition(input({ side: "short", entryPrice: 1000, stopPrice: 1100 }));
  assert.equal(result.rejected, false);
  assert.equal(result.lots, 3);
  assert.equal(result.riskJpy, 30_000);
}

function testStopOnWrongSideIsRejected() {
  assert.equal(
    sizePosition(input({ side: "long", stopPrice: 1100 })).rejectReason,
    "stop_on_wrong_side",
  );
  assert.equal(
    sizePosition(input({ side: "short", entryPrice: 1000, stopPrice: 900 })).rejectReason,
    "stop_on_wrong_side",
  );
  assert.equal(sizePosition(input({ stopPrice: 1000 })).rejectReason, "stop_equals_entry");
}

function testInvalidPricesAndEquity() {
  assert.equal(sizePosition(input({ accountEquityJpy: 0 })).rejectReason, "non_positive_equity");
  assert.equal(sizePosition(input({ entryPrice: 0 })).rejectReason, "non_positive_price");
  assert.equal(sizePosition(input({ stopPrice: 0 })).rejectReason, "non_positive_price");
}

function testCustomLotSize() {
  const result = sizePosition(input({ lotSize: 1 }));
  assert.equal(result.shares, 300, "1株単位でも同じリスク額に収まる");
  assert.equal(result.lots, 300);
}

function testLeverageIsWarnedNotSilent() {
  // ストップが極端に近いと建玉が口座を超える。信用前提であることを黙らない。
  const result = sizePosition(input({ stopPrice: 999, riskPerTradePct: 5 }));
  assert.equal(result.rejected, false);
  assert.ok(result.notionalJpy > 3_000_000);
  assert.ok(result.warnings.some((one) => one.includes("信用取引前提")));
}

function testInvalidParamsThrow() {
  for (const [over, pattern] of [
    [{ riskPerTradePct: 0 }, /riskPerTradePct/],
    [{ riskPerTradePct: 101 }, /riskPerTradePct/],
    [{ lotSize: 0 }, /lotSize/],
    [{ maxPositionPct: 0 }, /maxPositionPct/],
    [{ maxConcurrentPositions: 0 }, /maxConcurrentPositions/],
    [{ side: "flat" as never }, /side must be long or short/],
  ] as const) {
    assert.throws(() => sizePosition(input(over as Partial<PositionSizingInput>)), pattern);
  }
}

testRiskDrivesTheSize();
testNeverExceedsTheRiskBudget();
testRefusesWhenOneLotExceedsRisk();
testWideStopShrinksSize();
testMaxPositionCap();
testConcurrencyCap();
testLiquidityCap();
testTightestConstraintWins();
testShortSide();
testStopOnWrongSideIsRejected();
testInvalidPricesAndEquity();
testCustomLotSize();
testLeverageIsWarnedNotSilent();
testInvalidParamsThrow();

console.log("position-sizing: 全テスト成功");
