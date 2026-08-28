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
import { readResearchAssetRegistry } from "../../src/research/research-asset-registry.js";

function expectIssueCode(rootPath: string, code: string): void {
  const result = readResearchAssetRegistry({
    rootPath,
    repositoryRootPath: ".",
  });
  assert.ok(
    result.issues.some((entry) => entry.code === code),
    `${rootPath} must report ${code}; got ${result.issues.map((entry) => entry.code).join(", ")}`,
  );
}

const parent = mkdtempSync(join(tmpdir(), "alpha-pon-research-asset-fs-"));

try {
  const emptyRoot = join(parent, "empty-root");
  mkdirSync(emptyRoot);
  const empty = readResearchAssetRegistry({ rootPath: emptyRoot, repositoryRootPath: "." });
  assert.deepEqual(
    empty.issues,
    [],
    "missing assets/ and provenance.jsonl are legal before the first canonical Asset is registered",
  );
  assert.deepEqual(empty.records, []);
  assert.deepEqual(empty.provenanceRecords, []);

  const rootFile = join(parent, "root-file");
  writeFileSync(rootFile, "not-a-directory\n", "utf-8");
  expectIssueCode(rootFile, "research_asset_registry_root_not_directory");

  const rootTarget = join(parent, "root-target");
  mkdirSync(rootTarget);
  const rootSymlink = join(parent, "root-symlink");
  symlinkSync(rootTarget, rootSymlink, "dir");
  expectIssueCode(rootSymlink, "research_asset_registry_root_not_directory");

  const assetsFileRoot = join(parent, "assets-file-root");
  mkdirSync(assetsFileRoot);
  writeFileSync(join(assetsFileRoot, "assets"), "not-a-directory\n", "utf-8");
  expectIssueCode(assetsFileRoot, "research_asset_registry_assets_not_directory");

  const assetsSymlinkRoot = join(parent, "assets-symlink-root");
  mkdirSync(assetsSymlinkRoot);
  const assetsTarget = join(parent, "assets-target");
  mkdirSync(assetsTarget);
  symlinkSync(assetsTarget, join(assetsSymlinkRoot, "assets"), "dir");
  expectIssueCode(assetsSymlinkRoot, "research_asset_registry_assets_not_directory");

  const provenanceDirectoryRoot = join(parent, "provenance-directory-root");
  mkdirSync(provenanceDirectoryRoot);
  mkdirSync(join(provenanceDirectoryRoot, "provenance.jsonl"));
  expectIssueCode(provenanceDirectoryRoot, "research_asset_provenance_not_regular_file");

  const provenanceSymlinkRoot = join(parent, "provenance-symlink-root");
  mkdirSync(provenanceSymlinkRoot);
  const provenanceTarget = join(parent, "provenance-target.jsonl");
  writeFileSync(provenanceTarget, "", "utf-8");
  symlinkSync(provenanceTarget, join(provenanceSymlinkRoot, "provenance.jsonl"), "file");
  expectIssueCode(provenanceSymlinkRoot, "research_asset_provenance_not_regular_file");

  const schemaSymlinkRoot = join(parent, "schema-symlink-root");
  mkdirSync(schemaSymlinkRoot);
  const schemaSymlink = join(parent, "asset-schema-symlink.json");
  symlinkSync(join(process.cwd(), "research/schemas/research-asset.schema.json"), schemaSymlink, "file");
  const schemaSymlinkResult = readResearchAssetRegistry({
    rootPath: schemaSymlinkRoot,
    repositoryRootPath: ".",
    assetSchemaPath: schemaSymlink,
  });
  assert.ok(
    schemaSymlinkResult.issues.some((entry) => entry.code === "research_asset_registry_read_failed"),
    "schema symlinks must fail closed instead of becoming authority",
  );
} finally {
  rmSync(parent, { recursive: true, force: true });
}

console.log("research asset filesystem boundary: all tests passed");
