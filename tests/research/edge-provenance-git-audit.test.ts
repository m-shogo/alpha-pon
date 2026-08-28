import assert from "node:assert/strict";
import {
  auditEdgeProvenanceGitHistory,
  type EdgeProvenanceGitFacts,
} from "../../src/research/edge-provenance-git-audit.js";
import type { EdgeProvenanceRecord } from "../../src/research/edge-provenance.js";

const record: EdgeProvenanceRecord = {
  schemaVersion: 1,
  edgeId: "edge-fixture",
  firstKnownAt: "2026-08-28T01:00:00Z",
  basis: "canonical_git_first_presence",
  sourceCommitSha: "a".repeat(40),
  sourceCommitAt: "2026-08-28T01:00:00Z",
  sourcePath: "research/edge_registry/edges/edge-fixture.yml",
};

function facts(overrides: Partial<EdgeProvenanceGitFacts> = {}): EdgeProvenanceGitFacts {
  return {
    isCanonicalMainAncestor: () => true,
    commitAt: () => "2026-08-28T10:00:00+09:00",
    pathExistsAtCommit: () => true,
    firstPathAdditionOnCanonicalMain: () => "a".repeat(40),
    ...overrides,
  };
}

{
  assert.deepEqual(auditEdgeProvenanceGitHistory([record], facts()), []);
}

{
  const issues = auditEdgeProvenanceGitHistory([record], facts({
    isCanonicalMainAncestor: () => false,
  }));
  assert.deepEqual(
    issues.map((entry) => entry.code),
    ["research_edge_provenance_source_not_canonical_main"],
    "branch-only commit must never establish canonical provenance",
  );
}

{
  const issues = auditEdgeProvenanceGitHistory([record], facts({
    commitAt: () => "2026-08-28T10:00:01+09:00",
  }));
  assert.ok(issues.some((entry) => entry.code === "research_edge_provenance_source_commit_time_mismatch"));
}

{
  const issues = auditEdgeProvenanceGitHistory([record], facts({ commitAt: () => null }));
  assert.ok(issues.some((entry) => entry.code === "research_edge_provenance_source_commit_missing"));
}

{
  const issues = auditEdgeProvenanceGitHistory([record], facts({ pathExistsAtCommit: () => false }));
  assert.ok(issues.some((entry) => entry.code === "research_edge_provenance_source_path_missing"));
}

{
  const issues = auditEdgeProvenanceGitHistory([record], facts({
    firstPathAdditionOnCanonicalMain: () => "b".repeat(40),
  }));
  assert.ok(issues.some((entry) => entry.code === "research_edge_provenance_not_first_canonical_presence"));
}

{
  const issues = auditEdgeProvenanceGitHistory([record], facts({
    firstPathAdditionOnCanonicalMain: () => null,
  }));
  assert.ok(issues.some((entry) => entry.code === "research_edge_provenance_canonical_addition_missing"));
}

console.log("formal edge provenance git audit: all tests passed");
