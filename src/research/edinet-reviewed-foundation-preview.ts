import { createHash } from "node:crypto";
import {
  withEvidenceRecordHash,
  withEvidenceRelationHash,
  type EvidenceLicense,
  type EvidenceRecord,
  type EvidenceRelationRecord,
  type EvidenceRelationType,
  type EvidenceStatus,
  type EvidenceStoragePolicy,
} from "./bitemporal-evidence-store.js";
import {
  withDocumentRevisionHash,
  type DocumentRevisionKind,
  type DocumentRevisionRecord,
  type DocumentRevisionStatus,
  type DocumentSectionHash,
} from "./document-revision-diff.js";

export type ReviewedEdinetPriorReference = {
  evidenceId: string;
  documentRevisionId: string;
  documentRevisionRecordId: string;
  relationType: Extract<
    EvidenceRelationType,
    "corrects" | "retracts" | "supersedes" | "invalidates"
  >;
  supersessionStrength: "partial" | "binding";
};

export type ReviewedEdinetFoundationInput = {
  schemaVersion: 1;
  reviewId: string;
  reviewedBy: string;
  reviewedByHuman: true;
  reviewedAt: string;
  semanticMappingStatus: "confirmed";
  docID: string;
  chainRootDocID: string;
  documentTypeCode: string;
  entityIds: string[];
  sourceContentHash: string;
  title: string;
  summary: string;
  publishedAt: string;
  observedAt: string;
  retrievedAt: string;
  effectiveFrom: string;
  firstExecutableAt: string;
  eventAtStatus: "known" | "unknown" | "not_applicable";
  eventAt?: string;
  retrievalRunId: string;
  parserVersion: string;
  normalizationVersion: string;
  normalizedStructureHash: string;
  language: string;
  revisionKind: DocumentRevisionKind;
  revisionSequence: number;
  evidenceStatus: EvidenceStatus;
  documentRevisionStatus: DocumentRevisionStatus;
  license: Extract<EvidenceLicense, "metadata_only" | "local_only">;
  storagePolicy: Extract<
    EvidenceStoragePolicy,
    "metadata_only" | "hash_only" | "local_only_content"
  >;
  sections: DocumentSectionHash[];
  prior?: ReviewedEdinetPriorReference;
};

export type ReviewedEdinetFoundationPreview = {
  schemaVersion: 1;
  source: "edinet";
  reviewId: string;
  appendAuthorized: false;
  evidence: EvidenceRecord;
  relation: EvidenceRelationRecord | null;
  documentRevision: DocumentRevisionRecord;
  priorDocumentRevisionId: string | null;
};

const ID_PATTERN = /^[a-z][a-z0-9:_-]+$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const INITIAL_KINDS = new Set<DocumentRevisionKind>(["initial"]);
const REVISION_KINDS = new Set<DocumentRevisionKind>([
  "amendment",
  "correction",
  "restatement",
  "replacement",
  "withdrawal",
  "periodic_update",
]);

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDateTime(value: string, field: string): number {
  const parsed = Date.parse(value);
  assertCondition(Number.isFinite(parsed), `${field} must be an ISO date-time`);
  return parsed;
}

function assertHash(value: string, field: string): void {
  assertCondition(HASH_PATTERN.test(value), `${field} must be a lowercase SHA-256 hash`);
}

function assertId(value: string, field: string): void {
  assertCondition(ID_PATTERN.test(value), `${field} has an invalid governed ID`);
}

function slugFromEdinetId(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  assertCondition(/^[a-z0-9_-]{4,64}$/.test(normalized), `${field} is invalid`);
  return normalized;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function uniqueSortedIds(values: string[]): string[] {
  assertCondition(values.length > 0, "entityIds must not be empty");
  const result = [...new Set(values)].sort();
  assertCondition(result.length === values.length, "entityIds must be unique");
  for (const value of result) assertId(value, "entityIds");
  return result;
}

function validateTimeBoundary(input: ReviewedEdinetFoundationInput): void {
  const publishedAt = assertDateTime(input.publishedAt, "publishedAt");
  const observedAt = assertDateTime(input.observedAt, "observedAt");
  const retrievedAt = assertDateTime(input.retrievedAt, "retrievedAt");
  const effectiveFrom = assertDateTime(input.effectiveFrom, "effectiveFrom");
  const firstExecutableAt = assertDateTime(input.firstExecutableAt, "firstExecutableAt");
  const reviewedAt = assertDateTime(input.reviewedAt, "reviewedAt");

  assertCondition(observedAt >= publishedAt, "observedAt must be at or after publishedAt");
  assertCondition(retrievedAt >= observedAt, "retrievedAt must be at or after observedAt");
  assertCondition(firstExecutableAt >= retrievedAt, "firstExecutableAt must be at or after retrievedAt");
  assertCondition(reviewedAt >= retrievedAt, "reviewedAt must be at or after retrievedAt");
  assertCondition(effectiveFrom >= publishedAt, "effectiveFrom must be at or after publishedAt");

  if (input.eventAtStatus === "known") {
    assertCondition(typeof input.eventAt === "string", "known eventAtStatus requires eventAt");
    assertDateTime(input.eventAt, "eventAt");
  } else {
    assertCondition(input.eventAt === undefined, `${input.eventAtStatus} must not include eventAt`);
  }
}

function validateReviewBoundary(input: ReviewedEdinetFoundationInput): void {
  assertCondition(input.schemaVersion === 1, "unsupported review schemaVersion");
  assertCondition(input.reviewedByHuman === true, "human review is required");
  assertCondition(input.semanticMappingStatus === "confirmed", "semantic mapping must be confirmed");
  assertCondition(input.reviewId.trim().length >= 3, "reviewId is required");
  assertCondition(input.reviewedBy.trim().length >= 2, "reviewedBy is required");
  assertCondition(input.title.trim().length > 0, "title is required");
  assertCondition(input.summary.trim().length >= 3, "summary is required");
  assertCondition(input.retrievalRunId.trim().length > 0, "retrievalRunId is required");
  assertCondition(input.parserVersion.trim().length > 0, "parserVersion is required");
  assertCondition(input.normalizationVersion.trim().length > 0, "normalizationVersion is required");
  assertCondition(input.language.trim().length >= 2, "language is required");
  assertCondition(/^[1-5]$/.test(input.documentTypeCode), "documentTypeCode must be explicit and valid");
  assertHash(input.sourceContentHash, "sourceContentHash");
  assertHash(input.normalizedStructureHash, "normalizedStructureHash");

  assertCondition(Number.isInteger(input.revisionSequence), "revisionSequence must be an integer");
  assertCondition(input.revisionSequence >= 0, "revisionSequence must be non-negative");
  assertCondition(input.sections.length > 0, "reviewed normalized sections are required");
  for (const section of input.sections) {
    assertCondition(/^[a-z0-9:_-]+$/.test(section.sectionId), "sectionId is invalid");
    assertCondition(section.path.trim().length > 0, "section path is required");
    assertCondition(Number.isInteger(section.ordinal) && section.ordinal >= 0, "section ordinal is invalid");
    assertHash(section.titleHash, "section.titleHash");
    assertHash(section.contentHash, "section.contentHash");
  }

  if (input.license === "metadata_only") {
    assertCondition(
      input.storagePolicy === "metadata_only" || input.storagePolicy === "hash_only",
      "metadata_only license cannot store document content",
    );
  }
  if (input.license === "local_only") {
    assertCondition(
      input.storagePolicy !== "metadata_only",
      "local_only license requires hash_only or local_only_content",
    );
  }

  const isInitial = INITIAL_KINDS.has(input.revisionKind);
  assertCondition(isInitial || REVISION_KINDS.has(input.revisionKind), "unsupported revisionKind");
  if (isInitial) {
    assertCondition(input.revisionSequence === 0, "initial revisionSequence must be 0");
    assertCondition(input.prior === undefined, "initial revision must not include prior");
  } else {
    assertCondition(input.revisionSequence > 0, "non-initial revisionSequence must be positive");
    assertCondition(input.prior !== undefined, "non-initial revision requires reviewed prior references");
  }

  if (input.revisionKind === "withdrawal") {
    assertCondition(input.evidenceStatus === "withdrawn", "withdrawal Evidence status must be withdrawn");
    assertCondition(
      input.documentRevisionStatus === "withdrawn",
      "withdrawal Document Revision status must be withdrawn",
    );
    assertCondition(
      input.prior?.relationType === "retracts" || input.prior?.relationType === "invalidates",
      "withdrawal requires retracts or invalidates relation",
    );
  } else {
    assertCondition(input.evidenceStatus === "active", "non-withdrawal Evidence must be active");
    assertCondition(input.documentRevisionStatus === "active", "non-withdrawal revision must be active");
  }

  if (input.prior) {
    assertId(input.prior.evidenceId, "prior.evidenceId");
    assertId(input.prior.documentRevisionId, "prior.documentRevisionId");
    assertCondition(
      input.prior.documentRevisionRecordId.trim().length >= 3,
      "prior.documentRevisionRecordId is required",
    );
    assertCondition(input.prior.evidenceId !== `evidence:edinet:${input.docID.toLowerCase()}`, "prior Evidence must differ");
  }

  validateTimeBoundary(input);
}

export function buildReviewedEdinetFoundationPreview(
  input: ReviewedEdinetFoundationInput,
): ReviewedEdinetFoundationPreview {
  validateReviewBoundary(input);

  const docSlug = slugFromEdinetId(input.docID, "docID");
  const rootSlug = slugFromEdinetId(input.chainRootDocID, "chainRootDocID");
  const entityIds = uniqueSortedIds(input.entityIds);
  const evidenceId = `evidence:edinet:${docSlug}`;
  const documentId = `document:edinet:${rootSlug}`;
  const documentRevisionId = `document-revision:edinet:${docSlug}`;
  const sourceLocator = `edinet:document:${docSlug}:type:${input.documentTypeCode}`;
  const recordSuffix = input.sourceContentHash.slice(0, 12);

  const evidence = withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: `${evidenceId}:record:${recordSuffix}`,
    evidenceId,
    entityIds,
    sourceId: "edinet",
    sourceType: "statutory_filing",
    sourceLocator,
    documentId,
    sourceContentHash: input.sourceContentHash,
    eventAtStatus: input.eventAtStatus,
    ...(input.eventAtStatus === "known" ? { eventAt: input.eventAt } : {}),
    publishedAt: input.publishedAt,
    observedAt: input.observedAt,
    retrievedAt: input.retrievedAt,
    effectiveFrom: input.effectiveFrom,
    firstExecutableAt: input.firstExecutableAt,
    evidenceTier: "primary_authoritative",
    status: input.evidenceStatus,
    license: input.license,
    storagePolicy: input.storagePolicy,
    title: input.title.trim(),
    summary: input.summary.trim(),
    retrievalRunId: input.retrievalRunId,
    parserVersion: input.parserVersion,
  });

  const relation = input.prior
    ? withEvidenceRelationHash({
        schemaVersion: 1,
        recordId: `relation:edinet:${docSlug}:${shortHash(input.prior.evidenceId)}:record:001`,
        relationId: `relation:edinet:${docSlug}:${input.prior.relationType}:${shortHash(input.prior.evidenceId)}`,
        relationType: input.prior.relationType,
        fromEvidenceId: evidenceId,
        toEvidenceId: input.prior.evidenceId,
        effectiveFrom: input.effectiveFrom,
        observedAt: input.observedAt,
        retrievedAt: input.retrievedAt,
        sourceRefs: [evidenceId],
        supersessionStrength: input.prior.supersessionStrength,
      })
    : null;

  const documentRevision = withDocumentRevisionHash({
    schemaVersion: 1,
    recordId: `${documentRevisionId}:record:${recordSuffix}`,
    documentRevisionId,
    documentId,
    entityIds,
    evidenceId,
    documentType: "statutory_filing",
    revisionKind: input.revisionKind,
    revisionSequence: input.revisionSequence,
    status: input.documentRevisionStatus,
    sourceContentHash: input.sourceContentHash,
    normalizedStructureHash: input.normalizedStructureHash,
    publishedAt: input.publishedAt,
    observedAt: input.observedAt,
    retrievedAt: input.retrievedAt,
    effectiveFrom: input.effectiveFrom,
    language: input.language,
    storagePolicy: input.storagePolicy,
    parserVersion: input.parserVersion,
    normalizationVersion: input.normalizationVersion,
    sections: [...input.sections].sort((a, b) => a.ordinal - b.ordinal),
    ...(input.prior
      ? { supersedesRecordId: input.prior.documentRevisionRecordId }
      : {}),
  });

  return {
    schemaVersion: 1,
    source: "edinet",
    reviewId: input.reviewId,
    appendAuthorized: false,
    evidence,
    relation,
    documentRevision,
    priorDocumentRevisionId: input.prior?.documentRevisionId ?? null,
  };
}
