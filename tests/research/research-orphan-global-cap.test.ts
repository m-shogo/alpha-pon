import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverResearchOrphans } from "../../src/research/research-orphan-discovery.js";
import type { ResearchAssetRegistryResult } from "../../src/research/research-asset-registry.js";
import type { ResearchKnowledgeCatalogRepositoryResult } from "../../src/research/research-knowledge-catalog-repository.js";
import { emptyResearchKnowledgeOwnedSnapshot } from "../../src/research/research-knowledge-snapshot-loader.js";

const emptyRegistry: ResearchAssetRegistryResult = {
  records: [],
  provenanceRecords: [],
  firstKnownAtById: {},
  missingProvenanceIds: [],
  issues: [],
};

const emptyCatalog: ResearchKnowledgeCatalogRepositoryResult = {
  snapshot: emptyResearchKnowledgeOwnedSnapshot(),
  issues: [],
  counts: {
    researchItems: 0,
    researchQuestions: 0,
    observations: 0,
    mechanisms: 0,
    researchFamilies: 0,
    researchComponents: 0,
    cases: 0,
    studies: 0,
    sampleManifests: 0,
    studyResults: 0,
    opportunities: 0,
    relations: 0,
    lineages: 0,
  },
  totalCount: 0,
};

const root = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-cap-"));
try {
  mkdirSync(join(root, "docs/research"), { recursive: true });
  mkdirSync(join(root, "docs/research-extra"), { recursive: true });
  writeFileSync(join(root, "docs/research/a.md"), "# A\n", "utf-8");
  writeFileSync(join(root, "docs/research/b.md"), "# B\n", "utf-8");
  writeFileSync(join(root, "docs/research-extra/c.md"), "# C\n", "utf-8");

  const result = discoverResearchOrphans({
    repositoryRootPath: root,
    documentRoots: ["docs/research", "docs/research-extra"],
    maxScannedFiles: 1,
    assetRegistry: emptyRegistry,
    catalogRepository: emptyCatalog,
  });

  const limitIssues = result.issues.filter(
    (entry) => entry.code === "research_orphan_scan_file_limit_exceeded",
  );
  assert.equal(
    limitIssues.length,
    1,
    "maxScannedFiles must be a single global stop condition across roots, not a per-directory soft limit",
  );
  assert.deepEqual(result.candidates, [], "incomplete scans must remain fail-closed");
  assert.deepEqual(result.scannedDocumentPaths, [], "partial scan paths must not escape fail-closed mode");
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("research orphan discovery: global scan cap regression passed");
