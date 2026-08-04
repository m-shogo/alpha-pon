import assert from "node:assert/strict";
import { load } from "js-yaml";
import {
  changedImmutableFields,
  checkChanges,
  EDGE_IMMUTABLE_FIELDS,
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
  assert.equal(ruleForPath("research/historical/analogs/foo.yml"), "immutable_file");
  assert.equal(ruleForPath("research/checkpoint/history/x.json"), "immutable_file");
  assert.equal(ruleForPath("research/edge_registry/edges/foo.yml"), "immutable_fields");
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

testAppendOnlyAcceptsAppends();
testAppendOnlyRejectsRewrite();
testAppendOnlyRejectsDeletion();
testRuleMapping();
testImmutableEdgeFields();
testAnalogFileIsImmutable();
testDeletionIsAlwaysViolation();
testEdgeStatusChangeIsAllowed();

console.log("research/history-guard: 全テスト成功");
