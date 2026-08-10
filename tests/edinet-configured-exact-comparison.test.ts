import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetExactComparisonReport,
  normalizeConfiguredEdinetAnchorText,
  renderConfiguredEdinetExactComparisonReport,
} from "../src/research/edinet-configured-exact-comparison.js";

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

function textDigest(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function anchor(input: {
  id: string;
  structuredText: string;
  pdfText: string;
  expectedRelation?: "exact_normalized_match" | "visual_layout_variance_review";
}): JsonObject {
  return {
    anchorId: input.id,
    reason: `review ${input.id}`,
    structured: {
      entryPath: "XBRL/PublicDoc/example.htm",
      lineNumber: 1,
      text: input.structuredText,
      textHash: textDigest(input.structuredText),
      entryTextHash: "a".repeat(64),
    },
    pdf: {
      pageNumber: 1,
      lineNumber: 2,
      text: input.pdfText,
      textHash: textDigest(input.pdfText),
    },
    expectedRelation: input.expectedRelation ?? "exact_normalized_match",
    lineageVerified: true,
  };
}

function finalRecord(): JsonObject {
  const anchors = [
    anchor({
      id: "S900ROOT:anchor:001",
      structuredText: "１００　百万円",
      pdfText: "100   百万円",
    }),
    anchor({
      id: "S900ROOT:anchor:002",
      structuredText: "売上高 100百万円。",
      pdfText: "売上高 101百万円。",
      expectedRelation: "visual_layout_variance_review",
    }),
  ];
  const documentBase = {
    pairId: "fidelity:synthetic-co:S900ROOT",
    pairHash: "b".repeat(64),
    extractionHash: "c".repeat(64),
    docID: "S900ROOT",
    structuredTextFile: "S900ROOT.configured-structured-visible-text-v1.json",
    structuredTextFileSha256: "d".repeat(64),
    pdfLayoutTextFile: "S900ROOT.configured-pdf-layout-v1.txt",
    pdfLayoutTextFileSha256: "e".repeat(64),
    anchorCount: anchors.length,
    anchors,
    status: "complete_human_input",
  };
  const document = { ...documentBase, anchorSetHash: digest(documentBase) };
  const base = {
    schemaVersion: 1,
    source: "edinet",
    registryHash: "f".repeat(64),
    issuer: {
      issuerKey: "synthetic-co",
      name: "合成テスト株式会社",
      edinetCode: "E90000",
      secCode: "90000",
      boundaryHash: "1".repeat(64),
    },
    sourceExtractionBundleFile: "configured-fidelity-extraction-v1.fixture.json",
    sourceExtractionBundleHash: "2".repeat(64),
    sourceAnchorInputFile: "configured-fidelity-anchor-input-v1.fixture.json",
    sourceAnchorInputHash: "3".repeat(64),
    generatedAt: "2026-08-06T15:00:00.000Z",
    reviewer: "synthetic-reviewer",
    reviewedAt: "2026-08-06T15:01:00.000Z",
    documentCount: 1,
    anchorCount: anchors.length,
    reviewStatus: "complete_anchor_input",
    comparisonStatus: "not_started",
    documents: [document],
    globalBlockers: ["exact_normalized_comparison_not_started"],
    automaticComparisonAuthorized: false,
    foundationPreviewEligible: false,
    appendAuthorized: false,
  };
  return { ...base, recordHash: digest(base) };
}

function rehashRecord(record: JsonObject): void {
  const { recordHash: _ignored, ...withoutHash } = record;
  record.recordHash = digest(withoutHash);
}

function rehashDocument(record: JsonObject): void {
  const document = (record.documents as JsonObject[])[0]!;
  const { anchorSetHash: _ignored, ...withoutHash } = document;
  document.anchorSetHash = digest(withoutHash);
  rehashRecord(record);
}

{
  assert.equal(normalizeConfiguredEdinetAnchorText("１００\t　百万円"), "100 百万円");
  assert.equal(normalizeConfiguredEdinetAnchorText("ABC"), "ABC");
  assert.notEqual(normalizeConfiguredEdinetAnchorText("ABC"), normalizeConfiguredEdinetAnchorText("abc"));
  assert.notEqual(normalizeConfiguredEdinetAnchorText("100円。"), normalizeConfiguredEdinetAnchorText("100円"));
  assert.throws(() => normalizeConfiguredEdinetAnchorText("a\nb"), /single extracted line/);
  console.log("edinet-configured-exact-comparison: conservative normalization contract OK");
}

{
  const report = buildConfiguredEdinetExactComparisonReport({
    anchorFinal: finalRecord(),
    sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    generatedAt: "2026-08-06T15:10:00.000Z",
  });
  assert.equal(report.issuer.issuerKey, "synthetic-co");
  assert.equal(report.normalizationVersion, "unicode-nfkc-horizontal-whitespace-v1");
  assert.equal(report.comparisonMethod, "exact_normalized_only");
  assert.equal(report.documentCount, 1);
  assert.equal(report.anchorCount, 2);
  assert.equal(report.exactNormalizedMatchCount, 1);
  assert.equal(report.mismatchPendingVisualReviewCount, 1);
  assert.equal(report.comparisonStatus, "complete_exact_normalized_comparison");
  assert.equal(report.reviewStatus, "pending_human_comparison_review");
  assert.equal(report.fuzzyMatchingUsed, false);
  assert.equal(report.semanticEquivalenceInferred, false);
  assert.equal(report.officialPdfVisualReviewComplete, false);
  assert.equal(report.automaticEquivalenceDecisionAuthorized, false);
  assert.equal(report.foundationPreviewEligible, false);
  assert.equal(report.appendAuthorized, false);
  const [matched, mismatched] = report.documents[0]!.anchors;
  assert.equal(matched!.rawExactMatch, false);
  assert.equal(matched!.normalizedExactMatch, true);
  assert.equal(matched!.comparisonResult, "exact_normalized_match");
  assert.equal(mismatched!.normalizedExactMatch, false);
  assert.equal(mismatched!.comparisonResult, "not_exact_normalized_match_pending_visual_review");
  assert.equal(mismatched!.contentEquivalent, "unknown_pending_human_review");
  assert.equal(mismatched!.materiality, "unknown_pending_human_review");
  assert.match(report.reportHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetExactComparisonReport(report);
  assert.match(markdown, /not proof of visual or semantic equivalence/);
  assert.match(markdown, /Every anchor still requires official PDF visual review/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  console.log("edinet-configured-exact-comparison: exact match and mismatch remain review-pending OK");
}

{
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: finalRecord(),
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
      generatedAt: "2026-08-06T15:10:00",
    }),
    /generatedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  console.log("edinet-configured-exact-comparison: timezone-less generatedAt blocked OK");
}

{
  const invalid = finalRecord();
  invalid.reviewedAt = "2026-02-31T15:01:00.000Z";
  rehashRecord(invalid);
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: invalid,
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
      generatedAt: "2026-08-06T15:10:00.000Z",
    }),
    /anchorFinal\.reviewedAt must be a strict ISO timestamp with an explicit timezone offset or Z/,
  );
  console.log("edinet-configured-exact-comparison: impossible reviewedAt blocked OK");
}

{
  const tampered = finalRecord();
  tampered.anchorCount = 99;
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: tampered,
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    }),
    /recordHash mismatch/,
  );
  console.log("edinet-configured-exact-comparison: outer record tampering blocked OK");
}

{
  const tampered = finalRecord();
  const document = (tampered.documents as JsonObject[])[0]!;
  document.anchorSetHash = "0".repeat(64);
  rehashRecord(tampered);
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: tampered,
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    }),
    /anchorSetHash mismatch/,
  );
  console.log("edinet-configured-exact-comparison: nested anchor-set tampering blocked OK");
}

{
  const tampered = finalRecord();
  const document = (tampered.documents as JsonObject[])[0]!;
  const first = (document.anchors as JsonObject[])[0]!;
  const structured = first.structured as JsonObject;
  structured.text = "101 百万円";
  rehashDocument(tampered);
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: tampered,
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    }),
    /structured\.text hash mismatch/,
  );
  console.log("edinet-configured-exact-comparison: exact source text hash mismatch blocked OK");
}

{
  const tampered = finalRecord();
  const document = (tampered.documents as JsonObject[])[0]!;
  const first = (document.anchors as JsonObject[])[0]!;
  first.lineageVerified = false;
  rehashDocument(tampered);
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: tampered,
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    }),
    /lineageVerified must be true/,
  );
  console.log("edinet-configured-exact-comparison: unverified anchor lineage blocked OK");
}

{
  const unsafe = finalRecord();
  unsafe.appendAuthorized = true;
  rehashRecord(unsafe);
  assert.throws(
    () => buildConfiguredEdinetExactComparisonReport({
      anchorFinal: unsafe,
      sourceAnchorFinalFile: "configured-fidelity-anchor-final-v1.fixture.json",
    }),
    /safety boundary is invalid/,
  );
  console.log("edinet-configured-exact-comparison: unsafe promotion boundary blocked OK");
}

console.log("edinet-configured-exact-comparison.test.ts passed");
