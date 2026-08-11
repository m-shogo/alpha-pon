import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetHumanComparisonTemplate,
  finalizeConfiguredEdinetHumanComparisonReview,
  renderConfiguredEdinetHumanComparisonRecord,
} from "../src/research/edinet-configured-human-comparison-review.js";

type JsonObject = Record<string, unknown>;

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

function comparisonAnchor(input: {
  id: string;
  matched: boolean;
  page: number;
}): JsonObject {
  const base = {
    anchorId: input.id,
    reason: `review ${input.id}`,
    expectedRelation: input.matched ? "exact_normalized_match" : "visual_layout_variance_review",
    structured: {
      entryPath: `XBRL/PublicDoc/${input.id}.htm`,
      lineNumber: 2,
      textHash: "1".repeat(64),
      normalizedTextHash: input.matched ? "2".repeat(64) : "3".repeat(64),
      normalizedLength: 20,
    },
    pdf: {
      pageNumber: input.page,
      lineNumber: 4,
      textHash: "4".repeat(64),
      normalizedTextHash: input.matched ? "2".repeat(64) : "5".repeat(64),
      normalizedLength: input.matched ? 20 : 21,
    },
    rawExactMatch: false,
    normalizedExactMatch: input.matched,
    comparisonResult: input.matched
      ? "exact_normalized_match"
      : "not_exact_normalized_match_pending_visual_review",
    visualReviewRequired: true,
    contentEquivalent: "unknown_pending_human_review",
    accountingImpact: "unknown_pending_human_review",
    internalControlImpact: "unknown_pending_human_review",
    auditOpinionImpact: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
  return { ...base, resultHash: digest(base) };
}

function comparisonReport(): JsonObject {
  const anchors = [
    comparisonAnchor({ id: "S900ROOT:anchor:001", matched: true, page: 1 }),
    comparisonAnchor({ id: "S900ROOT:anchor:002", matched: false, page: 2 }),
  ];
  const documentBase = {
    pairId: "fidelity:synthetic-co:S900ROOT",
    pairHash: "6".repeat(64),
    extractionHash: "7".repeat(64),
    docID: "S900ROOT",
    sourceAnchorSetHash: "8".repeat(64),
    anchorCount: anchors.length,
    exactNormalizedMatchCount: 1,
    mismatchPendingVisualReviewCount: 1,
    comparisonStatus: "complete_exact_normalized_comparison",
    anchors,
  };
  const document = { ...documentBase, documentResultHash: digest(documentBase) };
  const reportBase = {
    schemaVersion: 1,
    source: "edinet",
    normalizationVersion: "unicode-nfkc-horizontal-whitespace-v1",
    comparisonMethod: "exact_normalized_only",
    executionMode: "explicit_local_command",
    registryHash: "9".repeat(64),
    issuer: {
      issuerKey: "synthetic-co",
      name: "合成テスト株式会社",
      edinetCode: "E90000",
      secCode: "90000",
      boundaryHash: "a".repeat(64),
    },
    sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    sourceAnchorFinalHash: "b".repeat(64),
    generatedAt: "2026-08-06T15:10:00.000Z",
    reviewer: "anchor-reviewer",
    reviewedAt: "2026-08-06T15:00:00.000Z",
    documentCount: 1,
    anchorCount: 2,
    exactNormalizedMatchCount: 1,
    mismatchPendingVisualReviewCount: 1,
    comparisonStatus: "complete_exact_normalized_comparison",
    reviewStatus: "pending_human_comparison_review",
    documents: [document],
    globalBlockers: ["official_pdf_visual_review_required_for_every_anchor"],
    fuzzyMatchingUsed: false,
    semanticEquivalenceInferred: false,
    officialPdfVisualReviewComplete: false,
    automaticEquivalenceDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  return { ...reportBase, reportHash: digest(reportBase) };
}

function setupEdited(): {
  report: JsonObject;
  template: JsonObject;
  edited: JsonObject;
} {
  const report = comparisonReport();
  const template = buildConfiguredEdinetHumanComparisonTemplate({
    comparisonReport: report,
    sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
    generatedAt: "2026-08-06T15:20:00.000Z",
  }) as unknown as JsonObject;
  const edited = structuredClone(template) as JsonObject;
  edited.reviewer = "comparison-human-reviewer";
  edited.reviewedAt = "2026-08-06T15:30:00.000Z";
  const document = (edited.documents as JsonObject[])[0]!;
  const anchors = document.anchors as JsonObject[];
  Object.assign(anchors[0]!, {
    visualConfirmation: true,
    visualDecision: "visually_equivalent",
    equivalenceDecision: "equivalent",
    confirmedFacts: ["The selected structured and PDF statements are visually equivalent."],
    previouslyKnownFacts: ["The exact-normalized comparison matched."],
    assumptions: [],
    opinions: [],
    exactAmounts: [{
      amountText: "100百万円",
      currency: "JPY",
      period: "FY2026",
      recipient: "Synthetic recipient",
      payer: "Synthetic payer",
      sourcePage: 1,
    }],
    accountingImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    materiality: "unknown",
    direction: "unknown",
    reviewNotes: "Visual confirmation completed.",
    completed: true,
  });
  Object.assign(anchors[1]!, {
    visualConfirmation: true,
    visualDecision: "visually_different",
    equivalenceDecision: "substantively_different",
    confirmedFacts: ["The selected structured and PDF statements differ after visual review."],
    previouslyKnownFacts: ["The exact-normalized comparison did not match."],
    assumptions: ["No conclusion is made about accounting impact."],
    opinions: ["Further document-level review is appropriate."],
    exactAmounts: [],
    accountingImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    materiality: "unknown",
    direction: "unknown",
    reviewNotes: "Difference confirmed, impact not determined.",
    completed: true,
  });
  return { report, template, edited };
}

function finalize(input = setupEdited()) {
  return finalizeConfiguredEdinetHumanComparisonReview({
    comparisonReport: input.report,
    sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
    editedReviewInput: input.edited,
    generatedAt: "2026-08-06T15:40:00.000Z",
  });
}

{
  const { template } = setupEdited();
  assert.equal(template.reviewStatus, "draft_human_input");
  assert.equal(template.documentCount, 1);
  assert.equal(template.anchorCount, 2);
  assert.equal(template.completedAnchorCount, 0);
  assert.equal(template.automaticFactPromotionAuthorized, false);
  assert.equal(template.automaticImpactDecisionAuthorized, false);
  assert.equal(template.foundationPreviewEligible, false);
  assert.equal(template.appendAuthorized, false);
  const anchors = ((template.documents as JsonObject[])[0]!.anchors as JsonObject[]);
  assert.ok(anchors.every(anchor => anchor.visualDecision === "pending_human_review" && anchor.completed === false));
  console.log("edinet-configured-human-comparison-review: deterministic pending template OK");
}

{
  const record = finalize();
  assert.equal(record.reviewStatus, "complete_human_comparison_review");
  assert.equal(record.documentCount, 1);
  assert.equal(record.anchorCount, 2);
  assert.equal(record.completedAnchorCount, 2);
  assert.equal(record.automaticFactPromotionAuthorized, false);
  assert.equal(record.automaticImpactDecisionAuthorized, false);
  assert.equal(record.foundationPreviewEligible, false);
  assert.equal(record.appendAuthorized, false);
  assert.equal(record.documents[0]!.anchors[0]!.equivalenceDecision, "equivalent");
  assert.equal(record.documents[0]!.anchors[1]!.equivalenceDecision, "substantively_different");
  assert.equal(record.documents[0]!.anchors[0]!.exactAmounts[0]!.currency, "JPY");
  assert.match(record.recordHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetHumanComparisonRecord(record);
  assert.match(markdown, /confirmed\/known\/assumptions\/opinions/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  console.log("edinet-configured-human-comparison-review: complete explicit human decision record OK");
}

{
  const input = setupEdited();
  input.edited.reviewer = "";
  assert.throws(() => finalize(input), /reviewInput\.reviewer must be a non-empty string/);
  console.log("edinet-configured-human-comparison-review: reviewer required OK");
}

{
  const input = setupEdited();
  const anchor = ((((input.edited.documents as JsonObject[])[0]!.anchors) as JsonObject[])[0]!);
  anchor.visualConfirmation = false;
  assert.throws(() => finalize(input), /requires official PDF visual confirmation/);
  console.log("edinet-configured-human-comparison-review: visual confirmation required OK");
}

{
  const input = setupEdited();
  const anchor = ((((input.edited.documents as JsonObject[])[0]!.anchors) as JsonObject[])[0]!);
  anchor.visualDecision = "pending_human_review";
  assert.throws(() => finalize(input), /decisions must not remain pending/);
  console.log("edinet-configured-human-comparison-review: pending decisions blocked OK");
}

{
  const input = setupEdited();
  const anchor = ((((input.edited.documents as JsonObject[])[0]!.anchors) as JsonObject[])[0]!);
  anchor.visualDecision = "visually_equivalent";
  anchor.equivalenceDecision = "substantively_different";
  assert.throws(() => finalize(input), /visual\/equivalence decisions are inconsistent/);
  console.log("edinet-configured-human-comparison-review: inconsistent decisions blocked OK");
}

{
  const input = setupEdited();
  const anchor = ((((input.edited.documents as JsonObject[])[0]!.anchors) as JsonObject[])[0]!);
  anchor.confirmedFacts = [];
  assert.throws(() => finalize(input), /requires at least one confirmed fact/);
  console.log("edinet-configured-human-comparison-review: confirmed fact required for completed evidence OK");
}

{
  const input = setupEdited();
  const anchor = ((((input.edited.documents as JsonObject[])[0]!.anchors) as JsonObject[])[0]!);
  anchor.visualDecision = "insufficient_visual_evidence";
  anchor.equivalenceDecision = "insufficient_evidence";
  anchor.confirmedFacts = [];
  const record = finalize(input);
  assert.equal(record.documents[0]!.anchors[0]!.equivalenceDecision, "insufficient_evidence");
  console.log("edinet-configured-human-comparison-review: insufficient evidence may remain fact-empty OK");
}

{
  const input = setupEdited();
  const anchor = ((((input.edited.documents as JsonObject[])[0]!.anchors) as JsonObject[])[0]!);
  const structured = anchor.structured as JsonObject;
  structured.normalizedTextHash = "f".repeat(64);
  assert.throws(() => finalize(input), /source fields changed/);
  console.log("edinet-configured-human-comparison-review: immutable comparison source protected OK");
}

{
  const input = setupEdited();
  input.report.anchorCount = 99;
  assert.throws(() => finalize(input), /comparisonReport\.reportHash mismatch/);
  console.log("edinet-configured-human-comparison-review: comparison report tampering blocked OK");
}

{
  const input = setupEdited();
  input.edited.appendAuthorized = true;
  assert.throws(() => finalize(input), /reviewInput safety boundary is invalid/);
  console.log("edinet-configured-human-comparison-review: unsafe append boundary blocked OK");
}

{
  const report = comparisonReport();
  assert.throws(
    () => buildConfiguredEdinetHumanComparisonTemplate({
      comparisonReport: report,
      sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
      generatedAt: "2026-08-06T15:20:00",
    }),
    /generatedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  assert.throws(
    () => buildConfiguredEdinetHumanComparisonTemplate({
      comparisonReport: report,
      sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
      generatedAt: "2026-02-30T15:20:00Z",
    }),
    /generatedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  const offset = buildConfiguredEdinetHumanComparisonTemplate({
    comparisonReport: report,
    sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
    generatedAt: "2026-08-07T00:20:00+09:00",
  });
  assert.equal(offset.generatedAt, "2026-08-07T00:20:00+09:00");
  console.log("edinet-configured-human-comparison-review: template generatedAt strict instant OK");
}

{
  const input = setupEdited();
  input.edited.reviewedAt = "2026-08-06T15:30:00";
  assert.throws(
    () => finalize(input),
    /reviewInput\.reviewedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  input.edited.reviewedAt = "2026-02-30T15:30:00Z";
  assert.throws(
    () => finalize(input),
    /reviewInput\.reviewedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  console.log("edinet-configured-human-comparison-review: reviewedAt strict instant OK");
}

{
  const input = setupEdited();
  assert.throws(
    () => finalizeConfiguredEdinetHumanComparisonReview({
      comparisonReport: input.report,
      sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
      editedReviewInput: input.edited,
      generatedAt: "2026-08-06T15:40:00",
    }),
    /generatedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  const offset = finalizeConfiguredEdinetHumanComparisonReview({
    comparisonReport: input.report,
    sourceComparisonFile: "configured-fidelity-exact-comparison-v1.fixture.json",
    editedReviewInput: input.edited,
    generatedAt: "2026-08-07T00:40:00+09:00",
  });
  assert.equal(offset.generatedAt, "2026-08-07T00:40:00+09:00");
  console.log("edinet-configured-human-comparison-review: final generatedAt strict instant OK");
}

console.log("edinet-configured-human-comparison-review.test.ts passed");
