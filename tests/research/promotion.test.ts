import assert from "node:assert/strict";
import {
  checkProductionIntegrity,
  evaluateGate,
  isInHoldout,
  type HoldoutAccessEntry,
  type HoldoutManifest,
} from "../../src/research/promotion.js";
import { GATE_KEYS, type Edge } from "../../src/research/types.js";
import { makeEdge, makeState } from "./helpers.js";

const AS_OF = "2024-02-01";

function passAllGates(edge: Edge): Edge {
  for (const key of GATE_KEYS) {
    edge.promotionGate[key] = { state: "pass", evidence: `テスト根拠(${key})`, checkedAt: AS_OF };
  }
  return edge;
}

const ACCESS: HoldoutAccessEntry = {
  schemaVersion: 1,
  id: "access-1",
  edgeId: "fixture-complete-edge",
  windowId: "vault-2025h2-2026h1",
  openedAt: "2024-02-01T10:00:00+09:00",
  actor: "test",
  purpose: "production_gate",
  result: "pass",
};

function testUnknownGateBlocksPromotion() {
  const evaluation = evaluateGate(makeEdge(), makeState(), [], AS_OF);
  assert.equal(evaluation.promotable, false);
  assert.ok(evaluation.blockers.length > 0, "未確認の Gate は昇格を止める");
  console.log("research/promotion: 未確認 Gate の遮断 OK");
}

function testSampleShortfallIsCaught() {
  const edge = passAllGates(makeEdge()); // samples: 4/20
  const evaluation = evaluateGate(edge, makeState({ edges: [edge] }), [ACCESS], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "sufficientSamples"),
    "pass と書いてもサンプルが足りなければ通さない",
  );
  console.log("research/promotion: サンプル数の裏取り OK");
}

function testHoldoutPassRequiresAccessRecord() {
  const edge = passAllGates(makeEdge());
  edge.samples.current = 20;
  const evaluation = evaluateGate(edge, makeState({ edges: [edge] }), [], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "holdoutPass"),
    "開封記録の無い Holdout PASS は認めない",
  );
  console.log("research/promotion: Holdout 開封記録の必須化 OK");
}

function testCounterfactualRequired() {
  const edge = passAllGates(makeEdge());
  edge.samples.current = 20;
  const evaluation = evaluateGate(edge, makeState({ edges: [edge] }), [ACCESS], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "counterfactualExplained"),
    "Counterfactual が 1 件も無ければ説明可能とは言えない",
  );
  console.log("research/promotion: Counterfactual の必須化 OK");
}

function testUnresolvedConfounderBlocks() {
  const edge = passAllGates(makeEdge({ analogIds: ["analog-x"] }));
  edge.samples.current = 20;
  const state = makeState({
    edges: [edge],
    confounders: [
      {
        schemaVersion: 1,
        id: "confounder-1",
        analogId: "analog-x",
        category: "earnings",
        date: "2024-01-10",
        description: "同日に決算発表があった",
        handling: "acknowledged_unresolved",
        recordedAt: "2024-01-11",
      },
    ],
  });
  const evaluation = evaluateGate(edge, state, [ACCESS], AS_OF);
  assert.ok(
    evaluation.unsupportedPasses.some((item) => item.gate === "confoundersRemoved"),
    "未処理の交絡が残っていたら除去済みとは言えない",
  );
  console.log("research/promotion: 未処理 Confounder の遮断 OK");
}

function testProductionWithoutGateIsIntegrityError() {
  const edge = makeEdge({ status: "production" });
  const issues = checkProductionIntegrity(makeState({ edges: [edge] }), [], AS_OF);
  assert.ok(
    issues.some((issue) => issue.code === "unverified_production"),
    "Gate を通さない production は CI エラー",
  );
  console.log("research/promotion: 未検証 Production の禁止 OK");
}

function testHoldoutWindowMembership() {
  const manifest: HoldoutManifest = {
    schemaVersion: 1,
    sealedAt: "2026-08-04",
    policy: "テスト用の封印ポリシー",
    windows: [
      { id: "w1", from: "2025-07-01", to: "2026-06-30", scope: "all_universe" },
      { id: "w2", from: "2024-01-01", to: "2024-12-31", scope: "named_codes", codes: ["8136"] },
    ],
  };
  assert.equal(isInHoldout(manifest, "9999", "2026-01-01"), true, "全銘柄封印の期間内");
  assert.equal(isInHoldout(manifest, "9999", "2024-06-01"), false, "named_codes に含まれない銘柄は対象外");
  assert.equal(isInHoldout(manifest, "8136", "2024-06-01"), true);
  console.log("research/promotion: Holdout 範囲判定 OK");
}

testUnknownGateBlocksPromotion();
testSampleShortfallIsCaught();
testHoldoutPassRequiresAccessRecord();
testCounterfactualRequired();
testUnresolvedConfounderBlocks();
testProductionWithoutGateIsIntegrityError();
testHoldoutWindowMembership();

console.log("research/promotion: 全テスト成功");
