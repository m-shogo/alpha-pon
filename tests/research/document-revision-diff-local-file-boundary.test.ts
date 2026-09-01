import assert from "node:assert/strict";
import {
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendDocumentRevisionDiffRecordsAtCutoffGoverned,
} from "../../src/research/document-revision-diff-writer.js";
import {
  documentKnownEntityIds,
  documentRevision,
  documentRevisionDiffSchemas,
  initialDocumentEvidenceSnapshot,
} from "./document-revision-diff-fixtures.js";

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-symlink-"));
  const target = join(dir, "outside.jsonl");
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  writeFileSync(target, "sentinel\n", "utf-8");
  symlinkSync(target, paths.revisions);
  try {
    assert.throws(
      () => appendDocumentRevisionDiffRecordsAtCutoffGoverned(
        paths,
        { revisions: [documentRevision()], diffs: [] },
        "document-symlink-owner",
        documentRevisionDiffSchemas,
        initialDocumentEvidenceSnapshot(),
        documentKnownEntityIds,
      ),
      /single-link regular file/,
    );
    assert.equal(readFileSync(target, "utf-8"), "sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document revision store: symlink path rejected without modifying target OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-hardlink-"));
  const target = join(dir, "outside.jsonl");
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  writeFileSync(target, "sentinel\n", "utf-8");
  linkSync(target, paths.diffs);
  try {
    assert.throws(
      () => appendDocumentRevisionDiffRecordsAtCutoffGoverned(
        paths,
        { revisions: [documentRevision()], diffs: [] },
        "document-hardlink-owner",
        documentRevisionDiffSchemas,
        initialDocumentEvidenceSnapshot(),
        documentKnownEntityIds,
      ),
      /single-link regular file/,
    );
    assert.equal(readFileSync(target, "utf-8"), "sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document revision store: hard-link path rejected without modifying target OK");
}

console.log("document-revision-diff-local-file-boundary: all tests passed");
