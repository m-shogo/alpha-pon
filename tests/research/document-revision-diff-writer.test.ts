import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withDocumentRevisionHash,
} from "../../src/research/document-revision-diff.js";
import {
  validateIncomingDocumentRevisionDiffCutoff,
} from "../../src/research/document-revision-diff-governed.js";
import {
  appendDocumentRevisionDiffRecordsAtCutoffGoverned,
} from "../../src/research/document-revision-diff-writer.js";
import {
  correctedDocumentEvidenceSnapshot,
  documentDiff,
  documentKnownEntityIds,
  documentRevision,
  documentRevisionDiffSchemas,
  initialDocumentEvidenceSnapshot,
} from "./document-revision-diff-fixtures.js";

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-writer-"));
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  const initial = documentRevision();
  try {
    appendDocumentRevisionDiffRecordsAtCutoffGoverned(
      paths,
      { revisions: [initial], diffs: [] },
      "document-initial-owner",
      documentRevisionDiffSchemas,
      initialDocumentEvidenceSnapshot(),
      documentKnownEntityIds,
    );

    const initialSuperseded = documentRevision({
      recordId: "document-revision:document-pilot:0:row:002",
      status: "superseded",
      observedAt: "2026-08-05T17:03:30+09:00",
      retrievedAt: "2026-08-05T17:04:30+09:00",
      supersedesRecordId: initial.recordId,
    });
    const correction = documentRevision({ revisionSequence: 1 });
    const correctionDiff = documentDiff();
    appendDocumentRevisionDiffRecordsAtCutoffGoverned(
      paths,
      {
        revisions: [initialSuperseded, correction],
        diffs: [correctionDiff],
      },
      "document-correction-owner",
      documentRevisionDiffSchemas,
      correctedDocumentEvidenceSnapshot(),
      documentKnownEntityIds,
    );

    assert.equal(
      readFileSync(paths.revisions, "utf-8").trim().split("\n").length,
      3,
    );
    assert.equal(
      readFileSync(paths.diffs, "utf-8").trim().split("\n").length,
      1,
    );
    assert.equal(existsSync(`${paths.revisions}.batch-journal.json`), false);
    assert.equal(existsSync(`${paths.revisions}.document-revision.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-writer: initial then correction batch OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-writer-future-"));
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  const future = documentRevision({ revisionSequence: 1 });
  try {
    assert.throws(
      () => appendDocumentRevisionDiffRecordsAtCutoffGoverned(
        paths,
        { revisions: [future], diffs: [] },
        "document-future-owner",
        documentRevisionDiffSchemas,
        initialDocumentEvidenceSnapshot(),
        documentKnownEntityIds,
      ),
      /incoming_document_revision_after_snapshot_cutoff/,
    );
    assert.equal(existsSync(`${paths.revisions}.document-revision.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-writer: future revision blocked and lock released OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-writer-journal-"));
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  try {
    writeFileSync(
      `${paths.revisions}.batch-journal.json`,
      `${JSON.stringify({ state: "revisions_appended" })}\n`,
      "utf-8",
    );
    assert.throws(
      () => appendDocumentRevisionDiffRecordsAtCutoffGoverned(
        paths,
        { revisions: [documentRevision()], diffs: [] },
        "document-journal-owner",
        documentRevisionDiffSchemas,
        initialDocumentEvidenceSnapshot(),
        documentKnownEntityIds,
      ),
      /incomplete_document_revision_batch/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-writer: incomplete journal fail-closed OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-writer-tamper-"));
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  const valid = documentRevision();
  const tampered = {
    ...valid,
    contentHash: "0".repeat(64),
  };
  try {
    assert.throws(
      () => appendDocumentRevisionDiffRecordsAtCutoffGoverned(
        paths,
        { revisions: [tampered], diffs: [] },
        "document-tamper-owner",
        documentRevisionDiffSchemas,
        initialDocumentEvidenceSnapshot(),
        documentKnownEntityIds,
      ),
      /invalid_document_revision_hash/,
    );
    assert.equal(existsSync(`${paths.revisions}.document-revision.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-writer: tamper block and lock cleanup OK");
}

{
  const futureInput = {
    ...documentRevision({ revisionSequence: 1 }),
    recordId: "document-revision:document-pilot:future:row:001",
    documentRevisionId: "document-revision:document-pilot:future",
    revisionSequence: 2,
    observedAt: "2026-08-06T11:01:00+09:00",
    retrievedAt: "2026-08-06T11:02:00+09:00",
    effectiveFrom: "2026-08-06T11:00:00+09:00",
  };
  const rehashed = withDocumentRevisionHash(futureInput);
  assert.notEqual(rehashed.contentHash, "0".repeat(64));
  console.log("document-revision-diff-writer: fixture rehash helper OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-writer-expired-incoming-"));
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
  };
  const snapshot = correctedDocumentEvidenceSnapshot();
  const expiredRevision = documentRevision({
    recordId: "document-revision:document-pilot:expired:row:001",
    documentRevisionId: "document-revision:document-pilot:expired",
    effectiveTo: "2026-08-06T09:59:59.999999999+09:00",
  });
  const expiredDiff = documentDiff({
    recordId: "document-diff:document-pilot:expired:row:001",
    diffId: "document-diff:document-pilot:expired",
    effectiveTo: "2026-08-06T09:59:59.999999999+09:00",
  });
  const directIssues = validateIncomingDocumentRevisionDiffCutoff(
    [expiredRevision],
    [expiredDiff],
    snapshot,
  );
  assert.ok(directIssues.some(
    (candidate) => candidate.code === "incoming_document_revision_expired_before_snapshot_cutoff",
  ));
  assert.ok(directIssues.some(
    (candidate) => candidate.code === "incoming_document_diff_expired_before_snapshot_cutoff",
  ));
  try {
    assert.throws(
      () => appendDocumentRevisionDiffRecordsAtCutoffGoverned(
        paths,
        { revisions: [expiredRevision], diffs: [expiredDiff] },
        "document-expired-owner",
        documentRevisionDiffSchemas,
        snapshot,
        documentKnownEntityIds,
      ),
      /incoming_document_(revision|diff)_expired_before_snapshot_cutoff/,
    );
    assert.equal(existsSync(paths.revisions), false);
    assert.equal(existsSync(paths.diffs), false);
    assert.equal(existsSync(`${paths.revisions}.document-revision.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-writer: expired incoming records are rejected before append OK");
}

console.log("document-revision-diff-writer: 全テスト成功");
