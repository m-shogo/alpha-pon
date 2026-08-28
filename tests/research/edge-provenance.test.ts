import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EDGE_PROVENANCE_SCHEMA_PATH,
  readEdgeProvenanceRepository,
  validateEdgeProvenanceRecords,
  type EdgeProvenanceRecord,
} from "../../src/research/edge-provenance.js";
import type { JsonSchema } from "../../src/research/schema.js";
import { readFileSync } from "node:fs";

const edgeIds = [
  "ex-rights-overreaction-recovery",
  "known-bad-event-repricing",
  "misconduct-overreaction-recovery",
];
const schema = JSON.parse(readFileSync(EDGE_PROVENANCE_SCHEMA_PATH, "utf-8")) as JsonSchema;

{
  const result = readEdgeProvenanceRepository(edgeIds);
  assert.deepEqual(result.issues, []);
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.firstKnownAtByEdge, {
    "ex-rights-overreaction-recovery": "2026-08-27T08:13:19Z",
    "known-bad-event-repricing": "2026-08-05T03:32:19Z",
    "misconduct-overreaction-recovery": "2026-08-27T08:59:28Z",
  });
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

function codes(records: readonly unknown[], ids: readonly string[]): Set<string> {
  return new Set(validateEdgeProvenanceRecords(records, ids, schema).issues.map((entry) => entry.code));
}

{
  assert.deepEqual(validateEdgeProvenanceRecords([record()], ["edge-fixture"], schema).issues, []);
}

{
  const found = codes([record(), record({ sourceCommitSha: "b".repeat(40) })], ["edge-fixture"]);
  assert.ok(found.has("research_edge_provenance_duplicate_edge"));
}

{
  const found = codes([record({ edgeId: "edge-other", sourcePath: "research/edge_registry/edges/edge-other.yml" })], ["edge-fixture"]);
  assert.ok(found.has("research_edge_provenance_unknown_edge"));
  assert.ok(found.has("research_edge_provenance_missing_edge"));
}

{
  const found = codes([record({ sourcePath: "research/edge_registry/edges/wrong.yml" })], ["edge-fixture"]);
  assert.ok(found.has("research_edge_provenance_path_mismatch"));
}

{
  const found = codes([record({ sourceCommitAt: "2026-08-28T10:00:01Z" })], ["edge-fixture"]);
  assert.ok(found.has("research_edge_provenance_time_mismatch"));
}

{
  const found = codes([{ ...record(), firstKnownAt: "2026-08-28" }], ["edge-fixture"]);
  assert.ok(found.has("research_edge_provenance_schema_invalid"));
}

{
  const result = validateEdgeProvenanceRecords([], ["edge-fixture"], schema);
  assert.ok(result.issues.some((entry) => entry.code === "research_edge_provenance_missing_edge"));
  assert.deepEqual(result.firstKnownAtByEdge, {});
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-edge-provenance-"));
  try {
    const path = join(root, "provenance.jsonl");
    writeFileSync(path, JSON.stringify(record()), "utf-8");
    const result = readEdgeProvenanceRepository(["edge-fixture"], { path });
    assert.ok(result.issues.some((entry) => entry.code === "research_edge_provenance_partial_tail"));
    assert.deepEqual(result.firstKnownAtByEdge, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("formal edge provenance: all tests passed");
