import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverResearchOrphans,
  type ResearchOrphanCandidate,
} from "../../src/research/research-orphan-discovery.js";
import type { ResearchAssetRegistryResult } from "../../src/research/research-asset-registry.js";
import type { ResearchKnowledgeCatalogRepositoryResult } from "../../src/research/research-knowledge-catalog-repository.js";
import { emptyResearchKnowledgeOwnedSnapshot } from "../../src/research/research-knowledge-snapshot-loader.js";

function emptyAssetRegistry(): ResearchAssetRegistryResult {
  return {
    records: [],
    provenanceRecords: [],
    firstKnownAtById: {},
    missingProvenanceIds: [],
    issues: [],
  };
}

function emptyCatalog(): ResearchKnowledgeCatalogRepositoryResult {
  return {
    snapshot: emptyResearchKnowledgeOwnedSnapshot(),
    issues: [],
    counts: {} as ResearchKnowledgeCatalogRepositoryResult["counts"],
    totalCount: 0,
  };
}

function candidateAt(result: ReturnType<typeof discoverResearchOrphans>, index = 0): ResearchOrphanCandidate {
  const candidate = result.candidates[index];
  assert.ok(candidate, `candidate ${index} must exist`);
  return candidate;
}

function withTempRepository(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-fingerprint-"));
  try {
    mkdirSync(join(root, "docs", "research"), { recursive: true });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

withTempRepository((root) => {
  const path = join(root, "docs", "research", "alpha.md");
  writeFileSync(path, "# Alpha\nfirst version\n", "utf-8");
  const options = {
    repositoryRootPath: root,
    assetRegistry: emptyAssetRegistry(),
    catalogRepository: emptyCatalog(),
  };
  const first = discoverResearchOrphans(options);
  const repeated = discoverResearchOrphans(options);
  assert.equal(first.issues.length, 0);
  assert.match(candidateAt(first).fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(candidateAt(first).fingerprint, candidateAt(repeated).fingerprint, "unchanged content must fingerprint deterministically");

  const key = candidateAt(first).key;
  writeFileSync(path, "# Alpha\nsecond version\n", "utf-8");
  const changed = discoverResearchOrphans(options);
  assert.equal(candidateAt(changed).key, key, "physical research identity stays on the same candidate key");
  assert.notEqual(candidateAt(changed).fingerprint, candidateAt(first).fingerprint, "content change must stale prior triage memory");
});

withTempRepository((root) => {
  const firstPath = join(root, "docs", "research", "alpha.md");
  const secondPath = join(root, "docs", "research", "beta.md");
  writeFileSync(firstPath, "# same inode\n", "utf-8");
  linkSync(firstPath, secondPath);
  const result = discoverResearchOrphans({
    repositoryRootPath: root,
    assetRegistry: emptyAssetRegistry(),
    catalogRepository: emptyCatalog(),
  });
  assert.equal(result.candidates.length, 0, "hard-linked research files must fail closed before triage");
  assert.ok(result.issues.some((entry) => entry.code === "research_orphan_scan_hard_link_rejected"));
});

withTempRepository((root) => {
  const baseRegistry: ResearchAssetRegistryResult = {
    records: [{
      schemaVersion: 1,
      id: "document-alpha",
      assetType: "document",
      path: "docs/research/registered.md",
      status: "active",
      description: "first description",
    }],
    provenanceRecords: [],
    firstKnownAtById: { "document-alpha": "2026-08-28T07:00:00Z" },
    missingProvenanceIds: [],
    issues: [],
  };
  const first = discoverResearchOrphans({
    repositoryRootPath: root,
    assetRegistry: baseRegistry,
    catalogRepository: emptyCatalog(),
  });
  const changed = discoverResearchOrphans({
    repositoryRootPath: root,
    assetRegistry: {
      ...baseRegistry,
      records: [{ ...baseRegistry.records[0]!, description: "materially changed description" }],
    },
    catalogRepository: emptyCatalog(),
  });
  assert.equal(candidateAt(first).key, candidateAt(changed).key);
  assert.notEqual(candidateAt(first).fingerprint, candidateAt(changed).fingerprint, "relevant registered-asset context must stale triage memory");
});

console.log("research/orphan-fingerprint: deterministic stale-detection boundaries OK");
