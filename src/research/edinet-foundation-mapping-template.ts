import { createHash } from "node:crypto";
import {
  buildReviewedEdinetFoundationPreview,
  type ReviewedEdinetFoundationInput,
  type ReviewedEdinetFoundationPreview,
  type ReviewedEdinetPriorReference,
} from "./edinet-reviewed-foundation-preview.js";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

type JsonObject = Record<string, unknown>;

type SourceImpactCandidate = {
  candidateId: string;
  sourceCandidateHash: string;
  fromDocID: string;
  toDocID: string;
  logicalRoleKey: string;
  path: string;
  afterTextHash: string | null;
};

export type EdinetFoundationMappingSection = {
  candidateId: string;
  sourceCandidateHash: string;
  logicalRoleKey: string;
  path: string;
  sourceContentHash: string | null;
  sectionId: string;
  ordinal: number | null;
  titleHash: string;
};

export type EdinetFoundationMappingFields = {
  reviewId: string;
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
  eventAtStatus: "pending_human_review" | "known" | "unknown" | "not_applicable";
  eventAt: string | null;
  retrievalRunId: string;
  parserVersion: string;
  normalizationVersion: string;
  normalizedStructureHash: string;
  language: string;
  revisionKind:
    | "pending_human_review"
    | "initial"
    | "amendment"
    | "correction"
    | "restatement"
    | "replacement"
    | "withdrawal"
    | "periodic_update";
  revisionSequence: number | null;
  evidenceStatus:
    | "pending_human_review"
    | "active"
    | "corrected"
    | "retracted"
    | "withdrawn"
    | "expired";
  documentRevisionStatus:
    | "pending_human_review"
    | "active"
    | "superseded"
    | "withdrawn"
    | "rejected";
  license: "pending_human_review" | "metadata_only" | "local_only";
  storagePolicy:
    | "pending_human_review"
    | "metadata_only"
    | "hash_only"
    | "local_only_content";
  prior: ReviewedEdinetPriorReference | null;
  sections: EdinetFoundationMappingSection[];
};

export type EdinetFoundationMappingDraft = {
  mappingId: string;
  docID: string;
  sourceCandidateIds: string[];
  sourceCandidateHashes: string[];
  sourceAfterTextHashes: Array<string | null>;
  suggestedRevisionKind: "correction";
  suggestedDocumentTypeCode: "1";
  fields: EdinetFoundationMappingFields;
  mappingComplete: boolean;
  mappingHash: string;
};

export type EdinetFoundationMappingTemplate = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceImpactReviewFile: string;
  sourceImpactReviewHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string | null;
  reviewStatus: "draft_human_input";
  mappingCount: number;
  mappings: EdinetFoundationMappingDraft[];
  foundationPreviewEligible: false;
  appendAuthorized: false;
  blockers: string[];
  recordHash: string;
};

export type EdinetFoundationPreviewFinal = {
  schemaVersion: 1;
  source: "edinet";
  issuer: EdinetFoundationMappingTemplate["issuer"];
  sourceImpactReviewFile: string;
  sourceImpactReviewHash: string;
  sourceMappingInputFile: string;
  sourceMappingInputHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string;
  reviewStatus: "complete_foundation_preview";
  previewCount: number;
  previews: ReviewedEdinetFoundationPreview[];
  foundationPreviewEligible: false;
  previewGenerated: true;
  appendAuthorized: false;
  blockers: string[];
  recordHash: string;
};

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = str(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function nullableHash(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireHash(value, field);
}

function requireDocID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function strings(value: unknown, field: string): string[] {
  return arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function verifyImpactReview(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("impactReview schema/source is unsupported");
  }
  if (
    record.reviewStatus !== "complete_human_review"
    || record.appendAuthorized !== false
    || record.foundationPreviewEligible !== false
  ) {
    throw new Error("impactReview must be complete, human-reviewed, and non-appendable");
  }
  const issuer = obj(record.issuer, "impactReview.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("impactReview issuer is not Sanrio");
  }
  const expected = requireHash(record.recordHash, "impactReview.recordHash");
  const { recordHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("impactReview.recordHash mismatch");
  const candidateCount = nonNegativeInteger(record.candidateCount, "impactReview.candidateCount");
  const completedCount = nonNegativeInteger(record.completedCandidateCount, "impactReview.completedCandidateCount");
  if (candidateCount === 0 || completedCount !== candidateCount) {
    throw new Error("impactReview candidates are not fully completed");
  }
  return expected;
}

function sourceCandidates(record: JsonObject): SourceImpactCandidate[] {
  const results = arr(record.candidates, "impactReview.candidates").map((value, index) => {
    const candidate = obj(value, `impactReview.candidates[${index}]`);
    if (candidate.completed !== true) throw new Error(`impactReview.candidates[${index}] is incomplete`);
    const candidateId = required(candidate.candidateId, `impactReview.candidates[${index}].candidateId`);
    const sourceCandidateHash = requireHash(
      candidate.sourceCandidateHash,
      `impactReview.candidates[${index}].sourceCandidateHash`,
    );
    const decisionHash = requireHash(candidate.decisionHash, `impactReview.candidates[${index}].decisionHash`);
    const { decisionHash: _ignored, ...withoutDecisionHash } = candidate;
    if (digest(withoutDecisionHash) !== decisionHash) {
      throw new Error(`impactReview.candidates[${index}].decisionHash mismatch`);
    }
    return {
      candidateId,
      sourceCandidateHash,
      fromDocID: requireDocID(candidate.fromDocID, `impactReview.candidates[${index}].fromDocID`),
      toDocID: requireDocID(candidate.toDocID, `impactReview.candidates[${index}].toDocID`),
      logicalRoleKey: required(
        candidate.logicalRoleKey,
        `impactReview.candidates[${index}].logicalRoleKey`,
      ),
      path: required(candidate.path, `impactReview.candidates[${index}].path`),
      afterTextHash: nullableHash(
        candidate.afterTextHash,
        `impactReview.candidates[${index}].afterTextHash`,
      ),
    };
  });
  const ids = new Set<string>();
  for (const candidate of results) {
    if (ids.has(candidate.candidateId)) throw new Error(`duplicate impact candidate ${candidate.candidateId}`);
    ids.add(candidate.candidateId);
  }
  return results.sort((left, right) => `${left.toDocID}|${left.path}|${left.candidateId}`.localeCompare(
    `${right.toDocID}|${right.path}|${right.candidateId}`,
  ));
}

function emptyFields(input: {
  docID: string;
  impactHash: string;
  candidates: SourceImpactCandidate[];
}): EdinetFoundationMappingFields {
  return {
    reviewId: `edinet-foundation:${input.docID.toLowerCase()}:${input.impactHash.slice(0, 12)}`,
    chainRootDocID: "",
    documentTypeCode: "",
    entityIds: [],
    sourceContentHash: "",
    title: "",
    summary: "",
    publishedAt: "",
    observedAt: "",
    retrievedAt: "",
    effectiveFrom: "",
    firstExecutableAt: "",
    eventAtStatus: "pending_human_review",
    eventAt: null,
    retrievalRunId: "",
    parserVersion: "",
    normalizationVersion: "",
    normalizedStructureHash: "",
    language: "ja",
    revisionKind: "pending_human_review",
    revisionSequence: null,
    evidenceStatus: "pending_human_review",
    documentRevisionStatus: "pending_human_review",
    license: "pending_human_review",
    storagePolicy: "pending_human_review",
    prior: null,
    sections: input.candidates.map((candidate, ordinal) => ({
      candidateId: candidate.candidateId,
      sourceCandidateHash: candidate.sourceCandidateHash,
      logicalRoleKey: candidate.logicalRoleKey,
      path: candidate.path,
      sourceContentHash: candidate.afterTextHash,
      sectionId: "",
      ordinal,
      titleHash: "",
    })),
  };
}

function mappingHashPayload(mapping: Omit<EdinetFoundationMappingDraft, "mappingHash">): unknown {
  return mapping;
}

export function buildEdinetFoundationMappingTemplate(input: {
  impactReview: unknown;
  sourceImpactReviewFile: string;
  generatedAt?: string;
}): EdinetFoundationMappingTemplate {
  const impact = obj(input.impactReview, "impactReview");
  const sourceImpactReviewHash = verifyImpactReview(impact);
  const sourceImpactReviewFile = localJsonBasename(input.sourceImpactReviewFile, "sourceImpactReviewFile");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const grouped = new Map<string, SourceImpactCandidate[]>();
  for (const candidate of sourceCandidates(impact)) {
    const current = grouped.get(candidate.toDocID) ?? [];
    current.push(candidate);
    grouped.set(candidate.toDocID, current);
  }
  if (grouped.size === 0) throw new Error("impactReview has no candidates to map");

  const mappings = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([docID, candidates]) => {
      const base: Omit<EdinetFoundationMappingDraft, "mappingHash"> = {
        mappingId: `edinet-foundation-mapping:${digest({ docID, candidates: candidates.map(item => item.candidateId) }).slice(0, 20)}`,
        docID,
        sourceCandidateIds: candidates.map(candidate => candidate.candidateId),
        sourceCandidateHashes: candidates.map(candidate => candidate.sourceCandidateHash),
        sourceAfterTextHashes: candidates.map(candidate => candidate.afterTextHash),
        suggestedRevisionKind: "correction",
        suggestedDocumentTypeCode: "1",
        fields: emptyFields({ docID, impactHash: sourceImpactReviewHash, candidates }),
        mappingComplete: false,
      };
      return { ...base, mappingHash: digest(mappingHashPayload(base)) };
    },
  );
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceImpactReviewFile,
    sourceImpactReviewHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    reviewStatus: "draft_human_input" as const,
    mappingCount: mappings.length,
    mappings,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
    blockers: [
      "security_master_entity_ids_required",
      "published_observed_retrieved_effective_first_executable_times_required",
      "source_document_content_hash_required",
      "normalized_structure_and_section_title_hashes_required",
      "revision_sequence_and_prior_relation_required_for_corrections",
      "license_and_storage_policy_required",
      "human_semantic_mapping_confirmation_required",
      "foundation_store_append_not_authorized",
    ].sort(),
  };
  return { ...base, recordHash: digest(base) };
}

function parseLiteral<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const result = required(value, field);
  if (!(allowed as readonly string[]).includes(result)) throw new Error(`${field} is invalid`);
  return result as T;
}

function parsePrior(value: unknown, field: string): ReviewedEdinetPriorReference | undefined {
  if (value === null || value === undefined) return undefined;
  const prior = obj(value, field);
  return {
    evidenceId: required(prior.evidenceId, `${field}.evidenceId`),
    documentRevisionId: required(prior.documentRevisionId, `${field}.documentRevisionId`),
    documentRevisionRecordId: required(
      prior.documentRevisionRecordId,
      `${field}.documentRevisionRecordId`,
    ),
    relationType: parseLiteral(prior.relationType, `${field}.relationType`, [
      "corrects",
      "retracts",
      "supersedes",
      "invalidates",
    ] as const),
    supersessionStrength: parseLiteral(
      prior.supersessionStrength,
      `${field}.supersessionStrength`,
      ["partial", "binding"] as const,
    ),
  };
}

function immutableMappingSource(mapping: EdinetFoundationMappingDraft): unknown {
  return {
    mappingId: mapping.mappingId,
    docID: mapping.docID,
    sourceCandidateIds: mapping.sourceCandidateIds,
    sourceCandidateHashes: mapping.sourceCandidateHashes,
    sourceAfterTextHashes: mapping.sourceAfterTextHashes,
    suggestedRevisionKind: mapping.suggestedRevisionKind,
    suggestedDocumentTypeCode: mapping.suggestedDocumentTypeCode,
    sections: mapping.fields.sections.map(section => ({
      candidateId: section.candidateId,
      sourceCandidateHash: section.sourceCandidateHash,
      logicalRoleKey: section.logicalRoleKey,
      path: section.path,
      sourceContentHash: section.sourceContentHash,
    })),
  };
}

function parseSections(
  source: EdinetFoundationMappingDraft,
  edited: JsonObject,
  field: string,
): ReviewedEdinetFoundationInput["sections"] {
  const rawSections = arr(edited.sections, `${field}.sections`);
  if (rawSections.length !== source.fields.sections.length) {
    throw new Error(`${field}.sections count mismatch`);
  }
  const byCandidate = new Map<string, JsonObject>();
  for (const [index, value] of rawSections.entries()) {
    const section = obj(value, `${field}.sections[${index}]`);
    const candidateId = required(section.candidateId, `${field}.sections[${index}].candidateId`);
    if (byCandidate.has(candidateId)) throw new Error(`${field}.sections has duplicate ${candidateId}`);
    byCandidate.set(candidateId, section);
  }
  return source.fields.sections.map((sourceSection, index) => {
    const section = byCandidate.get(sourceSection.candidateId);
    if (!section) throw new Error(`${field}.sections is missing ${sourceSection.candidateId}`);
    const proposedImmutable = {
      candidateId: str(section.candidateId),
      sourceCandidateHash: str(section.sourceCandidateHash),
      logicalRoleKey: str(section.logicalRoleKey),
      path: str(section.path),
      sourceContentHash: section.sourceContentHash,
    };
    const expectedImmutable = {
      candidateId: sourceSection.candidateId,
      sourceCandidateHash: sourceSection.sourceCandidateHash,
      logicalRoleKey: sourceSection.logicalRoleKey,
      path: sourceSection.path,
      sourceContentHash: sourceSection.sourceContentHash,
    };
    if (JSON.stringify(canonical(proposedImmutable)) !== JSON.stringify(canonical(expectedImmutable))) {
      throw new Error(`${field}.sections[${index}] source fields changed`);
    }
    if (sourceSection.sourceContentHash === null) {
      throw new Error(`${field}.sections[${index}] has no after content hash`);
    }
    const ordinal = nonNegativeInteger(section.ordinal, `${field}.sections[${index}].ordinal`);
    return {
      sectionId: required(section.sectionId, `${field}.sections[${index}].sectionId`),
      path: sourceSection.path,
      ordinal,
      titleHash: requireHash(section.titleHash, `${field}.sections[${index}].titleHash`),
      contentHash: sourceSection.sourceContentHash,
    };
  });
}

function assembleFoundationInput(input: {
  source: EdinetFoundationMappingDraft;
  edited: JsonObject;
  reviewer: string;
  reviewedAt: string;
  field: string;
}): ReviewedEdinetFoundationInput {
  const fields = obj(input.edited.fields, `${input.field}.fields`);
  const eventAtStatus = parseLiteral(fields.eventAtStatus, `${input.field}.fields.eventAtStatus`, [
    "known",
    "unknown",
    "not_applicable",
  ] as const);
  const eventAtText = str(fields.eventAt);
  const revisionKind = parseLiteral(fields.revisionKind, `${input.field}.fields.revisionKind`, [
    "initial",
    "amendment",
    "correction",
    "restatement",
    "replacement",
    "withdrawal",
    "periodic_update",
  ] as const);
  const evidenceStatus = parseLiteral(fields.evidenceStatus, `${input.field}.fields.evidenceStatus`, [
    "active",
    "corrected",
    "retracted",
    "withdrawn",
    "expired",
  ] as const);
  const documentRevisionStatus = parseLiteral(
    fields.documentRevisionStatus,
    `${input.field}.fields.documentRevisionStatus`,
    ["active", "superseded", "withdrawn", "rejected"] as const,
  );
  const license = parseLiteral(fields.license, `${input.field}.fields.license`, [
    "metadata_only",
    "local_only",
  ] as const);
  const storagePolicy = parseLiteral(fields.storagePolicy, `${input.field}.fields.storagePolicy`, [
    "metadata_only",
    "hash_only",
    "local_only_content",
  ] as const);
  const entityIds = strings(fields.entityIds, `${input.field}.fields.entityIds`);
  if (entityIds.length === 0) throw new Error(`${input.field}.fields.entityIds must not be empty`);
  if (new Set(entityIds).size !== entityIds.length) {
    throw new Error(`${input.field}.fields.entityIds must be unique`);
  }
  const revisionSequence = nonNegativeInteger(
    fields.revisionSequence,
    `${input.field}.fields.revisionSequence`,
  );
  const prior = parsePrior(fields.prior, `${input.field}.fields.prior`);
  const assembled: ReviewedEdinetFoundationInput = {
    schemaVersion: 1,
    reviewId: required(fields.reviewId, `${input.field}.fields.reviewId`),
    reviewedBy: input.reviewer,
    reviewedByHuman: true,
    reviewedAt: input.reviewedAt,
    semanticMappingStatus: "confirmed",
    docID: input.source.docID,
    chainRootDocID: requireDocID(
      fields.chainRootDocID,
      `${input.field}.fields.chainRootDocID`,
    ),
    documentTypeCode: required(
      fields.documentTypeCode,
      `${input.field}.fields.documentTypeCode`,
    ),
    entityIds,
    sourceContentHash: requireHash(
      fields.sourceContentHash,
      `${input.field}.fields.sourceContentHash`,
    ),
    title: required(fields.title, `${input.field}.fields.title`),
    summary: required(fields.summary, `${input.field}.fields.summary`),
    publishedAt: timestamp(fields.publishedAt, `${input.field}.fields.publishedAt`),
    observedAt: timestamp(fields.observedAt, `${input.field}.fields.observedAt`),
    retrievedAt: timestamp(fields.retrievedAt, `${input.field}.fields.retrievedAt`),
    effectiveFrom: timestamp(fields.effectiveFrom, `${input.field}.fields.effectiveFrom`),
    firstExecutableAt: timestamp(
      fields.firstExecutableAt,
      `${input.field}.fields.firstExecutableAt`,
    ),
    eventAtStatus,
    ...(eventAtStatus === "known"
      ? { eventAt: timestamp(eventAtText, `${input.field}.fields.eventAt`) }
      : {}),
    retrievalRunId: required(fields.retrievalRunId, `${input.field}.fields.retrievalRunId`),
    parserVersion: required(fields.parserVersion, `${input.field}.fields.parserVersion`),
    normalizationVersion: required(
      fields.normalizationVersion,
      `${input.field}.fields.normalizationVersion`,
    ),
    normalizedStructureHash: requireHash(
      fields.normalizedStructureHash,
      `${input.field}.fields.normalizedStructureHash`,
    ),
    language: required(fields.language, `${input.field}.fields.language`),
    revisionKind,
    revisionSequence,
    evidenceStatus,
    documentRevisionStatus,
    license,
    storagePolicy,
    sections: parseSections(input.source, fields, `${input.field}.fields`),
    ...(prior ? { prior } : {}),
  };
  return assembled;
}

export function finalizeEdinetFoundationMapping(input: {
  impactReview: unknown;
  sourceImpactReviewFile: string;
  mappingInput: unknown;
  sourceMappingInputFile: string;
  generatedAt?: string;
}): EdinetFoundationPreviewFinal {
  const edited = obj(input.mappingInput, "mappingInput");
  if (edited.reviewStatus !== "draft_human_input") {
    throw new Error("mappingInput.reviewStatus must be draft_human_input");
  }
  if (edited.appendAuthorized !== false || edited.foundationPreviewEligible !== false) {
    throw new Error("mappingInput safety boundary is invalid");
  }
  const sourceMappingInputHash = requireHash(edited.recordHash, "mappingInput.recordHash");
  const { recordHash: _ignored, ...withoutHash } = edited;
  if (digest(withoutHash) !== sourceMappingInputHash) throw new Error("mappingInput.recordHash mismatch");
  const template = buildEdinetFoundationMappingTemplate({
    impactReview: input.impactReview,
    sourceImpactReviewFile: input.sourceImpactReviewFile,
    generatedAt: timestamp(edited.generatedAt, "mappingInput.generatedAt"),
  });
  if (str(edited.sourceImpactReviewHash) !== template.sourceImpactReviewHash) {
    throw new Error("mappingInput sourceImpactReviewHash mismatch");
  }
  const sourceMappingInputFile = localJsonBasename(
    input.sourceMappingInputFile,
    "sourceMappingInputFile",
  );
  const reviewer = required(edited.reviewer, "mappingInput.reviewer");
  const reviewedAt = timestamp(edited.reviewedAt, "mappingInput.reviewedAt");
  const editedMappings = new Map<string, JsonObject>();
  for (const [index, value] of arr(edited.mappings, "mappingInput.mappings").entries()) {
    const mapping = obj(value, `mappingInput.mappings[${index}]`);
    const mappingId = required(mapping.mappingId, `mappingInput.mappings[${index}].mappingId`);
    if (editedMappings.has(mappingId)) throw new Error(`duplicate mapping ${mappingId}`);
    editedMappings.set(mappingId, mapping);
  }
  if (editedMappings.size !== template.mappingCount) throw new Error("mappingInput mapping count mismatch");

  const previews = template.mappings.map((source, index) => {
    const editedMapping = editedMappings.get(source.mappingId);
    if (!editedMapping) throw new Error(`mappingInput is missing ${source.mappingId}`);
    if (editedMapping.mappingComplete !== true) {
      throw new Error(`mappingInput.mappings[${index}].mappingComplete must be true`);
    }
    const proposedImmutable = {
      mappingId: str(editedMapping.mappingId),
      docID: str(editedMapping.docID),
      sourceCandidateIds: editedMapping.sourceCandidateIds,
      sourceCandidateHashes: editedMapping.sourceCandidateHashes,
      sourceAfterTextHashes: editedMapping.sourceAfterTextHashes,
      suggestedRevisionKind: editedMapping.suggestedRevisionKind,
      suggestedDocumentTypeCode: editedMapping.suggestedDocumentTypeCode,
      sections: arr(obj(editedMapping.fields, `mappingInput.mappings[${index}].fields`).sections, `mappingInput.mappings[${index}].fields.sections`).map(value => {
        const section = obj(value, `mappingInput.mappings[${index}].section`);
        return {
          candidateId: section.candidateId,
          sourceCandidateHash: section.sourceCandidateHash,
          logicalRoleKey: section.logicalRoleKey,
          path: section.path,
          sourceContentHash: section.sourceContentHash,
        };
      }),
    };
    if (JSON.stringify(canonical(proposedImmutable)) !== JSON.stringify(canonical(immutableMappingSource(source)))) {
      throw new Error(`mappingInput.mappings[${index}] source fields changed`);
    }
    return buildReviewedEdinetFoundationPreview(assembleFoundationInput({
      source,
      edited: editedMapping,
      reviewer,
      reviewedAt,
      field: `mappingInput.mappings[${index}]`,
    }));
  });

  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: template.issuer,
    sourceImpactReviewFile: template.sourceImpactReviewFile,
    sourceImpactReviewHash: template.sourceImpactReviewHash,
    sourceMappingInputFile,
    sourceMappingInputHash,
    generatedAt,
    reviewer,
    reviewedAt,
    reviewStatus: "complete_foundation_preview" as const,
    previewCount: previews.length,
    previews,
    foundationPreviewEligible: false as const,
    previewGenerated: true as const,
    appendAuthorized: false as const,
    blockers: [
      "foundation_preview_is_not_store_append",
      "governed_store_append_requires_separate_explicit_action",
      "portfolio_or_recommendation_use_not_authorized",
    ].sort(),
  };
  return { ...base, recordHash: digest(base) };
}

export function renderEdinetFoundationMappingRecord(
  record: EdinetFoundationMappingTemplate | EdinetFoundationPreviewFinal,
): string {
  const lines = [
    "# EDINET Foundation mapping",
    "",
    `- sourceImpactReviewFile: ${record.sourceImpactReviewFile}`,
    `- sourceImpactReviewHash: ${record.sourceImpactReviewHash}`,
    `- generatedAt: ${record.generatedAt}`,
    `- reviewer: ${record.reviewer || "(edit JSON)"}`,
    `- reviewedAt: ${record.reviewedAt ?? "(pending)"}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- foundationPreviewEligible: ${record.foundationPreviewEligible}`,
    `- appendAuthorized: ${record.appendAuthorized}`,
    `- recordHash: ${record.recordHash}`,
    "",
    "## Boundary",
    "",
    "- Security Master entity IDs, PIT times, source document hash, normalized structure, section title hashes, revision lineage, license, and storage policy require explicit human input.",
    "- A generated Foundation preview remains non-appendable and does not enter a recommendation, portfolio, BUY, or order path.",
    "",
  ];
  if (record.reviewStatus === "draft_human_input") {
    for (const mapping of record.mappings) {
      lines.push(
        `## ${mapping.docID}`,
        "",
        `- mappingId: ${mapping.mappingId}`,
        `- sourceCandidates: ${mapping.sourceCandidateIds.join(", ")}`,
        `- suggestedRevisionKind: ${mapping.suggestedRevisionKind}`,
        `- suggestedDocumentTypeCode: ${mapping.suggestedDocumentTypeCode}`,
        `- sectionCount: ${mapping.fields.sections.length}`,
        `- mappingComplete: ${mapping.mappingComplete}`,
        `- mappingHash: ${mapping.mappingHash}`,
        "",
      );
    }
  } else {
    lines.push(
      `- sourceMappingInputFile: ${record.sourceMappingInputFile}`,
      `- sourceMappingInputHash: ${record.sourceMappingInputHash}`,
      `- previewCount: ${record.previewCount}`,
      `- previewGenerated: ${record.previewGenerated}`,
      "",
    );
    for (const preview of record.previews) {
      lines.push(
        `## ${preview.reviewId}`,
        "",
        `- evidenceId: ${preview.evidence.evidenceId}`,
        `- documentRevisionId: ${preview.documentRevision.documentRevisionId}`,
        `- relation: ${preview.relation?.relationType ?? "(none)"}`,
        `- appendAuthorized: ${preview.appendAuthorized}`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}