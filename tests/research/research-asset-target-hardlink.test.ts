import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readResearchAssetRegistry } from "../../src/research/research-asset-registry.js";

const workspace = mkdtempSync(join(tmpdir(), "alpha-pon-asset-target-hardlink-"));
try {
  const registryRoot = join(workspace, "registry");
  const repositoryRoot = join(workspace, "repository");
  mkdirSync(join(registryRoot, "assets"), { recursive: true });
  mkdirSync(join(repositoryRoot, "docs"), { recursive: true });

  const externalTarget = join(workspace, "external-target.md");
  writeFileSync(externalTarget, "externally mutable asset\n", "utf-8");
  linkSync(externalTarget, join(repositoryRoot, "docs", "target.md"));

  writeFileSync(join(registryRoot, "assets", "document-hardlinked-target.yml"), [
    "schemaVersion: 1",
    "id: document-hardlinked-target",
    "assetType: document",
    "path: docs/target.md",
    "status: active",
    "description: Hard-linked registered asset target fixture",
    "",
  ].join("\n"), "utf-8");

  const result = readResearchAssetRegistry({ rootPath: registryRoot, repositoryRootPath: repositoryRoot });
  assert.ok(
    result.issues.some((entry) => entry.code === "research_asset_registry_target_not_regular_file"),
    "hard-linked registered asset targets must fail closed",
  );
  assert.equal(
    result.records.some((record) => record.id === "document-hardlinked-target"),
    false,
    "hard-linked target must not become canonical Research Asset authority",
  );
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log("research asset target hardlink: all tests passed");
