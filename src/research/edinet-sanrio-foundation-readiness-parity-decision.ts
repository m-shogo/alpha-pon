import {
  auditSanrioConfiguredFoundationReadinessWithParityLineage,
  assertSanrioFoundationParityLineage,
} from "./edinet-sanrio-foundation-readiness-parity-lineage.js";
import type { SanrioFoundationReadinessAudit } from "./edinet-sanrio-foundation-readiness-audit.js";

type JsonObject = Record<string, unknown>;

const FINAL_MAPPING_DECISIONS = new Set([
  "equivalent_evidence_coverage",
  "complementary_evidence_coverage",
  "materially_inconsistent",
  "insufficient_evidence",
]);
const FINAL_COVERAGE_DISPOSITIONS = new Set([
  "mapped_to_legacy_evidence",
  "additional_coverage_acceptable",
  "blocks_replacement",
  "insufficient_evidence",
]);
const FINAL_REPLACEMENT_RECOMMENDATIONS = new Set([
  "recommend_configured_replacement",
  "recommend_keep_legacy",
  "insufficient_evidence",
]);

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function stringArray(value: unknown, field: string): string[] {
  const result = array(value, field).map((item, index) => required(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${field} must not contain duplicates`);
  return result;
}

export function assertSanrioFoundationParityDecisionConformance(parityReviewValue: unknown): void {
  const review = object(parityReviewValue, "parityReview");
  if (
    review.schemaVersion !== 1
    || review.source !== "edinet"
    || review.reviewStatus !== "complete_human_parity_review"
    || review.inventoryAuditHumanConfirmed !== true
    || review.semanticEquivalenceInferred !== false
    || review.automaticMappingDecisionAuthorized !== false
    || review.automaticReplacementDecisionAuthorized !== false
    || review.legacyEntryPointMutationAuthorized !== false
    || review.replacementAuthorized !== false
    || review.foundationPreviewEligible !== false
    || review.appendAuthorized !== false
  ) {
    throw new Error("parityReview safety boundary is invalid");
  }

  const mappings = array(review.mappings, "parityReview.mappings");
  const coverage = array(review.coverage, "parityReview.coverage");
  const declaredMappingCount = nonNegativeInteger(review.mappingCount, "parityReview.mappingCount");
  const declaredCoverageCount = nonNegativeInteger(review.coverageCount, "parityReview.coverageCount");
  if (
    mappings.length !== declaredMappingCount
    || declaredMappingCount !== nonNegativeInteger(review.completedMappingCount, "parityReview.completedMappingCount")
  ) {
    throw new Error("parityReview mapping completion count mismatch");
  }
  if (
    coverage.length !== declaredCoverageCount
    || declaredCoverageCount !== nonNegativeInteger(review.completedCoverageCount, "parityReview.completedCoverageCount")
  ) {
    throw new Error("parityReview coverage completion count mismatch");
  }

  let materiallyInconsistentMappingCount = 0;
  let insufficientEvidenceCount = 0;
  const selectedConfigured = new Set<string>();
  for (const [index, value] of mappings.entries()) {
    const mapping = object(value, `parityReview.mappings[${index}]`);
    if (mapping.completed !== true) throw new Error(`parityReview.mappings[${index}] must be completed`);
    const decision = required(mapping.humanMappingDecision, `parityReview.mappings[${index}].humanMappingDecision`);
    if (!FINAL_MAPPING_DECISIONS.has(decision)) {
      throw new Error(`parityReview.mappings[${index}].humanMappingDecision is invalid`);
    }
    const sameDocumentIds = stringArray(
      mapping.sameDocumentConfiguredAnchorIds,
      `parityReview.mappings[${index}].sameDocumentConfiguredAnchorIds`,
    );
    const selectedIds = stringArray(
      mapping.selectedConfiguredAnchorIds,
      `parityReview.mappings[${index}].selectedConfiguredAnchorIds`,
    );
    if (selectedIds.some(id => !sameDocumentIds.includes(id))) {
      throw new Error(`parityReview.mappings[${index}] selected configured anchor is outside same-document candidates`);
    }
    if (
      (decision === "equivalent_evidence_coverage"
        || decision === "complementary_evidence_coverage"
        || decision === "materially_inconsistent")
      && selectedIds.length === 0
    ) {
      throw new Error(`parityReview.mappings[${index}] decision requires a selected configured anchor`);
    }
    if (text(mapping.machineRelation) === "no_configured_document" && decision !== "insufficient_evidence") {
      throw new Error(`parityReview.mappings[${index}] without configured document must be insufficient_evidence`);
    }
    if ((decision === "materially_inconsistent" || decision === "insufficient_evidence") && !text(mapping.humanNotes)) {
      throw new Error(`parityReview.mappings[${index}] risk decision requires human notes`);
    }
    if (decision === "materially_inconsistent") materiallyInconsistentMappingCount += 1;
    if (decision === "insufficient_evidence") insufficientEvidenceCount += 1;
    for (const id of selectedIds) selectedConfigured.add(id);
  }

  let blockingCoverageCount = 0;
  for (const [index, value] of coverage.entries()) {
    const item = object(value, `parityReview.coverage[${index}]`);
    if (item.completed !== true) throw new Error(`parityReview.coverage[${index}] must be completed`);
    const disposition = required(item.humanDisposition, `parityReview.coverage[${index}].humanDisposition`);
    if (!FINAL_COVERAGE_DISPOSITIONS.has(disposition)) {
      throw new Error(`parityReview.coverage[${index}].humanDisposition is invalid`);
    }
    const configured = object(item.configured, `parityReview.coverage[${index}].configured`);
    const anchorId = required(configured.anchorId, `parityReview.coverage[${index}].configured.anchorId`);
    if (selectedConfigured.has(anchorId) && disposition !== "mapped_to_legacy_evidence") {
      throw new Error(`parityReview.coverage[${index}] selected by mapping must be mapped_to_legacy_evidence`);
    }
    if (!selectedConfigured.has(anchorId) && disposition === "mapped_to_legacy_evidence") {
      throw new Error(`parityReview.coverage[${index}] not selected by mapping cannot be mapped_to_legacy_evidence`);
    }
    if ((disposition === "blocks_replacement" || disposition === "insufficient_evidence") && !text(item.humanNotes)) {
      throw new Error(`parityReview.coverage[${index}] risk disposition requires human notes`);
    }
    if (disposition === "blocks_replacement") blockingCoverageCount += 1;
    if (disposition === "insufficient_evidence") insufficientEvidenceCount += 1;
  }

  if (
    materiallyInconsistentMappingCount
    !== nonNegativeInteger(review.materiallyInconsistentMappingCount, "parityReview.materiallyInconsistentMappingCount")
  ) {
    throw new Error("parityReview materiallyInconsistentMappingCount mismatch");
  }
  if (
    blockingCoverageCount
    !== nonNegativeInteger(review.blockingCoverageCount, "parityReview.blockingCoverageCount")
  ) {
    throw new Error("parityReview blockingCoverageCount mismatch");
  }
  if (
    insufficientEvidenceCount
    !== nonNegativeInteger(review.insufficientEvidenceCount, "parityReview.insufficientEvidenceCount")
  ) {
    throw new Error("parityReview insufficientEvidenceCount mismatch");
  }

  const recommendation = required(review.replacementRecommendation, "parityReview.replacementRecommendation");
  if (!FINAL_REPLACEMENT_RECOMMENDATIONS.has(recommendation)) {
    throw new Error("parityReview replacementRecommendation is invalid");
  }
  required(review.replacementRationale, "parityReview.replacementRationale");
  if (
    recommendation === "recommend_configured_replacement"
    && (materiallyInconsistentMappingCount > 0 || blockingCoverageCount > 0 || insufficientEvidenceCount > 0)
  ) {
    throw new Error("parityReview cannot recommend configured replacement while blockers or insufficient evidence remain");
  }
}

export function auditSanrioConfiguredFoundationReadinessWithParityDecisionConformance(input: {
  parityReview: unknown;
  sourceParityReviewFile: string;
  parityWorkspace: unknown;
  sourceParityWorkspaceFile: string;
  configuredReview: unknown;
  sourceConfiguredReviewFile: string;
  generatedAt?: string;
}): SanrioFoundationReadinessAudit {
  assertSanrioFoundationParityLineage({
    parityWorkspace: input.parityWorkspace,
    parityReview: input.parityReview,
  });
  assertSanrioFoundationParityDecisionConformance(input.parityReview);
  return auditSanrioConfiguredFoundationReadinessWithParityLineage(input);
}
