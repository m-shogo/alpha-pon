import assert from "node:assert/strict";
import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
  type EvidenceRecord,
  type EvidenceRecordInput,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  buildDocumentRevisionDiffSnapshot,
  claimEligibleDocumentChanges,
  validateDocumentRevisionDiffStore,
  validateDocumentRevisionRecord,
  withDocumentDiffHash,
  withDocumentRevisionHash,
  type DocumentDiffRecordInput,
  type DocumentRevisionDiffSchemas,
  type DocumentRevisionRecordInput,
} from "../../src/research/document-revision-diff.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: DocumentRevisionDiffSchemas = {
  revision: loadCouncilSchema("research/schemas/document-revision-record.schema.json"),
  diff: loadCouncilSchema("research/schemas/document-diff-record.schema.json"),
};
const knownEntityIds = new Set(["entity:issuer:document-fixture"]);

function evidence(
  overrides: Partial<EvidenceRecordInput> = {},
): EvidenceRecord {
  const evidenceId = overrides.evidenceId ?? "evidence:document:initial";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: overrides.entityIds ?? ["entity:issuer:document-fixture"],
    sourceId: overrides.sourceId ?? "source:document:company-ir",
    sourceType: overrides.sourceType ?? "company_ir",
    sourceLocator: overrides.sourceLocator ?? "https://example.com/document/initial",
    documentId: overrides.documentId ?? "document:fixture:earnings",
    sourceContentHash: overrides.sourceContentHash ?? "a".repeat(64),
    eventAtStatus: overrides.eventAtStatus ?? "known",
    eventAt: overrides.eventAt ?? "2026-08-05T14:00:00+09:00",
    publishedAt: overrides.publishedAt ?? "2026-08-05T15:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:01:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:02:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T15:00:00+09:00",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T09:00:00+09:00",
    evidenceTier: overrides.evidenceTier ?? "primary_company",
    status: overrides.status ?? "active",
    license: overrides.license ?? "metadata_only",
    storagePolicy: overrides.storagePolicy ?? "metadata_only",
    title: overrides.title ?? "Initial earnings release",
    summary: overrides.summary ?? "Initial document publication.",
    retrievalRunId: overrides.retrievalRunId ?? "retrieval-run-document",
    parserVersion: overrides.parserVersion ?? "evidence-parser-v1",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function revision(
  overrides: Partial<DocumentRevisionRecordInput> = {},
) {
  const sequence = overrides.revisionSequence ?? 0;
  const revisionId = overrides.documentRevisionId ?? `document-revision:fixture:${sequence}`;
  const isInitial = sequence === 0;
  const publishedAt = overrides.publishedAt ?? (isInitial
    ? "2026-08-05T15:00:00+09:00"
    : "2026-08-05T17:00:00+09:00");
  return withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${revisionId}:row:001`,
    documentRevisionId: revisionId,
    documentId: overrides.documentId ?? "document:fixture:earnings",
    entityIds: overrides.entityIds ?? ["entity:issuer:document-fixture"],
    evidenceId: overrides.evidenceId ?? (isInitial
      ? "evidence:document:initial"
      : "evidence:document:correction"),
    documentType: overrides.documentType ?? "earnings_release",
    revisionKind: overrides.revisionKind ?? (isInitial ? "initial" : "correction"),
    revisionSequence: sequence,
    status: overrides.status ?? "active",
    sourceContentHash: overrides.sourceContentHash ?? (isInitial
      ? "a".repeat(64)
      : "b".repeat(64)),
    normalizedStructureHash: overrides.normalizedStructureHash ?? (isInitial
      ? "c".repeat(64)
      : "d".repeat(64)),
    publishedAt,
    observedAt: overrides.observedAt ?? (isInitial
      ? "2026-08-05T15:03:00+09:00"
      : "2026-08-05T17:03:00+09:00"),
    retrievedAt: overrides.retrievedAt ?? (isInitial
      ? "2026-08-05T15:04:00+09:00"
      : "2026-08-05T17:04:00+09:00"),
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
      contentHash: isInitial ? "f".repeat(64) : "1".repeat(64),
    }],
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function diff(overrides: Partial<DocumentDiffRecordInput> = {}) {
  return withDocumentDiffHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "document-diff:fixture:0-1:row:001",
    diffId: overrides.diffId ?? "document-diff:fixture:0-1",
    documentId: overrides.documentId ?? "document:fixture:earnings",
    fromRevisionId: overrides.fromRevisionId ?? "document-revision:fixture:0",
    toRevisionId: overrides.toRevisionId ?? "document-revision:fixture:1",
    diffKind: overrides.diffKind ?? "correction",
    status: overrides.status ?? "active",
    observedAt: overrides.observedAt ?? "2026-08-05T17:05:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T17:06:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T17:05:00+09:00",
    reviewStatus: overrides.reviewStatus ?? "confirmed",
    sourceEvidenceIds: overrides.sourceEvidenceIds ?? ["evidence:document:correction"],
    changes: overrides.changes ?? [{
      path: "/summary",
      changeType: "modified",
      semanticType: "numeric",
      materiality: "binding",
      direction: "negative",
      beforeHash: "f".repeat(64),
      afterHash: "1".repeat(64),
      sourceEvidenceIds: ["evidence:document:correction"],
    }],
    parserVersion: overrides.parserVersion ?? "document-diff-parser-v1",
    ruleVersion: overrides.ruleVersion ?? "document-diff-v1",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

const initialEvidence = evidence();
const correctionEvidence = evidence({
  evidenceId: "evidence:document:correction",
  recordId: "evidence:document:correction:record:001",
  sourceLocator: "https://example.com/document/correction",
  sourceContentHash: "b".repeat(64),
  eventAt: "2026-08-05T16:55:00+09:00",
  publishedAt: "2026-08-05T17:00:00+09:00",
  observedAt: "2026-08-05T17:01:00+09:00",
  retrievedAt: "2026-08-05T17:02:00+09:00",
  effectiveFrom: "2026-08-05T17:00:00+09:00",
  title: "Corrected earnings release",
  summary: "Correction publication.",
});
const evidenceSnapshot = buildEvidenceSnapshot(
  [initialEvidence, correctionEvidence],
  [],
  "2026-08-06T10:00:00+09:00",
  "system_replay",
  "knowledge",
);

const initialActive = revision();
const initialSuperseded = revision({
  recordId: "document-revision:fixture:0:row:002",
  status: "superseded",
  observedAt: "2026-08-05T17:03:30+09:00",
  retrievedAt: "2026-08-05T17:04:30+09:00",
  supersedesRecordId: initialActive.recordId,
});
const correctionActive = revision({ revisionSequence: 1 });

{
  const issues = validateDocumentRevisionDiffStore(
    [initialActive, initialSuperseded, correctionActive],
    [diff()],
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  assert.deepEqual(issues.filter((item) => item.severity === "error"), []);
  const snapshot = buildDocumentRevisionDiffSnapshot(
    [initialActive, initialSuperseded, correctionActive],
    [diff()],
    evidenceSnapshot,
  );
  const changes = claimEligibleDocumentChanges(snapshot, evidenceSnapshot);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].materiality, "binding");
  console.log("document-revision-diff: confirmed correction snapshot OK");
}

{
  const unreviewed = diff({ reviewStatus: "auto_detected" });
  assert.ok(validateDocumentRevisionDiffStore(
    [initialActive, initialSuperseded, correctionActive],
    [unreviewed],
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).some((item) => item.code === "unreviewed_material_change"));
  console.log("document-revision-diff: unreviewed material change block OK");
}

{
  const secondaryEvidence = evidence({
    evidenceId: "evidence:document:news",
    recordId: "evidence:document:news:record:001",
    sourceType: "reliable_news",
    evidenceTier: "secondary_reliable",
    sourceContentHash: "9".repeat(64),
  });
  const secondarySnapshot = buildEvidenceSnapshot(
    [initialEvidence, correctionEvidence, secondaryEvidence],
    [],
    "2026-08-06T10:00:00+09:00",
    "system_replay",
    "knowledge",
  );
  const secondaryBinding = diff({
    sourceEvidenceIds: [correctionEvidence.evidenceId, secondaryEvidence.evidenceId],
    changes: [{
      path: "/summary",
      changeType: "modified",
      semanticType: "numeric",
      materiality: "binding",
      direction: "negative",
      beforeHash: "f".repeat(64),
      afterHash: "1".repeat(64),
      sourceEvidenceIds: [secondaryEvidence.evidenceId],
    }],
  });
  assert.ok(validateDocumentRevisionDiffStore(
    [initialActive, initialSuperseded, correctionActive],
    [secondaryBinding],
    schemas,
    secondarySnapshot,
    knownEntityIds,
  ).some((item) => item.code === "binding_change_requires_primary_evidence"));
  console.log("document-revision-diff: secondary Evidence binding block OK");
}

{
  const sequenceGap = revision({
    revisionSequence: 2,
    documentRevisionId: "document-revision:fixture:2",
    evidenceId: correctionEvidence.evidenceId,
    sourceContentHash: correctionEvidence.sourceContentHash,
    revisionKind: "correction",
  });
  assert.ok(validateDocumentRevisionDiffStore(
    [initialActive, initialSuperseded, sequenceGap],
    [],
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).some((item) => item.code === "document_revision_sequence_gap"));
  console.log("document-revision-diff: revision sequence gap block OK");
}

{
  const metadataEvidenceById = new Map([[initialEvidence.evidenceId, initialEvidence]]);
  const excessiveStorage = revision({ storagePolicy: "local_only_content" });
  assert.ok(validateDocumentRevisionRecord(
    excessiveStorage,
    schemas.revision,
    metadataEvidenceById,
    knownEntityIds,
  ).some((item) => item.code === "revision_storage_policy_exceeds_evidence"));
  console.log("document-revision-diff: storage policy escalation block OK");
}

{
  const invalidHashes = diff({
    changes: [{
      path: "/summary",
      changeType: "modified",
      semanticType: "numeric",
      materiality: "material",
      direction: "negative",
      beforeHash: "f".repeat(64),
      afterHash: "f".repeat(64),
      sourceEvidenceIds: [correctionEvidence.evidenceId],
    }],
  });
  assert.ok(validateDocumentRevisionDiffStore(
    [initialActive, initialSuperseded, correctionActive],
    [invalidHashes],
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).some((item) => item.code === "invalid_modified_change_hashes"));
  console.log("document-revision-diff: unchanged modified hash block OK");
}

{
  const evidenceById = new Map([[initialEvidence.evidenceId, initialEvidence]]);
  const reversedEffectiveWindow = revision({
    effectiveFrom: "2026-08-05T15:00:00.000000002+09:00",
    effectiveTo: "2026-08-05T15:00:00.000000001+09:00",
  });
  assert.ok(validateDocumentRevisionRecord(
    reversedEffectiveWindow,
    schemas.revision,
    evidenceById,
    knownEntityIds,
  ).some((item) => item.code === "invalid_revision_effective_period"));
  console.log("document-revision-diff: sub-ms effective period regression block OK");
}

{
  const subMsEvidence = evidence({
    publishedAt: "2026-08-05T15:00:00.000000002+09:00",
    observedAt: "2026-08-05T15:00:00.000000003+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000004+09:00",
    effectiveFrom: "2026-08-05T15:00:00.000000002+09:00",
  });
  const subMsRevision = revision({
    publishedAt: subMsEvidence.publishedAt,
    observedAt: "2026-08-05T15:00:00.000000001+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000005+09:00",
    effectiveFrom: subMsEvidence.effectiveFrom,
  });
  const issues = validateDocumentRevisionRecord(
    subMsRevision,
    schemas.revision,
    new Map([[subMsEvidence.evidenceId, subMsEvidence]]),
    knownEntityIds,
  );
  assert.ok(issues.some((item) => item.code === "revision_observed_before_published"));
  assert.ok(issues.some((item) => item.code === "revision_before_evidence_availability"));
  console.log("document-revision-diff: sub-ms publication and evidence chronology block OK");
}

console.log("document-revision-diff: 全テスト成功");
