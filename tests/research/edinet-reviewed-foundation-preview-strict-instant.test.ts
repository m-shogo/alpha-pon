import assert from "node:assert/strict";
import {
  buildReviewedEdinetFoundationPreview,
  type ReviewedEdinetFoundationInput,
} from "../../src/research/edinet-reviewed-foundation-preview.js";

function validInput(
  overrides: Partial<ReviewedEdinetFoundationInput> = {},
): ReviewedEdinetFoundationInput {
  return {
    schemaVersion: 1,
    reviewId: "review:edinet:strict-instant",
    reviewedBy: "human:research-owner",
    reviewedByHuman: true,
    reviewedAt: "2026-08-06T14:00:00+09:00",
    semanticMappingStatus: "confirmed",
    docID: "S100TIME",
    chainRootDocID: "S100TIME",
    documentTypeCode: "1",
    entityIds: ["entity:issuer:sanrio", "entity:security:8136"],
    sourceContentHash: "a".repeat(64),
    title: "サンリオ有価証券報告書",
    summary: "strict instant direct API regression fixture",
    publishedAt: "2026-06-20T15:00:00+09:00",
    observedAt: "2026-06-20T15:01:00+09:00",
    retrievedAt: "2026-06-20T15:02:00+09:00",
    effectiveFrom: "2026-06-20T15:00:00+09:00",
    firstExecutableAt: "2026-06-22T09:00:00+09:00",
    eventAtStatus: "not_applicable",
    retrievalRunId: "run:edinet:strict-instant",
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

{
  const preview = buildReviewedEdinetFoundationPreview(validInput());
  assert.equal(preview.evidence.publishedAt, "2026-06-20T15:00:00+09:00");
  console.log("edinet-reviewed-preview-strict-instant: explicit offset remains valid OK");
}

assert.throws(
  () => buildReviewedEdinetFoundationPreview(validInput({
    reviewedAt: "2026-08-06T14:00:00",
  })),
  /explicit timezone/,
);

assert.throws(
  () => buildReviewedEdinetFoundationPreview(validInput({
    retrievedAt: "2026-02-31T15:02:00Z",
  })),
  /valid Gregorian ISO-8601 timestamp/,
);

assert.throws(
  () => buildReviewedEdinetFoundationPreview(validInput({
    firstExecutableAt: "2026-06-22T09:00:00+15:00",
  })),
  /timezone offset within ±14:00/,
);

assert.throws(
  () => buildReviewedEdinetFoundationPreview(validInput({
    eventAtStatus: "known",
    eventAt: "2026-06-20T15:00:00",
  })),
  /explicit timezone/,
);

console.log("edinet-reviewed-foundation-preview-strict-instant.test.ts passed");
