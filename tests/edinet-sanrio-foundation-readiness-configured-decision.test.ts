import assert from "node:assert/strict";
import {
  assertSanrioFoundationConfiguredReviewDecisionConformance,
} from "../src/research/edinet-sanrio-foundation-readiness-configured-decision.js";

type JsonObject = Record<string, unknown>;

function fixture(): JsonObject {
  return {
    schemaVersion: 1,
    source: "edinet",
    reviewer: "configured-human",
    reviewedAt: "2026-08-07T00:21:00.000Z",
    reviewStatus: "complete_human_comparison_review",
    documentCount: 1,
    anchorCount: 1,
    completedAnchorCount: 1,
    documents: [{
      docID: "S900DOC1",
      anchorCount: 1,
      completedAnchorCount: 1,
      anchors: [{
        anchorId: "configured:001",
        sourceComparisonResult: "not_exact_normalized_match_pending_visual_review",
        expectedRelation: "visual_layout_variance_review",
        rawExactMatch: false,
        normalizedExactMatch: false,
        visualConfirmation: true,
        visualDecision: "visually_equivalent",
        equivalenceDecision: "equivalent",
        confirmedFacts: ["confirmed fact"],
        previouslyKnownFacts: [],
        assumptions: [],
        opinions: [],
        exactAmounts: [{
          amountText: "100",
          currency: "JPY",
          period: "FY2026",
          recipient: "recipient",
          payer: "payer",
          sourcePage: 4,
        }],
        accountingImpact: "unknown",
        internalControlImpact: "unknown",
        auditOpinionImpact: "unknown",
        materiality: "unknown",
        direction: "unknown",
        completed: true,
      }],
    }],
    automaticFactPromotionAuthorized: false,
    automaticImpactDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
}

function anchor(input: JsonObject): JsonObject {
  return (((input.documents as JsonObject[])[0]!.anchors as JsonObject[])[0]!);
}

{
  assert.doesNotThrow(() => assertSanrioFoundationConfiguredReviewDecisionConformance(fixture()));
  console.log("edinet-sanrio-foundation-readiness-configured-decision: valid finalized review passes OK");
}

{
  const input = fixture();
  input.reviewedAt = "2026-08-07T09:21:00+09:00";
  assert.doesNotThrow(() => assertSanrioFoundationConfiguredReviewDecisionConformance(input));
  console.log("edinet-sanrio-foundation-readiness-configured-decision: explicit timezone offset reviewedAt passes OK");
}

for (const reviewedAt of ["2026-08-07T00:21:00", "2026-02-30T00:21:00Z"]) {
  const input = fixture();
  input.reviewedAt = reviewedAt;
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /configuredReview\.reviewedAt/,
  );
}
console.log("edinet-sanrio-foundation-readiness-configured-decision: permissive reviewedAt values blocked OK");

{
  const input = fixture();
  anchor(input).visualDecision = "invented_visual_decision";
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /visualDecision is invalid/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: invalid visual enum blocked OK");
}

{
  const input = fixture();
  anchor(input).equivalenceDecision = "substantively_different";
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /visual\/equivalence decisions are inconsistent/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: inconsistent visual/equivalence pair blocked OK");
}

{
  const input = fixture();
  anchor(input).confirmedFacts = [];
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /requires at least one confirmed fact/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: non-insufficient decision requires confirmed fact OK");
}

{
  const input = fixture();
  ((anchor(input).exactAmounts as JsonObject[])[0]!).sourcePage = 0;
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /sourcePage must be a positive integer/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: malformed exact amount blocked OK");
}

{
  const input = fixture();
  anchor(input).accountingImpact = "invented_impact";
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /accountingImpact is invalid/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: invalid impact enum blocked OK");
}

{
  const input = fixture();
  anchor(input).materiality = "invented_materiality";
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /materiality is invalid/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: invalid materiality enum blocked OK");
}

{
  const input = fixture();
  input.anchorCount = 2;
  input.completedAnchorCount = 2;
  assert.throws(
    () => assertSanrioFoundationConfiguredReviewDecisionConformance(input),
    /anchor completion count mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-decision: forged configured anchor count blocked OK");
}

console.log("edinet-sanrio-foundation-readiness-configured-decision.test.ts passed");
