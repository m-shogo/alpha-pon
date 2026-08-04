import assert from "node:assert/strict";
import {
  buildEdgeIndex,
  checkEdgeRegistry,
  hypothesisFingerprint,
  hypothesisSimilarity,
} from "../../src/research/edge-registry.js";
import { makeAnalog, makeEdge, makeState } from "./helpers.js";

function codes(issues: ReturnType<typeof checkEdgeRegistry>): string[] {
  return issues.map((issue) => issue.code);
}

function testFingerprintIgnoresFormatting() {
  const a = "イベント X の後、対象銘柄は 5 営業日で超過収益を生む。";
  const b = "イベントXの後、対象銘柄は5営業日で超過収益を生む";
  assert.equal(hypothesisFingerprint(a), hypothesisFingerprint(b), "表記ゆれを吸収する");
  assert.notEqual(hypothesisFingerprint(a), hypothesisFingerprint("まったく別の仮説を書いた場合"));
  console.log("research/registry: フィンガープリント OK");
}

function testDuplicateHypothesisIsError() {
  const state = makeState({
    edges: [makeEdge({ id: "edge-a" }), makeEdge({ id: "edge-b" })],
  });
  assert.ok(codes(checkEdgeRegistry(state)).includes("duplicate_hypothesis"), "同一仮説はエラー");
  console.log("research/registry: 重複 Edge 検出 OK");
}

function testNearDuplicateHypothesis() {
  const base = makeEdge({ id: "edge-a" });
  const near = makeEdge({ id: "edge-b", hypothesis: `${base.hypothesis}（微修正）` });
  const similarity = hypothesisSimilarity(base.hypothesis, near.hypothesis);
  assert.ok(similarity > 0.75 && similarity < 1, `類似度が想定外: ${similarity}`);
  const issues = checkEdgeRegistry(makeState({ edges: [base, near] }));
  assert.ok(
    codes(issues).some((code) => code === "near_duplicate_hypothesis" || code === "similar_hypothesis"),
    "ほぼ同一の仮説を検出する",
  );
  console.log("research/registry: 近似重複の検出 OK");
}

function testDuplicateAnalog() {
  const state = makeState({
    analogs: [makeAnalog({ id: "analog-a" }), makeAnalog({ id: "analog-b" })],
  });
  assert.ok(codes(checkEdgeRegistry(state)).includes("duplicate_analog"), "同一会社・同一日・同一事象は重複");
  console.log("research/registry: 重複 Historical 検出 OK");
}

function testDanglingReferences() {
  const state = makeState({ edges: [makeEdge({ analogIds: ["missing-analog"] })] });
  assert.ok(codes(checkEdgeRegistry(state)).includes("dangling_analog_ref"));
  console.log("research/registry: 参照切れ検出 OK");
}

function testUnevidencedGatePass() {
  const edge = makeEdge();
  edge.promotionGate.netAlphaPositive = { state: "pass" };
  const issues = checkEdgeRegistry(makeState({ edges: [edge] }));
  assert.ok(codes(issues).includes("unevidenced_gate_pass"), "根拠なしの pass を弾く");
  console.log("research/registry: 自己申告 PASS の拒否 OK");
}

function testRejectedRequiresReason() {
  const issues = checkEdgeRegistry(makeState({ edges: [makeEdge({ status: "rejected" })] }));
  assert.ok(codes(issues).includes("missing_rejection"), "棄却理由なしの rejected は不可");
  console.log("research/registry: 棄却理由の必須化 OK");
}

function testIndexIsDeterministic() {
  const state = makeState({
    edges: [makeEdge({ id: "edge-z", hypothesis: "Z の仮説を検証する。十分に長い文章にしておく。" }), makeEdge({ id: "edge-a" })],
  });
  const index = buildEdgeIndex(state);
  assert.deepEqual(
    index.map((entry) => entry.id),
    ["edge-a", "edge-z"],
    "id 昇順で決定論的",
  );
  assert.equal(index[0].gatePassCount, 0);
  console.log("research/registry: 索引の決定論性 OK");
}

testFingerprintIgnoresFormatting();
testDuplicateHypothesisIsError();
testNearDuplicateHypothesis();
testDuplicateAnalog();
testDanglingReferences();
testUnevidencedGatePass();
testRejectedRequiresReason();
testIndexIsDeterministic();

console.log("research/registry: 全テスト成功");
