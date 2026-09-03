import "./research-orphan-discovery.test.js";
import "./research-orphan-global-cap.test.js";
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
import { readReadOnlyJsonArrayFile, readReadOnlyJsonObjectFile } from "../../src/read-only-json-file.js";
import { buildDashboard } from "../../src/research/dashboard.js";
import { loadCheckpoint, readJsonl, ResearchDataError } from "../../src/research/io.js";
import { buildQueue } from "../../src/research/queue.js";
import { GATE_KEYS, type Edge } from "../../src/research/types.js";
import { makeEdge, makeState } from "./helpers.js";

const AS_OF = "2024-02-01";
const GENERATED_AT = "2024-02-01T00:00:00.000Z";

function render(edges: Edge[]): string {
  const state = makeState({ edges });
  return buildDashboard({
    state,
    queue: buildQueue(state, AS_OF),
    accessLog: [],
    issues: [],
    asOf: AS_OF,
    generatedAt: GENERATED_AT,
  });
}

function testSchemaAndTypesStayInSync() {
  const schema = JSON.parse(readFileSync("research/schemas/edge.schema.json", "utf-8"));
  const required: string[] = schema.properties.promotionGate.required;
  assert.deepEqual([...GATE_KEYS].sort(), [...required].sort(), "GATE_KEYS と edge.schema.json がずれている");
  assert.equal(GATE_KEYS.length, 11, "Production Gate は 11 項目");
  console.log("research/dashboard: スキーマと型の同期 OK");
}

function testRequiredSectionsRendered() {
  const markdown = render([makeEdge()]);
  for (const heading of [
    "## ステータス別",
    "## 次に研究するもの（VOI 上位）",
    "## Promotion Ready",
    "## Holdout Ready",
    "## Edge 一覧",
    "## Edge Decay",
    "## 整合性チェック",
    "## Checkpoint（次回はここから）",
  ]) {
    assert.ok(markdown.includes(heading), `見出しが無い: ${heading}`);
  }
  assert.ok(markdown.includes("生成物です"), "生成物であることを明示する");
  console.log("research/dashboard: 必須セクション OK");
}

function testDeterministicOutput() {
  const edges = [
    makeEdge({ id: "edge-a" }),
    makeEdge({ id: "edge-b", hypothesis: "別の仮説。イベント B の後、対象銘柄は超過収益を生む。" }),
  ];
  assert.equal(render(edges), render(edges), "同じ入力なら同じ Markdown");
  console.log("research/dashboard: 決定論性 OK");
}

function testEmptyRegistryDoesNotCrash() {
  const markdown = render([]);
  assert.ok(markdown.includes("_該当なし_"), "空でも壊れずに描画する");
  assert.ok(markdown.includes("Checkpoint がまだありません"));
  console.log("research/dashboard: 空レジストリ OK");
}

function testLinkedCheckpointIsRejected() {
  const originalCwd = process.cwd();
  const schema = readFileSync(join(originalCwd, "research/schemas/checkpoint.schema.json"), "utf-8");
  const checkpoint = readFileSync(join(originalCwd, "research/checkpoint/latest.json"), "utf-8");
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-checkpoint-"));
  const schemaDir = join(root, "research/schemas");
  const checkpointDir = join(root, "research/checkpoint");
  const latest = join(checkpointDir, "latest.json");
  const target = join(checkpointDir, "target.json");

  mkdirSync(schemaDir, { recursive: true });
  mkdirSync(checkpointDir, { recursive: true });
  writeFileSync(join(schemaDir, "checkpoint.schema.json"), schema, "utf-8");
  writeFileSync(target, checkpoint, "utf-8");

  try {
    process.chdir(root);

    writeFileSync(latest, checkpoint, "utf-8");
    assert.equal(loadCheckpoint()?.schemaVersion, 1, "standalone checkpointは読み込める");

    unlinkSync(latest);
    symlinkSync(target, latest);
    assert.throws(
      () => loadCheckpoint(),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular JSON file/.test(error.message),
      "symlink checkpointをcanonical Evidenceとして追従しない",
    );

    unlinkSync(latest);
    linkSync(target, latest);
    assert.throws(
      () => loadCheckpoint(),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular JSON file/.test(error.message),
      "hard-link checkpointをcanonical Evidenceとして追従しない",
    );
  } finally {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/dashboard: linked checkpoint rejection OK");
}

function testLinkedJsonlIsRejected() {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-jsonl-"));
  const input = join(root, "counterfactuals.jsonl");
  const target = join(root, "target.jsonl");
  writeFileSync(target, `${JSON.stringify({ id: "synthetic" })}\n`, "utf-8");

  try {
    writeFileSync(input, `${JSON.stringify({ id: "standalone" })}\n`, "utf-8");
    assert.deepEqual(readJsonl(input), [{ id: "standalone" }], "standalone JSONLは読み込める");

    unlinkSync(input);
    symlinkSync(target, input);
    assert.throws(
      () => readJsonl(input),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular JSONL file/.test(error.message),
      "symlink JSONLをResearch OS stateとして追従しない",
    );

    unlinkSync(input);
    linkSync(target, input);
    assert.throws(
      () => readJsonl(input),
      (error: unknown) => error instanceof ResearchDataError && /standalone regular JSONL file/.test(error.message),
      "hard-link JSONLをResearch OS stateとして追従しない",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/dashboard: linked JSONL rejection OK");
}

function testLinkedGeneratedEdgeIndexIsRejected() {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-index-"));
  const input = join(root, "index.generated.json");
  const target = join(root, "target.json");
  const payload = [{ id: "synthetic-edge" }];
  writeFileSync(target, JSON.stringify(payload), "utf-8");

  try {
    writeFileSync(input, JSON.stringify(payload), "utf-8");
    assert.deepEqual(readReadOnlyJsonArrayFile(input).rows, payload, "standalone generated indexは読み込める");

    unlinkSync(input);
    symlinkSync(target, input);
    assert.equal(readReadOnlyJsonArrayFile(input).parseError, true, "symlink generated indexをcheck証拠として追従しない");

    unlinkSync(input);
    linkSync(target, input);
    assert.equal(readReadOnlyJsonArrayFile(input).parseError, true, "hard-link generated indexをcheck証拠として追従しない");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/dashboard: linked generated edge index rejection OK");
}

function testLinkedGeneratedQueueIsRejected() {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-queue-"));
  const input = join(root, "queue.generated.json");
  const target = join(root, "target.json");
  const payload = { asOf: "2024-02-01", entries: [] };
  writeFileSync(target, JSON.stringify(payload), "utf-8");

  try {
    writeFileSync(input, JSON.stringify(payload), "utf-8");
    assert.deepEqual(readReadOnlyJsonObjectFile(input).object, payload, "standalone generated queueは読み込める");

    unlinkSync(input);
    symlinkSync(target, input);
    assert.equal(readReadOnlyJsonObjectFile(input).parseError, true, "symlink generated queueをcheck証拠として追従しない");

    unlinkSync(input);
    linkSync(target, input);
    assert.equal(readReadOnlyJsonObjectFile(input).parseError, true, "hard-link generated queueをcheck証拠として追従しない");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("research/dashboard: linked generated queue rejection OK");
}

testSchemaAndTypesStayInSync();
testRequiredSectionsRendered();
testDeterministicOutput();
testEmptyRegistryDoesNotCrash();
testLinkedCheckpointIsRejected();
testLinkedJsonlIsRejected();
testLinkedGeneratedEdgeIndexIsRejected();
testLinkedGeneratedQueueIsRejected();

console.log("research/dashboard: 全テスト成功");