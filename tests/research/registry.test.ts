import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEdgeIndex,
  checkEdgeRegistry,
  hypothesisFingerprint,
  hypothesisSimilarity,
} from "../../src/research/edge-registry.js";
import { loadEdges, loadSchema, ResearchDataError } from "../../src/research/io.js";
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

function testLinkedEdgeFileIsRejected() {
  const originalCwd = process.cwd();
  const schema = readFileSync(join(originalCwd, "research/schemas/edge.schema.json"), "utf-8");
  const edge = readFileSync(join(originalCwd, "research/edge_registry/edges/known-bad-event-repricing.yml"), "utf-8");
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-edge-"));
  const schemaDir = join(root, "research/schemas");
  const edgeDir = join(root, "research/edge_registry/edges");
  const edgePath = join(edgeDir, "known-bad-event-repricing.yml");
  const target = join(root, "target-edge.yml");

  mkdirSync(schemaDir, { recursive: true });
  mkdirSync(edgeDir, { recursive: true });
  writeFileSync(join(schemaDir, "edge.schema.json"), schema, "utf-8");
  writeFileSync(target, edge, "utf-8");

  try {
    process.chdir(root);

    writeFileSync(edgePath, edge, "utf-8");
    assert.equal(loadEdges().length, 1, "standalone Edge fileは読み込める");

    unlinkSync(edgePath);
    symlinkSync(target, edgePath);
    assert.throws(
      () => loadEdges(),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular YAML file/.test(error.message),
      "symlink Edgeをcanonical Evidenceとして追従しない",
    );

    unlinkSync(edgePath);
    linkSync(target, edgePath);
    assert.throws(
      () => loadEdges(),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular YAML file/.test(error.message),
      "hard-link Edgeをcanonical Evidenceとして追従しない",
    );
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/registry: linked Edge rejection OK");
}

function testLinkedSchemaFilesAreRejected() {
  const originalCwd = process.cwd();
  const backtestSchema = readFileSync(join(originalCwd, "research/schemas/backtest.schema.json"), "utf-8");
  const holdoutManifestSchema = readFileSync(join(originalCwd, "research/schemas/holdout-manifest.schema.json"), "utf-8");
  const holdoutAccessSchema = readFileSync(join(originalCwd, "research/schemas/holdout-access.schema.json"), "utf-8");
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-schema-"));
  const schemaDir = join(root, "research/schemas");
  mkdirSync(schemaDir, { recursive: true });

  const backtestPath = join(schemaDir, "backtest.schema.json");
  const backtestTarget = join(root, "backtest-target.json");
  writeFileSync(backtestTarget, backtestSchema, "utf-8");
  symlinkSync(backtestTarget, backtestPath);

  const manifestPath = join(schemaDir, "holdout-manifest.schema.json");
  const manifestTarget = join(root, "holdout-manifest-target.json");
  writeFileSync(manifestTarget, holdoutManifestSchema, "utf-8");
  linkSync(manifestTarget, manifestPath);

  writeFileSync(join(schemaDir, "holdout-access.schema.json"), holdoutAccessSchema, "utf-8");

  try {
    process.chdir(root);
    assert.throws(
      () => loadSchema("backtest"),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular JSON schema file/.test(error.message),
      "symlink schemaをcanonical validation contractとして追従しない",
    );
    assert.throws(
      () => loadSchema("holdout-manifest"),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular JSON schema file/.test(error.message),
      "hard-link schemaをcanonical validation contractとして追従しない",
    );
    assert.equal(loadSchema("holdout-access").type, "object", "standalone schemaは読み込める");
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/registry: linked schema rejection OK");
}

testFingerprintIgnoresFormatting();
testDuplicateHypothesisIsError();
testNearDuplicateHypothesis();
testDuplicateAnalog();
testDanglingReferences();
testUnevidencedGatePass();
testRejectedRequiresReason();
testIndexIsDeterministic();
testLinkedEdgeFileIsRejected();
testLinkedSchemaFilesAreRejected();

console.log("research/registry: 全テスト成功");