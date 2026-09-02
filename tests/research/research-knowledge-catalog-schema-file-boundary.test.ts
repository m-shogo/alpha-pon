import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readResearchKnowledgeCatalogRepository } from "../../src/research/research-knowledge-catalog-repository.js";

{
  const workspace = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-schema-hardlink-"));
  const previousCwd = process.cwd();
  try {
    const catalogRoot = join(workspace, "catalog");
    mkdirSync(join(catalogRoot, "research_items"), { recursive: true });
    writeFileSync(join(catalogRoot, "research_items", "fixture.yml"), "id: fixture\n", "utf-8");

    const schemasRoot = join(workspace, "research", "schemas");
    mkdirSync(schemasRoot, { recursive: true });
    const schemaTarget = join(workspace, "research-item.schema.target.json");
    writeFileSync(schemaTarget, "{}\n", "utf-8");
    linkSync(schemaTarget, join(schemasRoot, "research-item.schema.json"));

    process.chdir(workspace);
    const result = readResearchKnowledgeCatalogRepository({ rootPath: catalogRoot });
    assert.ok(
      result.issues.some((entry) =>
        entry.code === "research_catalog_schema_read_failed"
        && entry.message.includes("schema must be a standalone regular file")),
      "hard-linked Catalog schemas must fail closed instead of becoming Research OS validation authority",
    );
    assert.equal(result.totalCount, 0);
  } finally {
    process.chdir(previousCwd);
    rmSync(workspace, { recursive: true, force: true });
  }
}

console.log("research knowledge catalog schema file boundary: all tests passed");
