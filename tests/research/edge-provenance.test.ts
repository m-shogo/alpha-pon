import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EDGE_PROVENANCE_SCHEMA_PATH,
  readEdgeProvenanceRepository,
  validateEdgeProvenanceRecords,
  type EdgeProvenanceRecord,
} from "../../src/research/edge-provenance.js";
import type { JsonSchema } from "../../src/research/schema.js";

const edgeIds = [
  "ex-rights-overreaction-recovery",
  "known-bad-event-repricing",
  "misconduct-overreaction-recovery",
];
const schema = JSON.parse(readFileSync(EDGE_PROVENANCE_SCHEMA_PATH, "utf-8")) as JsonSchema;

{
  const result = readEdgeProvenanceRepository(edgeIds);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.missingEdgeIds, []);
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.firstKnownAtByEdge, {
    "ex-rights-overreaction-recovery": "2026-08-27T08:13:19Z",
    "known-bad-event-repricing": "2026-08-05T03:32:19Z",
    "misconduct-overreaction-recovery": "2026-08-27T08:59:28Z",
  });
  assert.deepEqual(
    result.records.map((entry) => entry.edgeId),
    [
      "known-bad-event-repricing",
      "ex-rights-overreaction-recovery",
      "misconduct-overreaction-recovery",
    ],
    "records are ordered by actual first-known instant, not lexical timestamp text",
  );
}

function record(overrides: Partial<EdgeProvenanceRecord> = {}): EdgeProvenanceRecord {
  return {
    schemaVersion: 1,
    edgeId: "edge-fixture",
    firstKnownAt: "2026-08-28T10:00:00Z",
    basis: "canonical_git_first_presence",
    sourceCommitSha: "a".repeat(40),
    sourceCommitAt: "2026-08-28T10:00:00Z",
    sourcePath: "research/edge_registry/edges/edge-fixture.yml",
    ...overrides,
  };
}

function result(records: readonly unknown[], ids: readonly string[]) {
  return validateEdgeProvenanceRecords(records, ids, schema);
}

function codes(records: readonly unknown[], ids: readonly string[]): Set<string> {
  return new Set(result(records, ids).issues.map((entry) => entry.code));
}

{
  const valid = result([record()], ["edge-fixture"]);
  assert.deepEqual(valid.issues, []);
  assert.deepEqual(valid.missingEdgeIds, []);
}

{
  const duplicate = result([record(), record({ sourceCommitSha: "b".repeat(40) })], ["edge-fixture"]);
  assert.ok(new Set(duplicate.issues.map((entry) => entry.code)).has("research_edge_provenance_duplicate_edge"));
  assert.deepEqual(duplicate.missingEdgeIds, ["edge-fixture"], "duplicate provenance must not create availability");
  assert.deepEqual(duplicate.firstKnownAtByEdge, {});
}

{
  const unknown = result(
    [record({ edgeId: "edge-other", sourcePath: "research/edge_registry/edges/edge-other.yml" })],
    ["edge-fixture"],
  );
  assert.ok(new Set(unknown.issues.map((entry) => entry.code)).has("research_edge_provenance_unknown_edge"));
  assert.deepEqual(unknown.missingEdgeIds, ["edge-fixture"]);
}

{
  const invalidPath = result([record({ sourcePath: "research/edge_registry/edges/wrong.yml" })], ["edge-fixture"]);
  assert.ok(new Set(invalidPath.issues.map((entry) => entry.code)).has("research_edge_provenance_path_mismatch"));
  assert.deepEqual(invalidPath.missingEdgeIds, ["edge-fixture"]);
}

{
  const invalidTime = result([record({ sourceCommitAt: "2026-08-28T10:00:01Z" })], ["edge-fixture"]);
  assert.ok(new Set(invalidTime.issues.map((entry) => entry.code)).has("research_edge_provenance_time_mismatch"));
  assert.deepEqual(invalidTime.missingEdgeIds, ["edge-fixture"]);
}

{
  const found = codes([{ ...record(), firstKnownAt: "2026-08-28" }], ["edge-fixture"]);
  assert.ok(found.has("research_edge_provenance_schema_invalid"));
}

{
  const pending = result([], ["edge-fixture"]);
  assert.deepEqual(pending.issues, [], "a newly merged Edge may temporarily await canonical-main provenance");
  assert.deepEqual(pending.missingEdgeIds, ["edge-fixture"]);
  assert.deepEqual(pending.firstKnownAtByEdge, {});
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-edge-provenance-missing-"));
  try {
    const path = join(root, "missing-provenance.jsonl");
    const pending = readEdgeProvenanceRepository(["edge-fixture"], { path });
    assert.deepEqual(pending.issues, []);
    assert.deepEqual(pending.missingEdgeIds, ["edge-fixture"]);
    assert.deepEqual(pending.firstKnownAtByEdge, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-edge-provenance-partial-"));
  try {
    const path = join(root, "provenance.jsonl");
    writeFileSync(path, JSON.stringify(record()), "utf-8");
    const partial = readEdgeProvenanceRepository(["edge-fixture"], { path });
    assert.ok(partial.issues.some((entry) => entry.code === "research_edge_provenance_partial_tail"));
    assert.deepEqual(partial.missingEdgeIds, ["edge-fixture"]);
    assert.deepEqual(partial.firstKnownAtByEdge, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("formal edge provenance: all tests passed");
