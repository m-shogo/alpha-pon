import assert from "node:assert/strict";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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

  const provenanceHardlinkRoot = join(parent, "provenance-hardlink-root");
  mkdirSync(provenanceHardlinkRoot);
  const provenanceHardlinkTarget = join(parent, "provenance-hardlink-target.jsonl");
  writeFileSync(provenanceHardlinkTarget, "", "utf-8");
  linkSync(provenanceHardlinkTarget, join(provenanceHardlinkRoot, "provenance.jsonl"));
  expectIssueCode(provenanceHardlinkRoot, "research_asset_provenance_not_regular_file");

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

  const schemaHardlinkRoot = join(parent, "schema-hardlink-root");
  mkdirSync(schemaHardlinkRoot);
  const schemaHardlinkSource = join(parent, "asset-schema-hardlink-source.json");
  writeFileSync(
    schemaHardlinkSource,
    readFileSync(join(process.cwd(), "research/schemas/research-asset.schema.json"), "utf-8"),
    "utf-8",
  );
  const schemaHardlink = join(parent, "asset-schema-hardlink.json");
  linkSync(schemaHardlinkSource, schemaHardlink);
  const schemaHardlinkResult = readResearchAssetRegistry({
    rootPath: schemaHardlinkRoot,
    repositoryRootPath: ".",
    assetSchemaPath: schemaHardlink,
  });
  assert.ok(
    schemaHardlinkResult.issues.some((entry) => entry.code === "research_asset_registry_read_failed"),
    "hard-linked schemas must fail closed instead of becoming authority",
  );

  const recordHardlinkRoot = join(parent, "record-hardlink-root");
  const recordHardlinkRepo = join(parent, "record-hardlink-repo");
  mkdirSync(join(recordHardlinkRoot, "assets"), { recursive: true });
  mkdirSync(join(recordHardlinkRepo, "docs"), { recursive: true });
  writeFileSync(join(recordHardlinkRepo, "docs", "record.md"), "record\n", "utf-8");
  const recordHardlinkSource = join(parent, "document-hardlinked.yml");
  writeFileSync(recordHardlinkSource, [
    "schemaVersion: 1",
    "id: document-hardlinked",
    "assetType: document",
    "path: docs/record.md",
    "status: active",
    "description: Hard-linked registry record fixture",
    "",
  ].join("\n"), "utf-8");
  linkSync(recordHardlinkSource, join(recordHardlinkRoot, "assets", "document-hardlinked.yml"));
  const recordHardlinkResult = readResearchAssetRegistry({
    rootPath: recordHardlinkRoot,
    repositoryRootPath: recordHardlinkRepo,
  });
  assert.ok(
    recordHardlinkResult.issues.some((entry) => entry.code === "research_asset_registry_record_not_regular_file"),
    "hard-linked registry records must fail closed",
  );

  const targetHardlinkRoot = join(parent, "target-hardlink-root");
  const targetHardlinkRepo = join(parent, "target-hardlink-repo");
  mkdirSync(join(targetHardlinkRoot, "assets"), { recursive: true });
  mkdirSync(join(targetHardlinkRepo, "docs"), { recursive: true });
  const targetHardlinkSource = join(parent, "target-hardlink-source.md");
  writeFileSync(targetHardlinkSource, "target\n", "utf-8");
  linkSync(targetHardlinkSource, join(targetHardlinkRepo, "docs", "target.md"));
  writeFileSync(join(targetHardlinkRoot, "assets", "document-target-hardlink.yml"), [
    "schemaVersion: 1",
    "id: document-target-hardlink",
    "assetType: document",
    "path: docs/target.md",
    "status: active",
    "description: Hard-linked target fixture",
    "",
  ].join("\n"), "utf-8");
  const targetHardlinkResult = readResearchAssetRegistry({
    rootPath: targetHardlinkRoot,
    repositoryRootPath: targetHardlinkRepo,
  });
  assert.ok(
    targetHardlinkResult.issues.some((entry) => entry.code === "research_asset_registry_target_not_regular_file"),
    "hard-linked registered targets must fail closed",
  );
} finally {
  rmSync(parent, { recursive: true, force: true });
}

console.log("research asset filesystem boundary: all tests passed");
