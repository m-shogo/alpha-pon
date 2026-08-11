import assert from "node:assert/strict";
import { buildEvidenceSnapshot } from "../../src/research/bitemporal-evidence-store.js";
import {
  buildDocumentRevisionDiffSnapshot,
  withDocumentRevisionHash,
  type DocumentRevisionRecordInput,
} from "../../src/research/document-revision-diff.js";

function revision(input: {
  id: string;
  documentId: string;
  instant: string;
}) {
  const record: DocumentRevisionRecordInput = {
    schemaVersion: 1,
    recordId: `${input.id}:row:001`,
    documentRevisionId: input.id,
    documentId: input.documentId,
    entityIds: ["entity:issuer:fixture"],
    evidenceId: `evidence:${input.id}`,
    documentType: "statutory_filing",
    revisionKind: "initial",
    revisionSequence: 0,
    status: "active",
    sourceContentHash: "a".repeat(64),
    normalizedStructureHash: "b".repeat(64),
    publishedAt: "2026-08-05T15:00:00.000000000Z",
    observedAt: input.instant,
    retrievedAt: input.instant,
    effectiveFrom: "2026-08-05T15:00:00.000000000Z",
    language: "ja",
    storagePolicy: "metadata_only",
    parserVersion: "fixture-v1",
    normalizationVersion: "fixture-v1",
    sections: [{
      sectionId: "root",
      path: "/",
      ordinal: 0,
      titleHash: "c".repeat(64),
      contentHash: "d".repeat(64),
    }],
  };
  return withDocumentRevisionHash(record);
}

const cutoff = "2026-08-05T15:04:00.000000001Z";
const evidenceSnapshot = buildEvidenceSnapshot(
  [],
  [],
  cutoff,
  "system_replay",
  "knowledge",
);

const atCutoff = revision({
  id: "document-revision:at-cutoff",
  documentId: "document:at-cutoff",
  instant: cutoff,
});
const oneNanosecondFuture = revision({
  id: "document-revision:future",
  documentId: "document:future",
  instant: "2026-08-05T15:04:00.000000002Z",
});

const snapshot = buildDocumentRevisionDiffSnapshot(
  [oneNanosecondFuture, atCutoff],
  [],
  evidenceSnapshot,
);

assert.deepEqual(snapshot.revisionIds, [atCutoff.documentRevisionId]);
assert.equal(snapshot.revisions.length, 1);
assert.equal(snapshot.revisions[0]?.recordId, atCutoff.recordId);
console.log("document-revision-diff snapshot: +1ns future revision excluded at PIT cutoff OK");
