import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createResearchKnowledgeCatalogRecord,
  ResearchKnowledgeCatalogWriteError,
} from "../../src/research/research-knowledge-catalog-writer.js";
import { readResearchKnowledgeCatalogRepository } from "../../src/research/research-knowledge-catalog-repository.js";

function item(id: string) {
  return {
    schemaVersion: 1,
    ontologyVersion: "research-knowledge-v1",
    id,
    title: "Create-only writer fixture",
    status: "captured",
    createdAt: "2026-08-28T11:00:00+09:00",
    origin: "manual_research",
    summary: "Fixture proving create-only Research Knowledge persistence.",
  };
}

function researchCase(id: string) {
  return {
    schemaVersion: 1,
    ontologyVersion: "research-knowledge-v1",
    id,
    title: "Create-only case fixture",
    status: "open",
    createdAt: "2026-08-28T11:05:00+09:00",
    summary: "Case fixture used to prove IDs are globally unique across Catalog collections.",
  };
}

function expectWriteError(fn: () => unknown, code: string): ResearchKnowledgeCatalogWriteError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ResearchKnowledgeCatalogWriteError, `expected ResearchKnowledgeCatalogWriteError ${code}`);
  assert.equal(caught.code, code);
  return caught;
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-valid-"));
  try {
    const created = createResearchKnowledgeCatalogRecord("researchItems", item("writer-item"), { rootPath: root });
    assert.equal(created.path, join(root, "research_items", "writer-item.yml"));
    assert.ok(created.bytes > 0);
    assert.ok(existsSync(created.path));
    assert.match(readFileSync(created.path, "utf-8"), /id: writer-item/);

    const repository = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.deepEqual(repository.issues, []);
    assert.deepEqual(repository.snapshot.researchItems.map((entry) => entry.id), ["writer-item"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-existing-"));
  try {
    createResearchKnowledgeCatalogRecord("researchItems", item("shared-writer-id"), { rootPath: root });
    expectWriteError(
      () => createResearchKnowledgeCatalogRecord("researchItems", item("shared-writer-id"), { rootPath: root }),
      "research_catalog_id_already_exists",
    );
    expectWriteError(
      () => createResearchKnowledgeCatalogRecord("cases", researchCase("shared-writer-id"), { rootPath: root }),
      "research_catalog_id_already_exists",
    );
    const repository = readResearchKnowledgeCatalogRepository({ rootPath: root });
    assert.equal(repository.totalCount, 1, "failed duplicate writes must not create extra files");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-invalid-"));
  try {
    const invalid = { ...item("invalid-writer-item"), status: "invented" };
    expectWriteError(
      () => createResearchKnowledgeCatalogRecord("researchItems", invalid, { rootPath: root }),
      "research_catalog_schema_invalid",
    );
    assert.equal(existsSync(join(root, "research_items")), false, "schema-invalid input must not create a type directory");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-broken-"));
  try {
    mkdirSync(join(root, "research_items"));
    writeFileSync(join(root, "research_items", "broken.yml"), "id: [unterminated\n", "utf-8");
    expectWriteError(
      () => createResearchKnowledgeCatalogRecord("cases", researchCase("new-case"), { rootPath: root }),
      "research_catalog_write_blocked_by_existing_issues",
    );
    assert.equal(existsSync(join(root, "cases")), false, "writer must not add records while Catalog integrity is already red");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const missingRoot = join(tmpdir(), `alpha-pon-catalog-writer-missing-${Date.now()}`);
  expectWriteError(
    () => createResearchKnowledgeCatalogRecord("researchItems", item("missing-root-item"), { rootPath: missingRoot }),
    "research_catalog_root_missing",
  );
  assert.equal(existsSync(missingRoot), false, "writer must not silently create a new Catalog authority root");
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-symlink-"));
  const target = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-target-"));
  try {
    symlinkSync(target, join(root, "research_items"));
    expectWriteError(
      () => createResearchKnowledgeCatalogRecord("researchItems", item("symlink-item"), { rootPath: root }),
      "research_catalog_write_blocked_by_existing_issues",
    );
    assert.equal(existsSync(join(target, "symlink-item.yml")), false, "writer must never follow a Catalog directory symlink");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
}

{
  const root = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-size-"));
  try {
    expectWriteError(
      () => createResearchKnowledgeCatalogRecord("researchItems", item("tiny-limit-item"), {
        rootPath: root,
        maxRecordBytes: 16,
      }),
      "research_catalog_record_too_large",
    );
    assert.equal(existsSync(join(root, "research_items", "tiny-limit-item.yml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log("research knowledge catalog writer: all tests passed");
