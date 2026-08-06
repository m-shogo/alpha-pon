import assert from "node:assert/strict";
import {
  buildGovernedDocumentRevisionDiffSnapshot,
  validateDocumentRevisionDiffAtCutoff,
  validateIncomingDocumentRevisionDiffCutoff,
} from "../../src/research/document-revision-diff-governed.js";
import {
  correctedDocumentEvidenceSnapshot,
  documentDiff,
  documentKnownEntityIds,
  documentRevision,
  documentRevisionDiffSchemas,
  initialDocumentEvidenceSnapshot,
} from "./document-revision-diff-fixtures.js";

const initial = documentRevision();
const initialSuperseded = documentRevision({
  recordId: "document-revision:document-pilot:0:row:002",
  status: "superseded",
  observedAt: "2026-08-05T17:03:30+09:00",
  retrievedAt: "2026-08-05T17:04:30+09:00",
  supersedesRecordId: initial.recordId,
});
const correction = documentRevision({ revisionSequence: 1 });
const correctionDiff = documentDiff();

{
  const earlyEvidence = initialDocumentEvidenceSnapshot();
  const issues = validateDocumentRevisionDiffAtCutoff(
    [initial, initialSuperseded, correction],
    [correctionDiff],
    documentRevisionDiffSchemas,
    earlyEvidence,
    documentKnownEntityIds,
  );
  assert.deepEqual(issues.filter((item) => item.severity === "error"), []);
  const snapshot = buildGovernedDocumentRevisionDiffSnapshot(
    [initial, initialSuperseded, correction],
    [correctionDiff],
    documentRevisionDiffSchemas,
    earlyEvidence,
    documentKnownEntityIds,
  );
  assert.deepEqual(snapshot.revisionIds, [initial.documentRevisionId]);
  assert.deepEqual(snapshot.diffIds, []);
  console.log("document-revision-diff-pit: correction excluded before cutoff OK");
}

{
  const laterEvidence = correctedDocumentEvidenceSnapshot();
  const snapshot = buildGovernedDocumentRevisionDiffSnapshot(
    [initial, initialSuperseded, correction],
    [correctionDiff],
    documentRevisionDiffSchemas,
    laterEvidence,
    documentKnownEntityIds,
  );
  assert.deepEqual(snapshot.revisionIds, [
    initial.documentRevisionId,
    correction.documentRevisionId,
  ]);
  assert.deepEqual(snapshot.diffIds, [correctionDiff.diffId]);
  console.log("document-revision-diff-pit: correction visible after cutoff OK");
}

{
  const issues = validateIncomingDocumentRevisionDiffCutoff(
    [initialSuperseded, correction],
    [correctionDiff],
    initialDocumentEvidenceSnapshot(),
  );
  assert.ok(issues.some((item) =>
    item.code === "incoming_document_revision_after_snapshot_cutoff",
  ));
  assert.ok(issues.some((item) =>
    item.code === "incoming_document_diff_after_snapshot_cutoff",
  ));
  console.log("document-revision-diff-pit: future append against old snapshot blocked OK");
}

console.log("document-revision-diff-pit: 全テスト成功");
