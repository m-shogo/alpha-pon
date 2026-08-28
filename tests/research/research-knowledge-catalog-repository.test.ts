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
  readResearchKnowledgeCatalogRepository,
  RESEARCH_KNOWLEDGE_CATALOG_ROOT,
} from "../../src/research/research-knowledge-catalog-repository.js";
import { loadResearchKnowledgeRepositorySnapshot } from "../../src/research/research-knowledge-repository-loader.js";

function createRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return root;
}

function writeYaml(root: string, directory: string, filename: string, value: unknown): string {
  const dir = join(root, directory);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, dump(value, { noRefs: true, sortKeys: true, lineWidth: 120 }), "utf-8");
  return path;
}

function researchItem(id: string, title = "Catalog fixture item") {
  return {
    schemaVersion: 1,
    ontologyVersion: "research-knowledge-v1",
    id,
    title,
    status: "captured",
    createdAt: "2026-08-28T10:00:00+09:00",
    origin: "manual_research",
    summary: "Catalog repository fixture used to prove strict persistence behavior.",
  };
}

function researchCase(id: string) {
  return {
    schemaVersion: 1,
    ontologyVersion: "research-knowledge-v1",
    id,
    title: "Catalog fixture case",
    status: "open",
    createdAt: "2026-08-28T10:05:00+09:00",
    summary: "Bounded case fixture for cross-collection identity checks.",
  };
}

{
  const canonical = readResearchKnowledgeCatalogRepository();
  assert.deepEqual(canonical.issues, [], "canonical Catalog must remain structurally valid as real records are added");
  assert.equal(
    canonical.totalCount,
    Object.values(canonical.counts).reduce((sum, count) => sum + count, 0),
    "canonical Catalog count contract must remain correct at zero or any future record count",
  );
  assert.equal(RESEARCH_KNOWLEDGE_CATALOG_ROOT, "research/knowledge_catalog");
}

{
  const root = createRoot("alpha-pon-catalog-valid-");
  try {
    writeYaml(root, "research_items", "zeta-item.yml", researchItem("zeta-item", "Zeta catalog item"));
    writeYaml(root, "research_items", "alpha-item.yml", researchItem("alpha-item", "Alpha catalog item"));
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.snapshot.researchItems.map((entry) => entry.id), ["alpha-item", "zeta-item"]);
    assert.equal(result.counts.researchItems, 2);
    assert.equal(result.totalCount, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const missingRoot = join(tmpdir(), `alpha-pon-catalog-missing-${Date.now()}`);
  const result = readResearchKnowledgeCatalogRepository({ rootPath: missingRoot });
  assert.ok(result.issues.some((entry) => entry.code === "research_catalog_root_missing"));
  assert.equal(result.totalCount, 0);
}

{
  const root = createRoot("alpha-pon-catalog-yaml-");
  try {
    mkdirSync(join(root, "research_items"));
    writeFileSync(join(root, "research_items", "broken-item.yml"), "id: [unterminated\n", "utf-8");
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.ok(result.issues.some((entry) => entry.code === "research_catalog_invalid_yaml"));
    assert.equal(result.snapshot.researchItems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-schema-");
  try {
    writeYaml(root, "research_items", "schema-item.yml", {
      ...researchItem("schema-item"),
      status: "made_up_status",
    });
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.ok(result.issues.some((entry) => entry.code === "research_catalog_schema_invalid"));
    assert.equal(result.snapshot.researchItems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-name-");
  try {
    writeYaml(root, "research_items", "wrong-name.yml", researchItem("actual-id"));
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.ok(result.issues.some((entry) => entry.code === "research_catalog_filename_id_mismatch"));
    assert.equal(result.snapshot.researchItems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-duplicate-");
  try {
    writeYaml(root, "research_items", "shared-id.yml", researchItem("shared-id"));
    writeYaml(root, "cases", "shared-id.yml", researchCase("shared-id"));
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    const duplicateIssues = result.issues.filter((entry) => entry.code === "research_catalog_duplicate_owned_id");
    assert.equal(duplicateIssues.length, 2, "both sides of a global owned-ID collision must be identified");
    assert.equal(result.snapshot.researchItems.length, 0, "do not choose one duplicate arbitrarily");
    assert.equal(result.snapshot.cases.length, 0, "do not choose one duplicate arbitrarily");
    assert.equal(result.totalCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-symlink-");
  try {
    mkdirSync(join(root, "research_items"));
    const target = join(root, "target.yml");
    writeFileSync(target, dump(researchItem("linked-item")), "utf-8");
    symlinkSync(target, join(root, "research_items", "linked-item.yml"));
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.ok(result.issues.some((entry) => entry.code === "research_catalog_record_symlink"));
    assert.equal(result.snapshot.researchItems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-unexpected-");
  try {
    mkdirSync(join(root, "cases"));
    writeFileSync(join(root, "cases", "notes.json"), "{}\n", "utf-8");
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.ok(result.issues.some((entry) => entry.code === "research_catalog_unexpected_file"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-size-");
  try {
    writeYaml(root, "research_items", "large-item.yml", researchItem("large-item"));
    const result = readResearchKnowledgeCatalogRepository({ rootPath: root, maxRecordBytes: 32 });
    assert.ok(result.issues.some((entry) => entry.code === "research_catalog_record_too_large"));
    assert.equal(result.snapshot.researchItems.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = createRoot("alpha-pon-catalog-loader-");
  try {
    writeYaml(root, "research_items", "loader-item.yml", researchItem("loader-item"));
    const missingEventDb = join(root, "missing-market-events.db");
    const missingEntities = join(root, "missing-security-entities.jsonl");
    const first = loadResearchKnowledgeRepositorySnapshot(undefined, {
      catalogRootPath: root,
      marketEventDatabasePath: missingEventDb,
      securityMasterEntitiesPath: missingEntities,
    });
    const second = loadResearchKnowledgeRepositorySnapshot(undefined, {
      catalogRootPath: root,
      marketEventDatabasePath: missingEventDb,
      securityMasterEntitiesPath: missingEntities,
    });
    assert.deepEqual(first.issues, []);
    assert.deepEqual(first.snapshot.researchItems.map((entry) => entry.id), ["loader-item"]);
    assert.equal(first.fingerprint, second.fingerprint, "same Catalog + Authority state must be deterministic");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const explicitMissingRoot = join(tmpdir(), `alpha-pon-catalog-loader-missing-${Date.now()}`);
  const result = loadResearchKnowledgeRepositorySnapshot(undefined, {
    catalogRootPath: explicitMissingRoot,
    marketEventDatabasePath: join(explicitMissingRoot, "missing.db"),
    securityMasterEntitiesPath: join(explicitMissingRoot, "missing.jsonl"),
  });
  assert.ok(
    result.issues.some((entry) => entry.code === "research_catalog_root_missing"),
    "repository snapshot must not silently turn a missing canonical Catalog into empty research",
  );
}

console.log("research knowledge catalog repository: all tests passed");
