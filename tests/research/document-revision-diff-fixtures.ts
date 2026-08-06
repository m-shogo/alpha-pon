import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
  type EvidenceRecord,
  type EvidenceRecordInput,
  type EvidenceSnapshot,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  withDocumentDiffHash,
  withDocumentRevisionHash,
  type DocumentDiffRecordInput,
  type DocumentRevisionDiffSchemas,
  type DocumentRevisionRecordInput,
} from "../../src/research/document-revision-diff.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

export const documentRevisionDiffSchemas: DocumentRevisionDiffSchemas = {
  revision: loadCouncilSchema("research/schemas/document-revision-record.schema.json"),
  diff: loadCouncilSchema("research/schemas/document-diff-record.schema.json"),
};

export const documentKnownEntityIds = new Set(["entity:issuer:document-pilot"]);

export function documentEvidence(
  overrides: Partial<EvidenceRecordInput> = {},
): EvidenceRecord {
  const evidenceId = overrides.evidenceId ?? "evidence:document-pilot:initial";
  const correction = evidenceId.includes("correction");
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: overrides.entityIds ?? ["entity:issuer:document-pilot"],
    sourceId: overrides.sourceId ?? "source:document-pilot:ir",
    sourceType: overrides.sourceType ?? "company_ir",
    sourceLocator: overrides.sourceLocator ?? (correction
      ? "https://example.com/document-pilot/correction"
      : "https://example.com/document-pilot/initial"),
    documentId: overrides.documentId ?? "document:document-pilot:earnings",
    sourceContentHash: overrides.sourceContentHash ?? (correction
      ? "b".repeat(64)
      : "a".repeat(64)),
    eventAtStatus: overrides.eventAtStatus ?? "known",
    eventAt: overrides.eventAt ?? (correction
      ? "2026-08-05T16:55:00+09:00"
      : "2026-08-05T14:00:00+09:00"),
    publishedAt: overrides.publishedAt ?? (correction
      ? "2026-08-05T17:00:00+09:00"
      : "2026-08-05T15:00:00+09:00"),
    observedAt: overrides.observedAt ?? (correction
      ? "2026-08-05T17:01:00+09:00"
      : "2026-08-05T15:01:00+09:00"),
    retrievedAt: overrides.retrievedAt ?? (correction
      ? "2026-08-05T17:02:00+09:00"
      : "2026-08-05T15:02:00+09:00"),
    effectiveFrom: overrides.effectiveFrom ?? (correction
      ? "2026-08-05T17:00:00+09:00"
      : "2026-08-05T15:00:00+09:00"),
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T09:00:00+09:00",
    evidenceTier: overrides.evidenceTier ?? "primary_company",
    status: overrides.status ?? "active",
    license: overrides.license ?? "metadata_only",
    storagePolicy: overrides.storagePolicy ?? "metadata_only",
    title: overrides.title ?? (correction
      ? "Corrected pilot earnings release"
      : "Initial pilot earnings release"),
    summary: overrides.summary ?? (correction
      ? "Correction publication."
      : "Initial publication."),
    retrievalRunId: overrides.retrievalRunId ?? "retrieval-run-document-pilot",
    parserVersion: overrides.parserVersion ?? "evidence-parser-v1",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

export function documentRevision(
  overrides: Partial<DocumentRevisionRecordInput> = {},
) {
  const sequence = overrides.revisionSequence ?? 0;
  const correction = sequence > 0;
  const revisionId = overrides.documentRevisionId ??
    `document-revision:document-pilot:${sequence}`;
  const publishedAt = overrides.publishedAt ?? (correction
    ? "2026-08-05T17:00:00+09:00"
    : "2026-08-05T15:00:00+09:00");
  return withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${revisionId}:row:001`,
    documentRevisionId: revisionId,
    documentId: overrides.documentId ?? "document:document-pilot:earnings",
    entityIds: overrides.entityIds ?? ["entity:issuer:document-pilot"],
    evidenceId: overrides.evidenceId ?? (correction
      ? "evidence:document-pilot:correction"
      : "evidence:document-pilot:initial"),
    documentType: overrides.documentType ?? "earnings_release",
    revisionKind: overrides.revisionKind ?? (correction ? "correction" : "initial"),
    revisionSequence: sequence,
    status: overrides.status ?? "active",
    sourceContentHash: overrides.sourceContentHash ?? (correction
      ? "b".repeat(64)
      : "a".repeat(64)),
    normalizedStructureHash: overrides.normalizedStructureHash ?? (correction
      ? "d".repeat(64)
      : "c".repeat(64)),
    publishedAt,
    observedAt: overrides.observedAt ?? (correction
      ? "2026-08-05T17:03:00+09:00"
      : "2026-08-05T15:03:00+09:00"),
    retrievedAt: overrides.retrievedAt ?? (correction
      ? "2026-08-05T17:04:00+09:00"
      : "2026-08-05T15:04:00+09:00"),
    effectiveFrom: overrides.effectiveFrom ?? publishedAt,
    language: overrides.language ?? "ja",
    storagePolicy: overrides.storagePolicy ?? "metadata_only",
    parserVersion: overrides.parserVersion ?? "document-parser-v1",
    normalizationVersion: overrides.normalizationVersion ?? "normalization-v1",
    sections: overrides.sections ?? [{
      sectionId: "summary",
      path: "/summary",
      ordinal: 0,
      titleHash: "e".repeat(64),
      contentHash: correction ? "1".repeat(64) : "f".repeat(64),
    }],
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

export function documentDiff(
  overrides: Partial<DocumentDiffRecordInput> = {},
) {
  return withDocumentDiffHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "document-diff:document-pilot:0-1:row:001",
    diffId: overrides.diffId ?? "document-diff:document-pilot:0-1",
    documentId: overrides.documentId ?? "document:document-pilot:earnings",
    fromRevisionId: overrides.fromRevisionId ?? "document-revision:document-pilot:0",
    toRevisionId: overrides.toRevisionId ?? "document-revision:document-pilot:1",
    diffKind: overrides.diffKind ?? "correction",
    status: overrides.status ?? "active",
    observedAt: overrides.observedAt ?? "2026-08-05T17:05:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T17:06:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T17:05:00+09:00",
    reviewStatus: overrides.reviewStatus ?? "confirmed",
    sourceEvidenceIds: overrides.sourceEvidenceIds ?? ["evidence:document-pilot:correction"],
    changes: overrides.changes ?? [{
      path: "/summary",
      changeType: "modified",
      semanticType: "numeric",
      materiality: "binding",
      direction: "negative",
      beforeHash: "f".repeat(64),
      afterHash: "1".repeat(64),
      sourceEvidenceIds: ["evidence:document-pilot:correction"],
    }],
    parserVersion: overrides.parserVersion ?? "document-diff-parser-v1",
    ruleVersion: overrides.ruleVersion ?? "document-diff-v1",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

export function initialDocumentEvidenceSnapshot(): EvidenceSnapshot {
  return buildEvidenceSnapshot(
    [documentEvidence()],
    [],
    "2026-08-05T16:00:00+09:00",
    "system_replay",
    "knowledge",
  );
}

export function correctedDocumentEvidenceSnapshot(): EvidenceSnapshot {
  return buildEvidenceSnapshot(
    [
      documentEvidence(),
      documentEvidence({ evidenceId: "evidence:document-pilot:correction" }),
    ],
    [],
    "2026-08-06T10:00:00+09:00",
    "system_replay",
    "knowledge",
  );
}

export function documentRevisionPilotRecords() {
  const initial = documentRevision();
  const initialSuperseded = documentRevision({
    recordId: "document-revision:document-pilot:0:row:002",
    status: "superseded",
    observedAt: "2026-08-05T17:03:30+09:00",
    retrievedAt: "2026-08-05T17:04:30+09:00",
    supersedesRecordId: initial.recordId,
  });
  const correction = documentRevision({ revisionSequence: 1 });
  return {
    initial,
    initialSuperseded,
    correction,
    revisions: [initial, initialSuperseded, correction],
    diffs: [documentDiff()],
  };
}
