import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dump } from "js-yaml";
import {
  buildResearchAssetAuthorityViews,
  readResearchAssetRegistry,
  RESEARCH_ASSET_REGISTRY_ROOT,
  type ResearchAssetRecord,
} from "../../src/research/research-asset-registry.js";
import { loadResearchKnowledgeRepositorySnapshot } from "../../src/research/research-knowledge-repository-loader.js";
import { emptyResearchKnowledgeOwnedSnapshot } from "../../src/research/research-knowledge-snapshot-loader.js";

function asset(id: string, assetType: ResearchAssetRecord["assetType"], path: string): ResearchAssetRecord {
  return {
    schemaVersion: 1,
    id,
    assetType,
    path,
    status: "active",
    description: `Fixture ${assetType} asset ${id}`,
  };
}

function writeAsset(root: string, record: ResearchAssetRecord): void {
  const dir = join(root, "assets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${record.id}.yml`),
    dump(record, { noRefs: true, sortKeys: true, lineWidth: 120 }),
    "utf-8",
  );
}

{
  const canonical = readResearchAssetRegistry();
  assert.deepEqual(canonical.issues, [], "canonical seeded Asset Registry must be structurally valid");
  assert.deepEqual(canonical.records.map((entry) => entry.id), [
    "document-exchange-sanction-remediation-clock-seed",
    "document-listing-event-watch-guide",
    "document-revolution-8894-special-attention-case",
    "document-special-situation-watch-playbook",
    "implementation-listing-event-watch-report",
    "implementation-special-situation-watch-report",
    "watch-listing-event-watch",
    "watch-special-situation-watch-rules",
  ]);
  assert.deepEqual(
    canonical.missingProvenanceIds,
    canonical.records.map((entry) => entry.id),
    "seeded identities must remain unavailable for PIT relations until exact first-known provenance is backfilled",
  );
  assert.equal(RESEARCH_ASSET_REGISTRY_ROOT, "research/asset_registry");
  const views = buildResearchAssetAuthorityViews(canonical);
  assert.deepEqual(views.document.ids, [
    "document-exchange-sanction-remediation-clock-seed",
    "document-listing-event-watch-guide",
    "document-revolution-8894-special-attention-case",
    "document-special-situation-watch-playbook",
  ]);
  assert.deepEqual(views.watch.ids, [
    "watch-listing-event-watch",
    "watch-special-situation-watch-rules",
  ]);
  assert.deepEqual(views.implementation.ids, [
    "implementation-listing-event-watch-report",
    "implementation-special-situation-watch-report",
  ]);
  assert.deepEqual(views.document.availability, {});
  assert.deepEqual(views.watch.availability, {});
  assert.deepEqual(views.implementation.availability, {});
}

{
  const temp = mkdtempSync(join(tmpdir(), "alpha-pon-asset-valid-"));
  const registryRoot = join(temp, "registry");
  const repoRoot = join(temp, "repo");
  try {
    mkdirSync(registryRoot, { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    mkdirSync(join(repoRoot, "config"), { recursive: true });
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "docs", "design.md"), "# design\n", "utf-8");
    writeFileSync(join(repoRoot, "config", "watch.yml"), "enabled: true\n", "utf-8");
    writeFileSync(join(repoRoot, "src", "module.ts"), "export {};\n", "utf-8");
    writeAsset(registryRoot, asset("document-design", "document", "docs/design.md"));
    writeAsset(registryRoot, asset("watch-special", "watch", "config/watch.yml"));
    writeAsset(registryRoot, asset("implementation-special", "implementation", "src/module.ts"));

    const result = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.records.map((entry) => entry.id), [
      "document-design",
      "implementation-special",
      "watch-special",
    ]);
    assert.deepEqual(result.missingProvenanceIds, [
      "document-design",
      "implementation-special",
      "watch-special",
    ]);
    const views = buildResearchAssetAuthorityViews(result);
    assert.deepEqual(views.document.ids, ["document-design"]);
    assert.deepEqual(views.watch.ids, ["watch-special"]);
    assert.deepEqual(views.implementation.ids, ["implementation-special"]);
    assert.deepEqual(views.document.availability, {});

    const provenance = {
      schemaVersion: 1,
      assetId: "document-design",
      firstKnownAt: "2026-08-20T10:00:00+09:00",
      basis: "canonical_git_first_presence",
      sourceCommitSha: "a".repeat(40),
      sourceCommitAt: "2026-08-20T10:00:00+09:00",
      sourcePath: "docs/design.md",
    };
    writeFileSync(join(registryRoot, "provenance.jsonl"), `${JSON.stringify(provenance)}\n`, "utf-8");
    const proven = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.deepEqual(proven.issues, []);
    assert.equal(proven.firstKnownAtById["document-design"], "2026-08-20T10:00:00+09:00");
    assert.deepEqual(proven.missingProvenanceIds, ["implementation-special", "watch-special"]);

    const owned = emptyResearchKnowledgeOwnedSnapshot();
    owned.researchItems = [{
      schemaVersion: 1,
      ontologyVersion: "research-knowledge-v1",
      id: "asset-reference-item",
      title: "Asset reference fixture",
      status: "captured",
      createdAt: "2026-08-28T10:00:00+09:00",
      origin: "manual_research",
      summary: "Fixture proving strict external Asset availability.",
    }];
    owned.relations = [{
      schemaVersion: 1,
      ontologyVersion: "research-knowledge-v1",
      id: "asset-document-relation",
      relationType: "documents",
      sourceType: "document",
      sourceId: "document-design",
      targetType: "research_item",
      targetId: "asset-reference-item",
      role: "supporting_note",
      createdAt: "2026-08-28T10:05:00+09:00",
    }];

    const safe = loadResearchKnowledgeRepositorySnapshot(owned, {
      marketEventDatabasePath: join(temp, "missing.db"),
      securityMasterEntitiesPath: join(temp, "missing-entities.jsonl"),
      assetRegistryRootPath: registryRoot,
      assetRegistryRepositoryRootPath: repoRoot,
    });
    assert.deepEqual(safe.issues, [], "provenanced Asset may participate in strict Research Knowledge relations");

    rmSync(join(registryRoot, "provenance.jsonl"));
    const blocked = loadResearchKnowledgeRepositorySnapshot(owned, {
      marketEventDatabasePath: join(temp, "missing.db"),
      securityMasterEntitiesPath: join(temp, "missing-entities.jsonl"),
      assetRegistryRootPath: registryRoot,
      assetRegistryRepositoryRootPath: repoRoot,
    });
    assert.ok(
      blocked.issues.some((entry) => entry.code === "research_external_availability_required"),
      "registered Asset without exact provenance may exist but strict relation use must fail closed",
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

{
  const temp = mkdtempSync(join(tmpdir(), "alpha-pon-asset-bad-"));
  const registryRoot = join(temp, "registry");
  const repoRoot = join(temp, "repo");
  try {
    mkdirSync(registryRoot, { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(join(repoRoot, "docs", "same.md"), "same\n", "utf-8");
    writeAsset(registryRoot, asset("document-one", "document", "docs/same.md"));
    writeAsset(registryRoot, asset("document-two", "document", "docs/same.md"));
    const duplicate = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.equal(duplicate.records.length, 0, "duplicate physical target must not choose one Asset identity arbitrarily");
    assert.equal(
      duplicate.issues.filter((entry) => entry.code === "research_asset_registry_duplicate_target_path").length,
      2,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

{
  const temp = mkdtempSync(join(tmpdir(), "alpha-pon-asset-path-"));
  const registryRoot = join(temp, "registry");
  const repoRoot = join(temp, "repo");
  try {
    mkdirSync(registryRoot, { recursive: true });
    mkdirSync(repoRoot, { recursive: true });
    writeAsset(registryRoot, asset("document-bad-path", "document", "../outside.md"));
    const result = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.ok(result.issues.some((entry) => entry.code === "research_asset_registry_noncanonical_path"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

{
  const temp = mkdtempSync(join(tmpdir(), "alpha-pon-asset-target-"));
  const registryRoot = join(temp, "registry");
  const repoRoot = join(temp, "repo");
  try {
    mkdirSync(registryRoot, { recursive: true });
    mkdirSync(repoRoot, { recursive: true });
    writeAsset(registryRoot, asset("document-missing", "document", "docs/missing.md"));
    const result = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.ok(result.issues.some((entry) => entry.code === "research_asset_registry_target_missing"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

{
  const temp = mkdtempSync(join(tmpdir(), "alpha-pon-asset-symlink-"));
  const registryRoot = join(temp, "registry");
  const repoRoot = join(temp, "repo");
  try {
    mkdirSync(registryRoot, { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(join(repoRoot, "real.md"), "real\n", "utf-8");
    symlinkSync(join(repoRoot, "real.md"), join(repoRoot, "docs", "linked.md"));
    writeAsset(registryRoot, asset("document-linked", "document", "docs/linked.md"));
    const result = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.ok(result.issues.some((entry) => entry.code === "research_asset_registry_target_not_regular_file"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

{
  const temp = mkdtempSync(join(tmpdir(), "alpha-pon-asset-provenance-"));
  const registryRoot = join(temp, "registry");
  const repoRoot = join(temp, "repo");
  try {
    mkdirSync(registryRoot, { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(join(repoRoot, "docs", "x.md"), "x\n", "utf-8");
    writeAsset(registryRoot, asset("document-x", "document", "docs/x.md"));
    const mismatched = {
      schemaVersion: 1,
      assetId: "document-x",
      firstKnownAt: "2026-08-20T10:00:00+09:00",
      basis: "canonical_git_first_presence",
      sourceCommitSha: "b".repeat(40),
      sourceCommitAt: "2026-08-20T10:00:01+09:00",
      sourcePath: "docs/x.md",
    };
    writeFileSync(join(registryRoot, "provenance.jsonl"), `${JSON.stringify(mismatched)}\n`, "utf-8");
    const mismatch = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.ok(mismatch.issues.some((entry) => entry.code === "research_asset_provenance_time_mismatch"));
    assert.deepEqual(mismatch.firstKnownAtById, {});

    writeFileSync(join(registryRoot, "provenance.jsonl"), JSON.stringify(mismatched), "utf-8");
    const partial = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repoRoot });
    assert.ok(partial.issues.some((entry) => entry.code === "research_asset_provenance_partial_tail"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

console.log("research asset registry: all tests passed");
