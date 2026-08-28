import assert from "node:assert/strict";
import { load } from "js-yaml";
import {
  checkChanges,
  immutableFieldsForPath,
  ruleForPath,
} from "../../src/research/history-guard.js";

const parseYaml = (content: string) => load(content) as Record<string, unknown>;
const assetPath = "research/asset_registry/assets/document-fixture.yml";

assert.equal(ruleForPath(assetPath), "immutable_fields");
assert.deepEqual(immutableFieldsForPath(assetPath), ["schemaVersion", "id", "assetType"]);
assert.equal(ruleForPath("research/asset_registry/provenance.jsonl"), "append_only");

const before = [
  "schemaVersion: 1",
  "id: document-fixture",
  "assetType: document",
  "path: docs/old.md",
  "status: active",
  "description: Fixture document asset",
  "",
].join("\n");

const renamedPath = before.replace("docs/old.md", "docs/new.md");
assert.deepEqual(
  checkChanges([{ path: assetPath, changeType: "modified", oldContent: before, newContent: renamedPath }], parseYaml),
  [],
  "current path may move without changing stable Asset identity",
);

const changedId = before.replace("id: document-fixture", "id: document-other");
assert.ok(
  checkChanges([{ path: assetPath, changeType: "modified", oldContent: before, newContent: changedId }], parseYaml)
    .some((entry) => entry.code === "immutable_field_changed"),
  "stable Asset ID cannot be rewritten in place",
);

const changedType = before.replace("assetType: document", "assetType: watch");
assert.ok(
  checkChanges([{ path: assetPath, changeType: "modified", oldContent: before, newContent: changedType }], parseYaml)
    .some((entry) => entry.code === "immutable_field_changed"),
  "Asset type cannot be rewritten in place",
);

assert.ok(
  checkChanges([{ path: assetPath, changeType: "deleted", oldContent: before, newContent: null }], parseYaml)
    .some((entry) => entry.code === "record_removed"),
  "governed Asset identity cannot be deleted",
);

const provenanceBefore = '{"assetId":"document-fixture","firstKnownAt":"2026-08-20T10:00:00+09:00"}\n';
const provenanceRewrite = '{"assetId":"document-fixture","firstKnownAt":"2026-08-21T10:00:00+09:00"}\n';
assert.ok(
  checkChanges([{
    path: "research/asset_registry/provenance.jsonl",
    changeType: "modified",
    oldContent: provenanceBefore,
    newContent: provenanceRewrite,
  }], parseYaml).some((entry) => entry.code === "not_append_only"),
  "Asset first-known provenance cannot be rewritten",
);

const provenanceAppend = `${provenanceBefore}{"assetId":"watch-fixture","firstKnownAt":"2026-08-22T10:00:00+09:00"}\n`;
assert.deepEqual(
  checkChanges([{
    path: "research/asset_registry/provenance.jsonl",
    changeType: "modified",
    oldContent: provenanceBefore,
    newContent: provenanceAppend,
  }], parseYaml),
  [],
  "new Asset provenance facts may be appended",
);

console.log("research asset history guard: all tests passed");
