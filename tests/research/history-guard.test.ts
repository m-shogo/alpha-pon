import assert from "node:assert/strict";
import { load } from "js-yaml";
import {
  changedImmutableFields,
  checkChanges,
  EDGE_IMMUTABLE_FIELDS,
  immutableFieldsForPath,
  isAppendOnly,
  isUnchanged,
  ruleForPath,
  type FileChange,
} from "../../src/research/history-guard.js";

const parseYaml = (content: string) => load(content) as Record<string, unknown>;

function testAppendOnlyAcceptsAppends() {
  assert.equal(isAppendOnly('{"a":1}\n', '{"a":1}\n{"b":2}\n').ok, true);
  assert.equal(isAppendOnly("", '{"a":1}\n').ok, true, "空からの追記は OK");
  console.log("research/history-guard: 追記の許可 OK");
}

function testAppendOnlyRejectsRewrite() {
  const result = isAppendOnly('{"a":1}\n{"b":2}\n', '{"a":999}\n{"b":2}\n');
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /1 行目/, "何行目が書き換えられたかを示す");
  console.log("research/history-guard: 書き換えの拒否 OK");
}

function testAppendOnlyRejectsDeletion() {
  const result = isAppendOnly('{"a":1}\n{"b":2}\n', '{"a":1}\n');
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /削除/);
  console.log("research/history-guard: 削除の拒否 OK");
}

function testRuleMapping() {
  assert.equal(ruleForPath("research/research_log/2026-08.jsonl"), "append_only");
  assert.equal(ruleForPath("research/holdout/access_log.jsonl"), "append_only");
  assert.equal(ruleForPath("research/edge_registry/provenance.jsonl"), "append_only");
  assert.equal(ruleForPath("research/historical/analogs/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/checkpoint/history/x.json"), "immutable_file");
  assert.equal(ruleForPath("research/edge_registry/edges/foo.yml"), "immutable_fields");
  assert.equal(ruleForPath("research/knowledge_catalog/research_items/foo.yml"), "immutable_fields");
  assert.equal(ruleForPath("research/knowledge_catalog/cases/foo.yml"), "immutable_fields");
  assert.equal(ruleForPath("research/knowledge_catalog/observations/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/knowledge_catalog/sample_manifests/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/knowledge_catalog/study_results/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/knowledge_catalog/relations/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/knowledge_catalog/lineages/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/knowledge_catalog/README.md"), "mutable");
  assert.equal(ruleForPath("research/checkpoint/latest.json"), "mutable", "latest.json だけは上書き可");
  assert.equal(ruleForPath("research/dashboard/dashboard.generated.md"), "mutable", "生成物は再生成される");
  console.log("research/history-guard: ルール対応表 OK");
}

function testImmutableEdgeFields() {
  const before = { id: "e1", hypothesis: "元の仮説", createdAt: "2024-01-01", status: "idea" };
  const after = { ...before, status: "research", confidence: 0.5 };
  assert.deepEqual(changedImmutableFields(before, after, EDGE_IMMUTABLE_FIELDS), [], "status 変更は許可");

  const rewritten = { ...before, hypothesis: "こっそり書き換えた仮説" };
  assert.deepEqual(changedImmutableFields(before, rewritten, EDGE_IMMUTABLE_FIELDS), ["hypothesis"]);
  console.log("research/history-guard: Edge の不変フィールド OK");
}

function testAnalogFileIsImmutable() {
  assert.equal(isUnchanged("a: 1\n", "a: 1"), true, "末尾改行の差は無視");
  assert.equal(isUnchanged("a: 1\n", "a: 2\n"), false);

  const violations = checkChanges(
    [{ path: "research/historical/analogs/x.yml", changeType: "modified", oldContent: "a: 1\n", newContent: "a: 2\n" }],
    parseYaml,
  );
  assert.equal(violations[0].code, "immutable_file_modified");
  console.log("research/history-guard: Analog の完全不変 OK");
}

function testDeletionIsAlwaysViolation() {
  const changes: FileChange[] = [
    { path: "research/research_log/2026-08.jsonl", changeType: "deleted", oldContent: "{}\n", newContent: null },
  ];
  assert.equal(checkChanges(changes, parseYaml)[0].code, "record_removed");
  console.log("research/history-guard: 記録削除の拒否 OK");
}

function testEdgeStatusChangeIsAllowed() {
  const before = 'id: "e1"\nhypothesis: "元の仮説"\ncreatedAt: "2024-01-01"\nstatus: "idea"\n';
  const after = 'id: "e1"\nhypothesis: "元の仮説"\ncreatedAt: "2024-01-01"\nstatus: "research"\n';
  const violations = checkChanges(
    [{ path: "research/edge_registry/edges/e1.yml", changeType: "modified", oldContent: before, newContent: after }],
    parseYaml,
  );
  assert.deepEqual(violations, [], "研究が進んで status が変わるのは正常");
  console.log("research/history-guard: Edge の更新許可 OK");
}

function testEdgeProvenanceRewriteIsRejected() {
  const before = '{"edgeId":"edge-a","firstKnownAt":"2026-08-01T00:00:00Z"}\n';
  const rewritten = '{"edgeId":"edge-a","firstKnownAt":"2026-08-02T00:00:00Z"}\n';
  const violations = checkChanges(
    [{
      path: "research/edge_registry/provenance.jsonl",
      changeType: "modified",
      oldContent: before,
      newContent: rewritten,
    }],
    parseYaml,
  );
  assert.equal(violations[0]?.code, "not_append_only", "first-known provenance must never be rewritten in place");

  const appended = `${before}{"edgeId":"edge-b","firstKnownAt":"2026-08-03T00:00:00Z"}\n`;
  assert.deepEqual(checkChanges(
    [{
      path: "research/edge_registry/provenance.jsonl",
      changeType: "modified",
      oldContent: before,
      newContent: appended,
    }],
    parseYaml,
  ), [], "new provenance facts may only be appended");
  console.log("research/history-guard: Edge provenance append-only OK");
}

function testCatalogMutableIdentityFields() {
  const path = "research/knowledge_catalog/research_items/catalog-item.yml";
  assert.deepEqual(
    immutableFieldsForPath(path),
    ["schemaVersion", "ontologyVersion", "id", "createdAt", "origin"],
  );
  const before = [
    "schemaVersion: 1",
    "ontologyVersion: research-knowledge-v1",
    "id: catalog-item",
    "title: Original title",
    "status: captured",
    "createdAt: 2026-08-28T10:00:00+09:00",
    "origin: user",
    "summary: Original summary",
    "",
  ].join("\n");
  const progressed = before
    .replace("status: captured", "status: investigating")
    .replace("Original summary", "Updated summary after research");
  assert.deepEqual(checkChanges([
    { path, changeType: "modified", oldContent: before, newContent: progressed },
  ], parseYaml), [], "status/summary may evolve without rewriting identity");

  const changedOrigin = before.replace("origin: user", "origin: agent_discovery");
  const violations = checkChanges([
    { path, changeType: "modified", oldContent: before, newContent: changedOrigin },
  ], parseYaml);
  assert.equal(violations[0]?.code, "immutable_field_changed");
  assert.match(violations[0]?.message ?? "", /origin/);
  console.log("research/history-guard: Catalog mutable identity fields OK");
}

function testCatalogComponentKindIsIdentityBearing() {
  const path = "research/knowledge_catalog/research_components/component-a.yml";
  const before = [
    "schemaVersion: 1",
    "ontologyVersion: research-knowledge-v1",
    "id: component-a",
    "title: Component A",
    "kind: filter",
    "status: active",
    "createdAt: 2026-08-28T10:00:00+09:00",
    "description: Filter description",
    "",
  ].join("\n");
  const rewritten = before.replace("kind: filter", "kind: phase");
  const violations = checkChanges([
    { path, changeType: "modified", oldContent: before, newContent: rewritten },
  ], parseYaml);
  assert.equal(violations[0]?.code, "immutable_field_changed");
  assert.match(violations[0]?.message ?? "", /kind/);
  console.log("research/history-guard: Component kind immutable OK");
}

function testCatalogHistoricalFactsAreImmutable() {
  const paths = [
    "research/knowledge_catalog/observations/observation-a.yml",
    "research/knowledge_catalog/sample_manifests/manifest-a.yml",
    "research/knowledge_catalog/study_results/result-a.yml",
    "research/knowledge_catalog/relations/relation-a.yml",
    "research/knowledge_catalog/lineages/lineage-a.yml",
  ];
  for (const path of paths) {
    const violations = checkChanges([
      { path, changeType: "modified", oldContent: "id: old\n", newContent: "id: changed\n" },
    ], parseYaml);
    assert.equal(violations[0]?.code, "immutable_file_modified", `${path} must be immutable`);
  }
  console.log("research/history-guard: Catalog historical fact immutability OK");
}

function testCatalogRecordDeletionIsRejected() {
  const path = "research/knowledge_catalog/cases/case-a.yml";
  const violations = checkChanges([
    { path, changeType: "deleted", oldContent: "id: case-a\n", newContent: null },
  ], parseYaml);
  assert.equal(violations[0]?.code, "record_removed");
  console.log("research/history-guard: Catalog record deletion rejection OK");
}

testAppendOnlyAcceptsAppends();
testAppendOnlyRejectsRewrite();
testAppendOnlyRejectsDeletion();
testRuleMapping();
testImmutableEdgeFields();
testAnalogFileIsImmutable();
testDeletionIsAlwaysViolation();
testEdgeStatusChangeIsAllowed();
testEdgeProvenanceRewriteIsRejected();
testCatalogMutableIdentityFields();
testCatalogComponentKindIsIdentityBearing();
testCatalogHistoricalFactsAreImmutable();
testCatalogRecordDeletionIsRejected();

console.log("research/history-guard: 全テスト成功");
