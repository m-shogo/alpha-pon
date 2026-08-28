import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverResearchOrphans,
  type ResearchOrphanDiscoveryResult,
} from "../../src/research/research-orphan-discovery.js";
import type {
  ResearchAssetRecord,
  ResearchAssetRegistryResult,
} from "../../src/research/research-asset-registry.js";
import type { ResearchKnowledgeCatalogRepositoryResult } from "../../src/research/research-knowledge-catalog-repository.js";
import { emptyResearchKnowledgeOwnedSnapshot } from "../../src/research/research-knowledge-snapshot-loader.js";
import type { ResearchRelationRecord } from "../../src/research/research-knowledge-types.js";

function emptyCounts(): ResearchKnowledgeCatalogRepositoryResult["counts"] {
  return {
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
  };
}

function registry(
  records: readonly ResearchAssetRecord[] = [],
  firstKnownAtById: Readonly<Record<string, string>> = {},
  issues: ResearchAssetRegistryResult["issues"] = [],
): ResearchAssetRegistryResult {
  const proven = new Set(Object.keys(firstKnownAtById));
  return {
    records: [...records],
    provenanceRecords: [],
    firstKnownAtById,
    missingProvenanceIds: records.map((record) => record.id).filter((id) => !proven.has(id)).sort(),
    issues,
  };
}

function catalog(
  relations: readonly ResearchRelationRecord[] = [],
  issues: ResearchKnowledgeCatalogRepositoryResult["issues"] = [],
): ResearchKnowledgeCatalogRepositoryResult {
  const snapshot = emptyResearchKnowledgeOwnedSnapshot();
  const counts = { ...emptyCounts(), relations: relations.length };
  return {
    snapshot: { ...snapshot, relations: [...relations] },
    issues,
    counts,
    totalCount: relations.length,
  };
}

function withRepo(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-orphan-"));
  try {
    mkdirSync(join(root, "docs/research/generated"), { recursive: true });
    mkdirSync(join(root, "docs/research/nested"), { recursive: true });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function candidateKeys(result: ResearchOrphanDiscoveryResult): string[] {
  return result.candidates.map((candidate) => candidate.key);
}

function testStructuredDocumentScanIsDeterministicAndExcludesGenerated(): void {
  withRepo((root) => {
    writeFileSync(join(root, "docs/research/a.md"), "# A\n");
    writeFileSync(join(root, "docs/research/nested/b.md"), "# B\n");
    writeFileSync(join(root, "docs/research/generated/ignored.md"), "# generated\n");
    writeFileSync(join(root, "docs/research/report.generated.md"), "# generated\n");
    writeFileSync(join(root, "docs/research/not-research.txt"), "ignored\n");

    const options = {
      repositoryRootPath: root,
      assetRegistry: registry(),
      catalogRepository: catalog(),
    } as const;
    const first = discoverResearchOrphans(options);
    const second = discoverResearchOrphans(options);

    assert.deepEqual(first, second, "same repository state must produce deterministic orphan candidates");
    assert.deepEqual(first.scannedDocumentPaths, [
      "docs/research/a.md",
      "docs/research/nested/b.md",
    ]);
    assert.deepEqual(candidateKeys(first), [
      "unregistered_asset:document:docs/research/a.md",
      "unregistered_asset:document:docs/research/nested/b.md",
    ]);
    assert.ok(first.candidates.every((candidate) => candidate.classification === "unclassified"));
    assert.equal(first.stats.unregisteredDocumentCount, 2);
    assert.equal(first.stats.totalCandidates, 2);
  });
  console.log("research orphan discovery: deterministic document scan/generated exclusion OK");
}

function testRegisteredAndRelatedAssetIsNotOrphaned(): void {
  withRepo((root) => {
    writeFileSync(join(root, "docs/research/a.md"), "# A\n");
    const record: ResearchAssetRecord = {
      schemaVersion: 1,
      id: "doc-a",
      assetType: "document",
      path: "docs/research/a.md",
      status: "active",
      description: "A",
    };
    const relation = {
      schemaVersion: 1,
      ontologyVersion: "research-knowledge-v1",
      id: "rel-doc-a",
      relationType: "documents",
      sourceType: "document",
      sourceId: "doc-a",
      targetType: "research_item",
      targetId: "item-a",
      role: "supporting_note",
      createdAt: "2026-08-28T10:01:00+09:00",
    } as ResearchRelationRecord;

    const result = discoverResearchOrphans({
      repositoryRootPath: root,
      assetRegistry: registry([record], { "doc-a": "2026-08-28T10:00:00+09:00" }),
      catalogRepository: catalog([relation]),
    });

    assert.deepEqual(result.candidates, []);
  });
  console.log("research orphan discovery: registered related asset excluded OK");
}

function testOnlyProvenActiveUnlinkedAssetGetsLinkWarning(): void {
  withRepo((root) => {
    writeFileSync(join(root, "docs/research/proven.md"), "# proven\n");
    writeFileSync(join(root, "docs/research/pending.md"), "# pending\n");
    writeFileSync(join(root, "docs/research/deprecated.md"), "# deprecated\n");
    const records: ResearchAssetRecord[] = [
      {
        schemaVersion: 1,
        id: "doc-proven",
        assetType: "document",
        path: "docs/research/proven.md",
        status: "active",
        description: "proven",
      },
      {
        schemaVersion: 1,
        id: "doc-pending",
        assetType: "document",
        path: "docs/research/pending.md",
        status: "active",
        description: "pending",
      },
      {
        schemaVersion: 1,
        id: "doc-deprecated",
        assetType: "document",
        path: "docs/research/deprecated.md",
        status: "deprecated",
        description: "deprecated",
      },
    ];

    const result = discoverResearchOrphans({
      repositoryRootPath: root,
      assetRegistry: registry(records, {
        "doc-proven": "2026-08-28T10:00:00+09:00",
        "doc-deprecated": "2026-08-28T10:00:00+09:00",
      }),
      catalogRepository: catalog(),
    });

    assert.deepEqual(candidateKeys(result), [
      "registered_asset_without_relation:document:doc-proven",
    ]);
    assert.equal(result.candidates[0]?.classification, "existing_research_link_missing");
    assert.equal(result.stats.unlinkedProvenAssetCount, 1);
    assert.equal(result.stats.unregisteredDocumentCount, 0);
  });
  console.log("research orphan discovery: proven/unlinked only; pending/deprecated suppressed OK");
}

function testAuthorityErrorsFailClosedBeforeDiscovery(): void {
  withRepo((root) => {
    writeFileSync(join(root, "docs/research/a.md"), "# A\n");
    const result = discoverResearchOrphans({
      repositoryRootPath: root,
      assetRegistry: registry([], {}, [{
        severity: "error",
        code: "fixture_asset_error",
        target: "asset",
        message: "broken authority",
      }]),
      catalogRepository: catalog(),
    });

    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.scannedDocumentPaths, []);
    assert.equal(result.issues[0]?.code, "fixture_asset_error");
  });
  console.log("research orphan discovery: authority error fail-closed OK");
}

function testInvalidScanBoundaryFailsClosed(): void {
  withRepo((root) => {
    const invalidRoot = discoverResearchOrphans({
      repositoryRootPath: root,
      documentRoots: ["../outside"],
      assetRegistry: registry(),
      catalogRepository: catalog(),
    });
    assert.deepEqual(invalidRoot.candidates, []);
    assert.ok(invalidRoot.issues.some((entry) => entry.code === "research_orphan_scan_root_noncanonical"));

    writeFileSync(join(root, "docs/research/a.md"), "# A\n");
    writeFileSync(join(root, "docs/research/b.md"), "# B\n");
    const bounded = discoverResearchOrphans({
      repositoryRootPath: root,
      maxScannedFiles: 1,
      assetRegistry: registry(),
      catalogRepository: catalog(),
    });
    assert.deepEqual(bounded.candidates, []);
    assert.ok(bounded.issues.some((entry) => entry.code === "research_orphan_scan_file_limit_exceeded"));
  });
  console.log("research orphan discovery: path/file-count boundary fail-closed OK");
}

testStructuredDocumentScanIsDeterministicAndExcludesGenerated();
testRegisteredAndRelatedAssetIsNotOrphaned();
testOnlyProvenActiveUnlinkedAssetGetsLinkWarning();
testAuthorityErrorsFailClosedBeforeDiscovery();
testInvalidScanBoundaryFailsClosed();
console.log("research orphan discovery: all tests passed");
