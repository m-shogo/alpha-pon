import assert from "node:assert/strict";
import {
  buildGovernedDocumentRevisionDiffSnapshot,
  validateDocumentRevisionDiffAtCutoff,
} from "../../src/research/document-revision-diff-governed.js";
import {
  correctedDocumentEvidenceSnapshot,
  documentKnownEntityIds,
  documentRevision,
  documentRevisionDiffSchemas,
  documentRevisionPilotRecords,
} from "./document-revision-diff-fixtures.js";

{
  const pilot = documentRevisionPilotRecords();
  const changedEntity = documentRevision({
    revisionSequence: 1,
    entityIds: ["entity:issuer:other"],
  });
  const known = new Set([...documentKnownEntityIds, "entity:issuer:other"]);
  const issues = validateDocumentRevisionDiffAtCutoff(
    [pilot.initial, pilot.initialSuperseded, changedEntity],
    [],
    documentRevisionDiffSchemas,
    correctedDocumentEvidenceSnapshot(),
    known,
  );
  assert.ok(issues.some((item) =>
    item.code === "document_entities_changed_across_revisions",
  ));
  console.log("document-revision-diff-integrity: entity continuity block OK");
}

{
  const pilot = documentRevisionPilotRecords();
  const changedType = documentRevision({
    revisionSequence: 1,
    documentType: "press_release",
  });
  const issues = validateDocumentRevisionDiffAtCutoff(
    [pilot.initial, pilot.initialSuperseded, changedType],
    [],
    documentRevisionDiffSchemas,
    correctedDocumentEvidenceSnapshot(),
    documentKnownEntityIds,
  );
  assert.ok(issues.some((item) =>
    item.code === "document_type_changed_across_revisions",
  ));
  console.log("document-revision-diff-integrity: document type continuity block OK");
}

{
  const pilot = documentRevisionPilotRecords();
  const rejected = documentRevision({
    recordId: "document-revision:document-pilot:rejected:row:001",
    documentRevisionId: "document-revision:document-pilot:rejected",
    revisionSequence: 2,
    status: "rejected",
    revisionKind: "correction",
    observedAt: "2026-08-05T18:01:00+09:00",
    retrievedAt: "2026-08-05T18:02:00+09:00",
    effectiveFrom: "2026-08-05T18:00:00+09:00",
  });
  const issues = validateDocumentRevisionDiffAtCutoff(
    [...pilot.revisions, rejected],
    pilot.diffs,
    documentRevisionDiffSchemas,
    correctedDocumentEvidenceSnapshot(),
    documentKnownEntityIds,
  );
  assert.deepEqual(issues.filter((item) => item.severity === "error"), []);
  const snapshot = buildGovernedDocumentRevisionDiffSnapshot(
    [...pilot.revisions, rejected],
    pilot.diffs,
    documentRevisionDiffSchemas,
    correctedDocumentEvidenceSnapshot(),
    documentKnownEntityIds,
  );
  assert.equal(snapshot.revisionIds.includes(rejected.documentRevisionId), false);
  console.log("document-revision-diff-integrity: rejected row excluded from snapshot OK");
}

{
  const pilot = documentRevisionPilotRecords();
  const rejectedMutation = documentRevision({
    recordId: "document-revision:document-pilot:0:row:rejected",
    documentRevisionId: pilot.initial.documentRevisionId,
    revisionSequence: 0,
    revisionKind: "initial",
    status: "rejected",
    evidenceId: "evidence:document-pilot:correction",
    sourceContentHash: "b".repeat(64),
    publishedAt: "2026-08-05T17:00:00+09:00",
    observedAt: "2026-08-05T18:01:00+09:00",
    retrievedAt: "2026-08-05T18:02:00+09:00",
    effectiveFrom: "2026-08-05T17:00:00+09:00",
    supersedesRecordId: pilot.initial.recordId,
  });
  const issues = validateDocumentRevisionDiffAtCutoff(
    [pilot.initial, rejectedMutation],
    [],
    documentRevisionDiffSchemas,
    correctedDocumentEvidenceSnapshot(),
    documentKnownEntityIds,
  );
  assert.ok(issues.some((item) =>
    item.code === "rejected_document_revision_identity_mismatch",
  ));
  console.log("document-revision-diff-integrity: rejected identity mutation block OK");
}

console.log("document-revision-diff-integrity: 全テスト成功");
