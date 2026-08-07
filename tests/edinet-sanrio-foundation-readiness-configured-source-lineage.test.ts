import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertSanrioFoundationConfiguredSourceLineage,
} from "../src/research/edinet-sanrio-foundation-readiness-configured-source-lineage.js";

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

function withHash<T extends JsonObject>(base: T, field: string): T & Record<string, string> {
  return { ...base, [field]: digest(base) };
}

function rehash(record: JsonObject, field: string): void {
  const { [field]: _ignored, ...withoutHash } = record;
  record[field] = digest(withoutHash);
}

function fixture(): { comparison: JsonObject; configured: JsonObject; sourceFile: string } {
  const anchorBase = {
    anchorId: "configured:001",
    reason: "fixture",
    expectedRelation: "visual_layout_variance_review",
    structured: {
      entryPath: "XBRL/PublicDoc/main.htm",
      lineNumber: 12,
      textHash: "1".repeat(64),
      normalizedTextHash: "2".repeat(64),
      normalizedLength: 18,
    },
    pdf: {
      pageNumber: 4,
      lineNumber: 7,
      textHash: "3".repeat(64),
      normalizedTextHash: "4".repeat(64),
      normalizedLength: 18,
    },
    rawExactMatch: false,
    normalizedExactMatch: false,
    comparisonResult: "not_exact_normalized_match_pending_visual_review",
    visualReviewRequired: true,
    contentEquivalent: "unknown_pending_human_review",
    accountingImpact: "unknown_pending_human_review",
    internalControlImpact: "unknown_pending_human_review",
    auditOpinionImpact: "unknown_pending_human_review",
    materiality: "unknown_pending_human_review",
    direction: "unknown_pending_human_review",
  };
  const sourceAnchor = withHash(anchorBase, "resultHash");
  const documentBase = {
    pairId: "pair:001",
    pairHash: "5".repeat(64),
    extractionHash: "6".repeat(64),
    docID: "S900DOC1",
    sourceAnchorSetHash: "7".repeat(64),
    anchorCount: 1,
    exactNormalizedMatchCount: 0,
    mismatchPendingVisualReviewCount: 1,
    comparisonStatus: "complete_exact_normalized_comparison",
    anchors: [sourceAnchor],
  };
  const sourceDocument = withHash(documentBase, "documentResultHash");
  const issuer = {
    issuerKey: "sanrio",
    name: "株式会社サンリオ",
    edinetCode: "E02655",
    secCode: "81360",
    boundaryHash: "8".repeat(64),
  };
  const comparisonBase = {
    schemaVersion: 1,
    source: "edinet",
    normalizationVersion: "unicode-nfkc-horizontal-whitespace-v1",
    comparisonMethod: "exact_normalized_only",
    executionMode: "explicit_local_command",
    registryHash: "9".repeat(64),
    issuer,
    sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    sourceAnchorFinalHash: "a".repeat(64),
    generatedAt: "2026-08-07T00:10:00.000Z",
    reviewer: "anchor-human",
    reviewedAt: "2026-08-07T00:11:00.000Z",
    documentCount: 1,
    anchorCount: 1,
    exactNormalizedMatchCount: 0,
    mismatchPendingVisualReviewCount: 1,
    comparisonStatus: "complete_exact_normalized_comparison",
    reviewStatus: "pending_human_comparison_review",
    documents: [sourceDocument],
    globalBlockers: ["official_pdf_visual_review_required_for_every_anchor"],
    fuzzyMatchingUsed: false,
    semanticEquivalenceInferred: false,
    officialPdfVisualReviewComplete: false,
    automaticEquivalenceDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  const comparison = withHash(comparisonBase, "reportHash");
  const sourceFile = "configured-fidelity-exact-comparison-v1.fixture.json";

  const configuredSourceAnchor = {
    anchorId: sourceAnchor.anchorId,
    sourceResultHash: sourceAnchor.resultHash,
    sourceComparisonResult: sourceAnchor.comparisonResult,
    expectedRelation: sourceAnchor.expectedRelation,
    rawExactMatch: sourceAnchor.rawExactMatch,
    normalizedExactMatch: sourceAnchor.normalizedExactMatch,
    structured: sourceAnchor.structured,
    pdf: sourceAnchor.pdf,
    visualConfirmation: true,
    visualDecision: "visually_equivalent",
    equivalenceDecision: "equivalent",
    confirmedFacts: ["fixture fact"],
    previouslyKnownFacts: [],
    assumptions: [],
    opinions: [],
    exactAmounts: [],
    accountingImpact: "unknown",
    internalControlImpact: "unknown",
    auditOpinionImpact: "unknown",
    materiality: "unknown",
    direction: "unknown",
    reviewNotes: "",
    completed: true,
  };
  const configured = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: comparison.registryHash,
    issuer,
    sourceComparisonFile: sourceFile,
    sourceComparisonHash: comparison.reportHash,
    generatedAt: "2026-08-07T00:20:00.000Z",
    reviewer: "configured-human",
    reviewedAt: "2026-08-07T00:21:00.000Z",
    reviewStatus: "complete_human_comparison_review",
    documentCount: 1,
    anchorCount: 1,
    completedAnchorCount: 1,
    documents: [{
      pairId: sourceDocument.pairId,
      pairHash: sourceDocument.pairHash,
      extractionHash: sourceDocument.extractionHash,
      docID: sourceDocument.docID,
      sourceDocumentResultHash: sourceDocument.documentResultHash,
      anchorCount: 1,
      completedAnchorCount: 1,
      anchors: [configuredSourceAnchor],
    }],
    automaticFactPromotionAuthorized: false,
    automaticImpactDecisionAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  return { comparison, configured, sourceFile };
}

{
  const { comparison, configured, sourceFile } = fixture();
  assert.doesNotThrow(() => assertSanrioFoundationConfiguredSourceLineage({
    comparisonReport: comparison,
    sourceComparisonFile: sourceFile,
    configuredReview: configured,
  }));
  console.log("edinet-sanrio-foundation-readiness-configured-source-lineage: exact comparison lineage passes OK");
}

{
  const { comparison, configured, sourceFile } = fixture();
  comparison.reviewer = "tampered";
  assert.throws(
    () => assertSanrioFoundationConfiguredSourceLineage({ comparisonReport: comparison, sourceComparisonFile: sourceFile, configuredReview: configured }),
    /comparisonReport\.reportHash mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-source-lineage: source comparison outer hash drift blocked OK");
}

{
  const { comparison, configured, sourceFile } = fixture();
  const document = (comparison.documents as JsonObject[])[0]!;
  const sourceAnchor = (document.anchors as JsonObject[])[0]!;
  sourceAnchor.expectedRelation = "exact_normalized_match";
  rehash(comparison, "reportHash");
  assert.throws(
    () => assertSanrioFoundationConfiguredSourceLineage({ comparisonReport: comparison, sourceComparisonFile: sourceFile, configuredReview: configured }),
    /resultHash mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-source-lineage: nested comparison hash drift blocked OK");
}

{
  const { comparison, configured, sourceFile } = fixture();
  configured.sourceComparisonHash = "f".repeat(64);
  assert.throws(
    () => assertSanrioFoundationConfiguredSourceLineage({ comparisonReport: comparison, sourceComparisonFile: sourceFile, configuredReview: configured }),
    /sourceComparisonHash mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-source-lineage: configured parent hash mismatch blocked OK");
}

{
  const { comparison, configured, sourceFile } = fixture();
  const configuredAnchor = (((configured.documents as JsonObject[])[0]!.anchors as JsonObject[])[0]!);
  configuredAnchor.sourceResultHash = "e".repeat(64);
  assert.throws(
    () => assertSanrioFoundationConfiguredSourceLineage({ comparisonReport: comparison, sourceComparisonFile: sourceFile, configuredReview: configured }),
    /source lineage mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-source-lineage: configured anchor source drift blocked OK");
}

{
  const { comparison, configured, sourceFile } = fixture();
  const document = (comparison.documents as JsonObject[])[0]!;
  const sourceAnchor = (document.anchors as JsonObject[])[0]!;
  sourceAnchor.structured = {
    ...(sourceAnchor.structured as JsonObject),
    textHash: "b".repeat(64),
  };
  rehash(sourceAnchor, "resultHash");
  rehash(document, "documentResultHash");
  rehash(comparison, "reportHash");
  configured.sourceComparisonHash = comparison.reportHash;
  assert.throws(
    () => assertSanrioFoundationConfiguredSourceLineage({ comparisonReport: comparison, sourceComparisonFile: sourceFile, configuredReview: configured }),
    /anchor configured:001 source lineage mismatch/,
  );
  console.log("edinet-sanrio-foundation-readiness-configured-source-lineage: fully rehashed alternate comparison source blocked by configured snapshot OK");
}

console.log("edinet-sanrio-foundation-readiness-configured-source-lineage.test.ts passed");
