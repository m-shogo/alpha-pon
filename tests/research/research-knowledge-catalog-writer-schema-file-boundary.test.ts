import assert from "node:assert/strict";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createResearchKnowledgeCatalogRecord,
  ResearchKnowledgeCatalogWriteError,
} from "../../src/research/research-knowledge-catalog-writer.js";

{
  const workspace = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-writer-schema-hardlink-"));
  const previousCwd = process.cwd();
  try {
    const catalogRoot = join(workspace, "catalog");
    mkdirSync(catalogRoot, { recursive: true });

    const schemasRoot = join(workspace, "research", "schemas");
    mkdirSync(schemasRoot, { recursive: true });
    const schemaTarget = join(workspace, "research-item.schema.target.json");
    writeFileSync(schemaTarget, "{}\n", "utf-8");
    linkSync(schemaTarget, join(schemasRoot, "research-item.schema.json"));

    process.chdir(workspace);
    assert.throws(
      () => createResearchKnowledgeCatalogRecord("researchItems", { id: "fixture" }, { rootPath: catalogRoot }),
      (error: unknown) => error instanceof ResearchKnowledgeCatalogWriteError
        && error.code === "research_catalog_schema_read_failed"
        && error.message.includes("schema must be a standalone regular file"),
      "writer must reject hard-linked schemas before they can authorize a Catalog write",
    );
    const collectionPath = join(catalogRoot, "research_items");
    assert.equal(
      existsSync(collectionPath) ? readdirSync(collectionPath).length : 0,
      0,
      "schema provenance failure must happen before writer creates a collection directory or record",
    );
  } finally {
    process.chdir(previousCwd);
    rmSync(workspace, { recursive: true, force: true });
  }
}

console.log("research knowledge catalog writer schema file boundary: all tests passed");
