import assert from "node:assert/strict";
import {
  auditResearchAssetProvenanceGitHistory,
  type ResearchAssetProvenanceGitFacts,
} from "../../src/research/research-asset-provenance-git-audit.js";
import type { ResearchAssetProvenanceRecord } from "../../src/research/research-asset-registry.js";

const record: ResearchAssetProvenanceRecord = {
  schemaVersion: 1,
  assetId: "document-fixture",
  firstKnownAt: "2026-08-20T10:00:00+09:00",
  basis: "canonical_git_first_presence",
  sourceCommitSha: "a".repeat(40),
  sourceCommitAt: "2026-08-20T10:00:00+09:00",
  sourcePath: "docs/research/fixture.md",
};

function facts(overrides: Partial<ResearchAssetProvenanceGitFacts> = {}): ResearchAssetProvenanceGitFacts {
  return {
    isCanonicalMainAncestor: () => true,
    commitAt: () => "2026-08-20T10:00:00+09:00",
    pathExistsAtCommit: () => true,
    firstPathAdditionOnCanonicalMain: () => record.sourceCommitSha,
    ...overrides,
  };
}

assert.deepEqual(auditResearchAssetProvenanceGitHistory([record], facts()), []);

assert.ok(
  auditResearchAssetProvenanceGitHistory([record], facts({ isCanonicalMainAncestor: () => false }))
    .some((entry) => entry.code === "research_asset_provenance_source_not_canonical_main"),
);

assert.ok(
  auditResearchAssetProvenanceGitHistory([record], facts({ commitAt: () => null }))
    .some((entry) => entry.code === "research_asset_provenance_source_commit_missing"),
);

assert.ok(
  auditResearchAssetProvenanceGitHistory([record], facts({ commitAt: () => "2026-08-20T10:00:01+09:00" }))
    .some((entry) => entry.code === "research_asset_provenance_source_commit_time_mismatch"),
);

assert.ok(
  auditResearchAssetProvenanceGitHistory([record], facts({ pathExistsAtCommit: () => false }))
    .some((entry) => entry.code === "research_asset_provenance_source_path_missing"),
);

assert.ok(
  auditResearchAssetProvenanceGitHistory([record], facts({ firstPathAdditionOnCanonicalMain: () => null }))
    .some((entry) => entry.code === "research_asset_provenance_canonical_addition_missing"),
);

assert.ok(
  auditResearchAssetProvenanceGitHistory([record], facts({ firstPathAdditionOnCanonicalMain: () => "b".repeat(40) }))
    .some((entry) => entry.code === "research_asset_provenance_not_first_canonical_presence"),
);

console.log("research asset provenance Git audit: all tests passed");
