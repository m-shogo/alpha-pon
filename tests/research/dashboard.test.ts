import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDashboard } from "../../src/research/dashboard.js";
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
  const edges = [makeEdge({ id: "edge-a" }), makeEdge({ id: "edge-b", hypothesis: "別の仮説。イベント B の後、対象銘柄は超過収益を生む。" })];
  assert.equal(render(edges), render(edges), "同じ入力なら同じ Markdown");
  console.log("research/dashboard: 決定論性 OK");
}

function testEmptyRegistryDoesNotCrash() {
  const markdown = render([]);
  assert.ok(markdown.includes("_該当なし_"), "空でも壊れずに描画する");
  assert.ok(markdown.includes("Checkpoint がまだありません"));
  console.log("research/dashboard: 空レジストリ OK");
}

testSchemaAndTypesStayInSync();
testRequiredSectionsRendered();
testDeterministicOutput();
testEmptyRegistryDoesNotCrash();

console.log("research/dashboard: 全テスト成功");
