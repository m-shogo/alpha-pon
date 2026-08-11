import { parseExplicitIso8601Instant } from "./iso-instant.js";
import type { SanrioFoundationReadinessAudit } from "./edinet-sanrio-foundation-readiness-audit.js";
import {
  auditSanrioConfiguredFoundationReadinessWithParityDecisionConformance,
} from "./edinet-sanrio-foundation-readiness-parity-decision.js";

type JsonObject = Record<string, unknown>;

const VISUAL_TO_EQUIVALENCE: Record<string, string> = {
  visually_equivalent: "equivalent",
  visually_different: "substantively_different",
  insufficient_visual_evidence: "insufficient_evidence",
};
const IMPACT_VALUES = new Set(["yes", "no", "unknown"]);
const MATERIALITY_VALUES = new Set(["material", "not_material", "unknown"]);
const DIRECTION_VALUES = new Set(["positive", "negative", "neutral", "unknown"]);
const SOURCE_COMPARISON_VALUES = new Set([
  "exact_normalized_match",
  "not_exact_normalized_match_pending_visual_review",
]);
const EXPECTED_RELATION_VALUES = new Set([
  "exact_normalized_match",
  "visual_layout_variance_review",
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

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function stringArray(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => required(item, `${field}[${index}]`));
}

function impact(value: unknown, field: string): string {
  const result = required(value, field);
  if (!IMPACT_VALUES.has(result)) throw new Error(`${field} is invalid`);
  return result;
}

function materiality(value: unknown, field: string): string {
  const result = required(value, field);
  if (!MATERIALITY_VALUES.has(result)) throw new Error(`${field} is invalid`);
  return result;
}

function direction(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DIRECTION_VALUES.has(result)) throw new Error(`${field} is invalid`);
  return result;
}

function validateAmounts(value: unknown, field: string): void {
  for (const [index, item] of array(value, field).entries()) {
    const amount = object(item, `${field}[${index}]`);
    required(amount.amountText, `${field}[${index}].amountText`);
    required(amount.currency, `${field}[${index}].currency`);
    required(amount.period, `${field}[${index}].period`);
    required(amount.recipient, `${field}[${index}].recipient`);
    required(amount.payer, `${field}[${index}].payer`);
    positiveInteger(amount.sourcePage, `${field}[${index}].sourcePage`);
  }
}

export function assertSanrioFoundationConfiguredReviewDecisionConformance(
  configuredReviewValue: unknown,
): void {
  const review = object(configuredReviewValue, "configuredReview");
  if (
    review.schemaVersion !== 1
    || review.source !== "edinet"
    || review.reviewStatus !== "complete_human_comparison_review"
    || review.automaticFactPromotionAuthorized !== false
    || review.automaticImpactDecisionAuthorized !== false
    || review.foundationPreviewEligible !== false
    || review.appendAuthorized !== false
  ) {
    throw new Error("configuredReview safety boundary is invalid");
  }

  required(review.reviewer, "configuredReview.reviewer");
  const reviewedAt = required(review.reviewedAt, "configuredReview.reviewedAt");
  parseExplicitIso8601Instant(reviewedAt, "configuredReview.reviewedAt");

  const documents = array(review.documents, "configuredReview.documents");
  if (documents.length !== nonNegativeInteger(review.documentCount, "configuredReview.documentCount")) {
    throw new Error("configuredReview documentCount mismatch");
  }

  let actualAnchorCount = 0;
  const seenDocuments = new Set<string>();
  const seenAnchors = new Set<string>();
  for (const [documentIndex, documentValue] of documents.entries()) {
    const document = object(documentValue, `configuredReview.documents[${documentIndex}]`);
    const docID = required(document.docID, `configuredReview.documents[${documentIndex}].docID`);
    if (seenDocuments.has(docID)) throw new Error(`configuredReview has duplicate document ${docID}`);
    seenDocuments.add(docID);
    const anchors = array(document.anchors, `configuredReview.documents[${documentIndex}].anchors`);
    const declared = nonNegativeInteger(
      document.anchorCount,
      `configuredReview.documents[${documentIndex}].anchorCount`,
    );
    const completed = nonNegativeInteger(
      document.completedAnchorCount,
      `configuredReview.documents[${documentIndex}].completedAnchorCount`,
    );
    if (anchors.length !== declared || completed !== declared) {
      throw new Error(`configuredReview document ${docID} anchor completion count mismatch`);
    }
    actualAnchorCount += anchors.length;

    for (const [anchorIndex, anchorValue] of anchors.entries()) {
      const field = `configuredReview document ${docID}.anchors[${anchorIndex}]`;
      const anchor = object(anchorValue, field);
      const anchorId = required(anchor.anchorId, `${field}.anchorId`);
      if (seenAnchors.has(anchorId)) throw new Error(`configuredReview has duplicate anchor ${anchorId}`);
      seenAnchors.add(anchorId);
      if (anchor.completed !== true || anchor.visualConfirmation !== true) {
        throw new Error(`${field} must be completed with visual confirmation`);
      }
      const sourceComparison = required(anchor.sourceComparisonResult, `${field}.sourceComparisonResult`);
      if (!SOURCE_COMPARISON_VALUES.has(sourceComparison)) {
        throw new Error(`${field}.sourceComparisonResult is invalid`);
      }
      const expectedRelation = required(anchor.expectedRelation, `${field}.expectedRelation`);
      if (!EXPECTED_RELATION_VALUES.has(expectedRelation)) {
        throw new Error(`${field}.expectedRelation is invalid`);
      }
      if (typeof anchor.rawExactMatch !== "boolean" || typeof anchor.normalizedExactMatch !== "boolean") {
        throw new Error(`${field} exact-match flags are invalid`);
      }
      const visual = required(anchor.visualDecision, `${field}.visualDecision`);
      const equivalence = required(anchor.equivalenceDecision, `${field}.equivalenceDecision`);
      if (!(visual in VISUAL_TO_EQUIVALENCE)) throw new Error(`${field}.visualDecision is invalid`);
      if (VISUAL_TO_EQUIVALENCE[visual] !== equivalence) {
        throw new Error(`${field} visual/equivalence decisions are inconsistent`);
      }
      const confirmedFacts = stringArray(anchor.confirmedFacts, `${field}.confirmedFacts`);
      stringArray(anchor.previouslyKnownFacts, `${field}.previouslyKnownFacts`);
      stringArray(anchor.assumptions, `${field}.assumptions`);
      stringArray(anchor.opinions, `${field}.opinions`);
      if (equivalence !== "insufficient_evidence" && confirmedFacts.length === 0) {
        throw new Error(`${field} requires at least one confirmed fact`);
      }
      validateAmounts(anchor.exactAmounts, `${field}.exactAmounts`);
      impact(anchor.accountingImpact, `${field}.accountingImpact`);
      impact(anchor.internalControlImpact, `${field}.internalControlImpact`);
      impact(anchor.auditOpinionImpact, `${field}.auditOpinionImpact`);
      materiality(anchor.materiality, `${field}.materiality`);
      direction(anchor.direction, `${field}.direction`);
    }
  }

  const declaredAnchorCount = nonNegativeInteger(review.anchorCount, "configuredReview.anchorCount");
  const declaredCompletedAnchorCount = nonNegativeInteger(
    review.completedAnchorCount,
    "configuredReview.completedAnchorCount",
  );
  if (actualAnchorCount !== declaredAnchorCount || declaredCompletedAnchorCount !== declaredAnchorCount) {
    throw new Error("configuredReview anchor completion count mismatch");
  }
}

export function auditSanrioConfiguredFoundationReadinessWithConfiguredDecisionConformance(input: {
  parityReview: unknown;
  sourceParityReviewFile: string;
  parityWorkspace: unknown;
  sourceParityWorkspaceFile: string;
  configuredReview: unknown;
  sourceConfiguredReviewFile: string;
  generatedAt?: string;
}): SanrioFoundationReadinessAudit {
  assertSanrioFoundationConfiguredReviewDecisionConformance(input.configuredReview);
  return auditSanrioConfiguredFoundationReadinessWithParityDecisionConformance(input);
}
