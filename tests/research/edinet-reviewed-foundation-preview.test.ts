import assert from "node:assert/strict";
import {
  validateEvidenceRecord,
  validateEvidenceRelationRecord,
  type EvidenceStoreSchemas,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  validateDocumentRevisionRecord,
  type DocumentRevisionDiffSchemas,
} from "../../src/research/document-revision-diff.js";
import {
  buildReviewedEdinetFoundationPreview,
  type ReviewedEdinetFoundationInput,
} from "../../src/research/edinet-reviewed-foundation-preview.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const evidenceSchemas: EvidenceStoreSchemas = {
  evidence: loadCouncilSchema("research/schemas/evidence-record.schema.json"),
  relation: loadCouncilSchema("research/schemas/evidence-relation-record.schema.json"),
};
const documentSchemas: DocumentRevisionDiffSchemas = {
  revision: loadCouncilSchema("research/schemas/document-revision-record.schema.json"),
  diff: loadCouncilSchema("research/schemas/document-diff-record.schema.json"),
};
const knownEntities = new Set([
  "entity:issuer:sanrio",
  "entity:security:8136",
]);

function initialInput(
  overrides: Partial<ReviewedEdinetFoundationInput> = {},
): ReviewedEdinetFoundationInput {
  return {
    schemaVersion: 1,
    reviewId: "review:edinet:sanrio:initial",
    reviewedBy: "human:research-owner",
    reviewedByHuman: true,
    reviewedAt: "2026-08-06T14:00:00+09:00",
    semanticMappingStatus: "confirmed",
    docID: "S100INIT",
    chainRootDocID: "S100INIT",
    documentTypeCode: "1",
    entityIds: ["entity:issuer:sanrio", "entity:security:8136"],
    sourceContentHash: "a".repeat(64),
    title: "サンリオ有価証券報告書",
    summary: "人間がEDINET metadataと取得物を確認した初回提出書類。",
    publishedAt: "2026-06-20T15:00:00+09:00",
    observedAt: "2026-06-20T15:01:00+09:00",
    retrievedAt: "2026-06-20T15:02:00+09:00",
    effectiveFrom: "2026-06-20T15:00:00+09:00",
    firstExecutableAt: "2026-06-22T09:00:00+09:00",
    eventAtStatus: "not_applicable",
    retrievalRunId: "run:edinet:sanrio:initial",
    parserVersion: "edinet-parser-v1",
    normalizationVersion: "document-normalization-v1",
    normalizedStructureHash: "b".repeat(64),
    language: "ja",
    revisionKind: "initial",
    revisionSequence: 0,
    evidenceStatus: "active",
    documentRevisionStatus: "active",
    license: "local_only",
    storagePolicy: "local_only_content",
    sections: [{
      sectionId: "document-root",
      path: "/",
      ordinal: 0,
      titleHash: "c".repeat(64),
      contentHash: "d".repeat(64),
    }],
    ...overrides,
  };
}

function correctionInput(
  initial: ReturnType<typeof buildReviewedEdinetFoundationPreview>,
  overrides: Partial<ReviewedEdinetFoundationInput> = {},
): ReviewedEdinetFoundationInput {
  return initialInput({
    reviewId: "review:edinet:sanrio:correction",
    reviewedAt: "2026-07-01T16:00:00+09:00",
    docID: "S100CORR",
    chainRootDocID: "S100INIT",
    sourceContentHash: "e".repeat(64),
    title: "サンリオ訂正有価証券報告書",
    summary: "人間が親書類と訂正関係を確認した提出書類。",
    publishedAt: "2026-07-01T15:00:00+09:00",
    observedAt: "2026-07-01T15:01:00+09:00",
    retrievedAt: "2026-07-01T15:02:00+09:00",
    effectiveFrom: "2026-07-01T15:00:00+09:00",
    firstExecutableAt: "2026-07-02T09:00:00+09:00",
    retrievalRunId: "run:edinet:sanrio:correction",
    normalizedStructureHash: "f".repeat(64),
    revisionKind: "correction",
    revisionSequence: 1,
    sections: [{
      sectionId: "document-root",
      path: "/",
      ordinal: 0,
      titleHash: "1".repeat(64),
      contentHash: "2".repeat(64),
    }],
    prior: {
      evidenceId: initial.evidence.evidenceId,
      documentRevisionId: initial.documentRevision.documentRevisionId,
      documentRevisionRecordId: initial.documentRevision.recordId,
      relationType: "corrects",
      supersessionStrength: "binding",
    },
    ...overrides,
  });
}

{
  const preview = buildReviewedEdinetFoundationPreview(initialInput());
  assert.equal(preview.appendAuthorized, false);
  assert.equal(preview.relation, null);
  assert.equal(preview.evidence.sourceLocator, "edinet:document:s100init:type:1");
  assert.equal(preview.evidence.sourceLocator.includes("Subscription-Key"), false);
  assert.deepEqual(
    validateEvidenceRecord(
      preview.evidence,
      evidenceSchemas.evidence,
      knownEntities,
    ).filter(issue => issue.severity === "error"),
    [],
  );
  assert.deepEqual(
    validateDocumentRevisionRecord(
      preview.documentRevision,
      documentSchemas.revision,
      new Map([[preview.evidence.evidenceId, preview.evidence]]),
      knownEntities,
    ).filter(issue => issue.severity === "error"),
    [],
  );
  console.log("edinet-reviewed-preview: initial governed records OK");
}

{
  const initial = buildReviewedEdinetFoundationPreview(initialInput());
  const correctionInputValue = correctionInput(initial);
  const correction = buildReviewedEdinetFoundationPreview(correctionInputValue);
  const repeated = buildReviewedEdinetFoundationPreview(correctionInputValue);
  assert.ok(correction.relation);
  assert.equal(correction.evidence.contentHash, repeated.evidence.contentHash);
  assert.equal(correction.relation?.contentHash, repeated.relation?.contentHash);
  assert.equal(
    correction.documentRevision.contentHash,
    repeated.documentRevision.contentHash,
  );
  const evidenceById = new Map([
    [initial.evidence.evidenceId, initial.evidence],
    [correction.evidence.evidenceId, correction.evidence],
  ]);
  assert.deepEqual(
    validateEvidenceRecord(
      correction.evidence,
      evidenceSchemas.evidence,
      knownEntities,
    ).filter(issue => issue.severity === "error"),
    [],
  );
  assert.deepEqual(
    validateEvidenceRelationRecord(
      correction.relation!,
      evidenceSchemas.relation,
      evidenceById,
    ).filter(issue => issue.severity === "error"),
    [],
  );
  assert.deepEqual(
    validateDocumentRevisionRecord(
      correction.documentRevision,
      documentSchemas.revision,
      evidenceById,
      knownEntities,
    ).filter(issue => issue.severity === "error"),
    [],
  );
  assert.equal(
    correction.documentRevision.supersedesRecordId,
    initial.documentRevision.recordId,
  );
  console.log("edinet-reviewed-preview: correction deterministic preview OK");
}

{
  const notHuman = { ...initialInput(), reviewedByHuman: false } as unknown as ReviewedEdinetFoundationInput;
  assert.throws(
    () => buildReviewedEdinetFoundationPreview(notHuman),
    /human review is required/,
  );
  assert.throws(
    () => buildReviewedEdinetFoundationPreview(initialInput({
      semanticMappingStatus: "pending" as "confirmed",
    })),
    /semantic mapping must be confirmed/,
  );
  console.log("edinet-reviewed-preview: human confirmation gate OK");
}

{
  assert.throws(
    () => buildReviewedEdinetFoundationPreview(initialInput({
      firstExecutableAt: "2026-06-20T15:01:30+09:00",
    })),
    /firstExecutableAt must be at or after retrievedAt/,
  );
  assert.throws(
    () => buildReviewedEdinetFoundationPreview(initialInput({
      license: "metadata_only",
      storagePolicy: "local_only_content",
    })),
    /metadata_only license cannot store document content/,
  );
  assert.throws(
    () => buildReviewedEdinetFoundationPreview(initialInput({
      revisionKind: "correction",
      revisionSequence: 1,
    })),
    /requires reviewed prior references/,
  );
  console.log("edinet-reviewed-preview: PIT/license/prior fail-closed gates OK");
}

{
  const initial = buildReviewedEdinetFoundationPreview(initialInput());
  assert.throws(
    () => buildReviewedEdinetFoundationPreview(correctionInput(initial, {
      revisionKind: "withdrawal",
      evidenceStatus: "withdrawn",
      documentRevisionStatus: "withdrawn",
      prior: {
        evidenceId: initial.evidence.evidenceId,
        documentRevisionId: initial.documentRevision.documentRevisionId,
        documentRevisionRecordId: initial.documentRevision.recordId,
        relationType: "corrects",
        supersessionStrength: "binding",
      },
    })),
    /withdrawal requires retracts or invalidates relation/,
  );
  console.log("edinet-reviewed-preview: withdrawal semantics require explicit relation OK");
}
