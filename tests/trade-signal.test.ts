// 売買計画シグナルのテスト。
//
// 守りたい性質:
//   1. 降り方（損切り・反証条件）を決めていない計画を作れない
//   2. 一次情報の URL が必須
//   3. 実績が無い Edge は「未検証」と明示される
//   4. 公開向け出力に価格・数量・方向を出さない

import assert from "node:assert/strict";
import { sizePosition } from "../src/execution/position-sizing.js";
import {
  assertTradeSignal,
  formatOwnerSignal,
  formatPublicSignal,
  type TradeSignal,
} from "../src/execution/trade-signal.js";

function signal(over: Partial<TradeSignal> = {}): TradeSignal {
  return {
    schemaVersion: 1,
    signalId: "sig-8136-2026-09-11",
    edgeId: "misconduct-overreaction-recovery",
    code: "8136",
    name: "サンリオ",
    side: "long",
    observedAt: "2026-09-10T15:30:00+09:00",
    referencePrice: 1000,
    entryMode: "next_open",
    stopPrice: 900,
    targetPrice: 1200,
    horizonBars: 20,
    validUntil: "2026-09-12",
    invalidation: ["会計不正へ拡大した場合", "監理銘柄指定"],
    evidenceUrls: ["https://www.release.tdnet.info/inbs/example.pdf"],
    trackRecord: null,
    ...over,
  };
}

const RECORD = {
  sampleCount: 130,
  clusterCount: 48,
  clusteredTStat: 1.42,
  meanNetAlphaBps: 38.5,
  trials: 3,
  asOf: "2026-09-10",
};

function testStopMustBeOnTheLosingSide() {
  assert.throws(
    () => assertTradeSignal(signal({ side: "long", stopPrice: 1100 })),
    /stopPrice must be on the losing side/,
    "損切りが利益側にある計画を作らせない",
  );
  assert.throws(
    () => assertTradeSignal(signal({ side: "short", referencePrice: 1000, stopPrice: 900, targetPrice: 800 })),
    /stopPrice must be on the losing side/,
  );
}

function testTargetMustBeOnTheWinningSide() {
  assert.throws(
    () => assertTradeSignal(signal({ targetPrice: 800 })),
    /targetPrice must be on the winning side/,
  );
}

function testInvalidationIsRequired() {
  assert.throws(
    () => assertTradeSignal(signal({ invalidation: [] })),
    /invalidation is required/,
    "降り方を決めていない計画は計画ではない",
  );
  assert.throws(() => assertTradeSignal(signal({ invalidation: ["  "] })), /invalidation\[0\]/);
}

function testEvidenceUrlIsRequired() {
  assert.throws(() => assertTradeSignal(signal({ evidenceUrls: [] })), /evidenceUrls is required/);
  assert.throws(
    () => assertTradeSignal(signal({ evidenceUrls: ["http://example.com/x"] })),
    /must use https/,
  );
}

function testLimitModeNeedsAPrice() {
  assert.throws(
    () => assertTradeSignal(signal({ entryMode: "limit" })),
    /limitPrice is required/,
  );
  assertTradeSignal(signal({ entryMode: "limit", limitPrice: 980 }));
}

function testUnvalidatedEdgeIsMarkedClearly() {
  const text = formatOwnerSignal(signal({ trackRecord: null }));
  assert.ok(text.includes("実績: **なし（未検証）**"));
  assert.ok(
    text.includes("まだ検証を通っていません"),
    "検証していないものを検証済みと同じ見た目で出さない",
  );
}

function testTrackRecordIsShownWithClusterAndTrials() {
  const text = formatOwnerSignal(signal({ trackRecord: RECORD }));
  assert.ok(text.includes("n=130"));
  assert.ok(text.includes("クラスタ 48"), "実効サンプル数を隠さない");
  assert.ok(text.includes("t=1.42"));
  assert.ok(text.includes("試行 3 回"), "試行回数を併記する");
}

function testUncomputableTStatIsNotShownAsZero() {
  const text = formatOwnerSignal(signal({ trackRecord: { ...RECORD, clusteredTStat: null } }));
  assert.ok(text.includes("算出不能"), "0 とすり替えない");
  assert.ok(!text.includes("t=0.00"));
}

function testOwnerOutputCarriesThePlan() {
  const text = formatOwnerSignal(signal());
  for (const fragment of ["8136 サンリオ", "買い方向", "損切り: 900", "目標: 1,200", "20営業日", "2026-09-12 まで有効"]) {
    assert.ok(text.includes(fragment), `オーナー向け出力に ${fragment} が無い`);
  }
  assert.ok(text.includes("損益比 2.0"), "リスクに対するリターンの比を出す");
  assert.ok(text.includes("会計不正へ拡大した場合"));
}

function testSizingIsEmbedded() {
  const sizing = sizePosition({
    side: "long", accountEquityJpy: 3_000_000, riskPerTradePct: 1,
    entryPrice: 1000, stopPrice: 900,
  });
  const text = formatOwnerSignal(signal({ sizing }));
  assert.ok(text.includes("3単元 300株"));
  assert.ok(text.includes("想定損失 30,000円"));
  assert.ok(text.includes("口座の 1.00%"));
}

function testRejectedSizingSaysDoNotOpen() {
  const sizing = sizePosition({
    side: "long", accountEquityJpy: 300_000, riskPerTradePct: 1,
    entryPrice: 5000, stopPrice: 4500,
  });
  const text = formatOwnerSignal(signal({ sizing }));
  assert.ok(text.includes("建てない"), "サイズが取れないことを曖昧にしない");
  assert.ok(text.includes("risk_budget_below_one_lot"));
}

function testPublicOutputHidesActionableDetail() {
  const text = formatPublicSignal(signal({ trackRecord: RECORD }));
  for (const forbidden of ["1000", "900", "1200", "買い方向", "損切り", "単元"]) {
    assert.ok(!text.includes(forbidden), `公開向け出力に ${forbidden} を出してはいけない`);
  }
  assert.ok(text.includes("8136 サンリオ"));
  assert.ok(text.includes("検証中（n=130）"));
}

function testPublicOutputMarksUnvalidated() {
  assert.ok(formatPublicSignal(signal({ trackRecord: null })).includes("未検証"));
}

function testInvalidFieldsFailClosed() {
  for (const [over, pattern] of [
    [{ code: "81" }, /4-5 alphanumeric/],
    [{ side: "flat" as never }, /side must be long or short/],
    [{ validUntil: "2026/09/12" }, /validUntil must be YYYY-MM-DD/],
    [{ referencePrice: 0 }, /referencePrice must be a positive/],
    [{ stopPrice: 0 }, /stopPrice must be a positive/],
    [{ horizonBars: 0 }, /horizonBars must be a positive/],
    [{ schemaVersion: 2 as never }, /schemaVersion must be 1/],
  ] as const) {
    assert.throws(() => assertTradeSignal(signal(over as Partial<TradeSignal>)), pattern);
  }
}

testStopMustBeOnTheLosingSide();
testTargetMustBeOnTheWinningSide();
testInvalidationIsRequired();
testEvidenceUrlIsRequired();
testLimitModeNeedsAPrice();
testUnvalidatedEdgeIsMarkedClearly();
testTrackRecordIsShownWithClusterAndTrials();
testUncomputableTStatIsNotShownAsZero();
testOwnerOutputCarriesThePlan();
testSizingIsEmbedded();
testRejectedSizingSaysDoNotOpen();
testPublicOutputHidesActionableDetail();
testPublicOutputMarksUnvalidated();
testInvalidFieldsFailClosed();

console.log("trade-signal: 全テスト成功");
