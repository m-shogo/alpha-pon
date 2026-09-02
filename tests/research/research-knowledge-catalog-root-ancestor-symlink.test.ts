import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readResearchKnowledgeCatalogRepository } from "../../src/research/research-knowledge-catalog-repository.js";

const workspace = mkdtempSync(join(tmpdir(), "alpha-pon-catalog-root-ancestor-"));
try {
  const realParent = join(workspace, "real-parent");
  const realCatalogRoot = join(realParent, "catalog");
  mkdirSync(realCatalogRoot, { recursive: true });

  const aliasParent = join(workspace, "alias-parent");
  symlinkSync(realParent, aliasParent, "dir");

  const result = readResearchKnowledgeCatalogRepository({
    rootPath: join(aliasParent, "catalog"),
  });

  assert.ok(
    result.issues.some((entry) => entry.code === "research_catalog_root_ancestor_symlink"),
    "Catalog authority reached through a symlinked ancestor must fail closed",
  );
  assert.equal(result.totalCount, 0);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log("research knowledge catalog root ancestor symlink: all tests passed");
