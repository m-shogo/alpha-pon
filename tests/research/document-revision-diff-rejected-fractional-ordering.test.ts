import assert from "node:assert/strict";
import {
  withDocumentDiffHash,
  withDocumentRevisionHash,
  type DocumentDiffRecordInput,
  type DocumentRevisionRecordInput,
} from "../../src/research/document-revision-diff.js";
import { validateDocumentIdentityContinuity } from "../../src/research/document-revision-diff-integrity.js";

function revision(overrides: Partial<DocumentRevisionRecordInput> = {}) {
  return withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "revision-row-1",
    documentRevisionId: "revision-1",
    documentId: "document-1",
    entityIds: ["issuer-1"],
    evidenceId: "evidence-1",
    documentType: "statutory_filing",
    revisionKind: "initial",
    revisionSequence: 1,
    status: overrides.status ?? "active",
    sourceContentHash: "a".repeat(64),
    normalizedStructureHash: "b".repeat(64),
    publishedAt: "2026-08-06T05:00:00Z",
    observedAt: overrides.observedAt ?? "2026-08-06T05:00:00.000000000Z",
    retrievedAt: overrides.retrievedAt ?? "2026-08-06T05:00:00.000000000Z",
    effectiveFrom: "2026-08-06T05:00:00Z",
    language: "ja",
    storagePolicy: "metadata_only",
    parserVersion: "parser-v1",
    normalizationVersion: "normalization-v1",
    sections: [],
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

function diff(overrides: Partial<DocumentDiffRecordInput> = {}) {
  return withDocumentDiffHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "diff-row-1",
    diffId: "diff-1",
    documentId: "document-1",
    fromRevisionId: "revision-1",
    toRevisionId: "revision-2",
    diffKind: "correction",
    status: overrides.status ?? "active",
    observedAt: overrides.observedAt ?? "2026-08-06T05:00:00.000000000Z",
    retrievedAt: overrides.retrievedAt ?? "2026-08-06T05:00:00.000000000Z",
    effectiveFrom: "2026-08-06T05:00:00Z",
    reviewStatus: "confirmed",
    sourceEvidenceIds: ["evidence-1"],
    changes: [],
    parserVersion: "parser-v1",
    ruleVersion: "rule-v1",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

{
  const parent = revision();
  const rejected = revision({
    recordId: "revision-row-2",
    status: "rejected",
    observedAt: "2026-08-06T05:00:00.000000001Z",
    retrievedAt: "2026-08-06T05:00:00.000000001Z",
    supersedesRecordId: parent.recordId,
  });
  const issues = validateDocumentIdentityContinuity([parent, rejected], []);
  assert.ok(!issues.some((item) => item.code === "rejected_document_revision_time_regression"));
  console.log("document revision integrity: 1ns rejected revision advancement accepted OK");
}

{
  const parent = diff();
  const rejected = diff({
    recordId: "diff-row-2",
    status: "rejected",
    observedAt: "2026-08-06T05:00:00.000000001Z",
    retrievedAt: "2026-08-06T05:00:00.000000001Z",
    supersedesRecordId: parent.recordId,
  });
  const issues = validateDocumentIdentityContinuity([], [parent, rejected]);
  assert.ok(!issues.some((item) => item.code === "rejected_document_diff_time_regression"));
  console.log("document revision integrity: 1ns rejected diff advancement accepted OK");
}

console.log("document-revision-diff-rejected-fractional-ordering.test.ts passed");
