import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditResearchAssetProvenanceGitHistory,
  type ResearchAssetProvenanceGitFacts,
} from "../../src/research/research-asset-provenance-git-audit.js";
import type { ResearchAssetProvenanceRecord } from "../../src/research/research-asset-registry.js";
import { readResearchKnowledgeAuthorityViews } from "../../src/research/research-knowledge-authority-repository.js";

const record: ResearchAssetProvenanceRecord = {
  schemaVersion: 1,
  assetId: "document-fixture",
  firstKnownAt: "2026-08-20T10:00:00+09:00",
  basis: "canonical_git_first_presence",
  sourceCommitSha: "a".repeat(40),
  sourceCommitAt: "2026-08-20T10:00:00+09:00",
  sourcePath: "research/asset_registry/assets/document-fixture.yml",
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
  auditResearchAssetProvenanceGitHistory(
    [{ ...record, sourcePath: "docs/research/fixture.md" }],
    facts(),
  ).some((entry) => entry.code === "research_asset_provenance_source_path_mismatch"),
  "target document history must not backdate the stable Research Asset identity",
);

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

const authorityRoot = mkdtempSync(join(tmpdir(), "alpha-pon-asset-provenance-authority-"));
try {
  const repositoryRoot = join(authorityRoot, "repo");
  const registryRoot = join(authorityRoot, "asset-registry");
  mkdirSync(join(repositoryRoot, "docs"), { recursive: true });
  mkdirSync(join(registryRoot, "assets"), { recursive: true });
  writeFileSync(join(repositoryRoot, "docs", "watch.md"), "fixture\n", "utf-8");
  writeFileSync(
    join(registryRoot, "assets", "watch-provenance-fixture.yml"),
    [
      "schemaVersion: 1",
      "id: watch-provenance-fixture",
      "assetType: watch",
      "path: docs/watch.md",
      "status: active",
      "description: Provenance source path fixture",
      "",
    ].join("\n"),
    "utf-8",
  );
  const provenancePath = join(authorityRoot, "provenance.jsonl");
  writeFileSync(
    provenancePath,
    `${JSON.stringify({
      schemaVersion: 1,
      assetId: "watch-provenance-fixture",
      firstKnownAt: "2026-08-20T10:00:00+09:00",
      basis: "canonical_git_first_presence",
      sourceCommitSha: "a".repeat(40),
      sourceCommitAt: "2026-08-20T10:00:00+09:00",
      sourcePath: "docs/unrelated.md",
    })}\n`,
    "utf-8",
  );

  const authorityViews = readResearchKnowledgeAuthorityViews({
    marketEventDatabasePath: join(authorityRoot, "missing-market.db"),
    securityMasterEntitiesPath: join(authorityRoot, "missing-entities.jsonl"),
    assetRegistryRootPath: registryRoot,
    assetRegistryRepositoryRootPath: repositoryRoot,
    assetProvenancePath: provenancePath,
  });
  for (const view of [authorityViews.document, authorityViews.watch, authorityViews.implementation]) {
    assert.ok(
      view.issues.some((entry) => entry.code === "research_asset_provenance_source_path_mismatch"),
      `${view.nodeType} authority must fail closed when provenance points at a non-Asset sourcePath`,
    );
  }
} finally {
  rmSync(authorityRoot, { recursive: true, force: true });
}

console.log("research asset provenance Git audit: all tests passed");
