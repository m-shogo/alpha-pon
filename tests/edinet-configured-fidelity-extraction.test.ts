import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildConfiguredEdinetAnchorInputTemplate,
  buildConfiguredEdinetFidelityExtractionBundle,
  renderConfiguredEdinetAnchorInputTemplate,
} from "../src/research/edinet-configured-fidelity-extraction.js";
import {
  buildConfiguredStructuredTextArchive,
  countPdfPages,
  countTextLines,
  hasPdfMagic,
  hasZipMagic,
  normalizePdfLayoutText,
} from "../src/research/edinet-configured-fidelity-local-extraction.js";
import { buildConfiguredEdinetFidelityPlan } from "../src/research/edinet-configured-fidelity-plan.js";
import { buildConfiguredEdinetSyntheticFixture } from "../src/research/edinet-configured-synthetic-fixture.js";

type JsonObject = Record<string, unknown>;

function textHash(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function extractionSetup() {
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const plan = buildConfiguredEdinetFidelityPlan({
    registry: fixture.registry,
    reviewWorkspace: fixture.reviewWorkspace,
    sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    generatedAt: "2026-08-06T15:10:00.000Z",
  });
  const extractedDocuments = plan.documents.map((document, index) => {
    const firstText = `Synthetic structured line ${index + 1}`;
    const secondText = `Synthetic structured note ${index + 1}`;
    const structuredContent = `${firstText}\n${secondText}\n`;
    const pdfContent = `Synthetic PDF line ${index + 1}\n\fSynthetic PDF page two ${index + 1}\n`;
    return {
      pairId: document.pairId,
      pairHash: document.pairHash,
      docID: document.docID,
      structuredBinarySha256: document.structuredSource.binarySha256,
      pdfBinarySha256: document.officialPdf.binarySha256,
      structuredTextFile: `${document.docID}.configured-structured-visible-text-v1.json`,
      structuredTextFileSha256: textHash(structuredContent),
      structuredTextFileByteLength: Buffer.byteLength(structuredContent, "utf-8"),
      structuredEntries: [
        {
          path: `XBRL/PublicDoc/${document.docID}-main.htm`,
          textHash: textHash(firstText),
          lineCount: 1,
          byteLength: Buffer.byteLength(firstText, "utf-8"),
        },
        {
          path: `XBRL/PublicDoc/${document.docID}-note.htm`,
          textHash: textHash(secondText),
          lineCount: 1,
          byteLength: Buffer.byteLength(secondText, "utf-8"),
        },
      ],
      pdfLayoutTextFile: `${document.docID}.configured-pdf-layout-v1.txt`,
      pdfLayoutTextFileSha256: textHash(pdfContent),
      pdfLayoutTextFileByteLength: Buffer.byteLength(pdfContent, "utf-8"),
      pdfLineCount: 2,
      pdfPageCount: 2,
    };
  });
  return { fixture, plan, extractedDocuments };
}

{
  assert.equal(hasZipMagic(Uint8Array.from([0x50, 0x4b, 0x03, 0x04])), true);
  assert.equal(hasZipMagic(Uint8Array.from([0x50, 0x4b, 0x05, 0x06])), true);
  assert.equal(hasZipMagic(new TextEncoder().encode("ALPHA PON SYNTHETIC")), false);
  assert.equal(hasPdfMagic(new TextEncoder().encode("%PDF-1.7")), true);
  assert.equal(hasPdfMagic(new TextEncoder().encode("NOT AN OFFICIAL PDF")), false);
  const normalized = normalizePdfLayoutText("  page one  \r\n\r\n\f page two\t \r\n\f");
  assert.equal(normalized, "  page one\n\n\f page two");
  assert.equal(normalizePdfLayoutText("\f\r\n\f\n"), "");
  assert.equal(countPdfPages(normalized), 2);
  assert.equal(countPdfPages("page one\fpage two\f"), 2);
  assert.equal(countPdfPages("page one\fpage two\f\n"), 2);
  assert.equal(countTextLines("a\nb"), 2);
  console.log("edinet-configured-fidelity-extraction: ZIP/PDF magic and layout normalization OK");
}

{
  const archive = buildConfiguredStructuredTextArchive({
    docID: "S900ROOT",
    sourceBinarySha256: "a".repeat(64),
    generatedAt: "2026-08-06T15:20:00.000Z",
    entries: [
      { path: "XBRL/PublicDoc/b.htm", text: " line b \r\n" },
      { path: "XBRL/PublicDoc/a.htm", text: "line a\nline a2" },
    ],
  });
  assert.equal(archive.entryCount, 2);
  assert.equal(archive.lineCount, 3);
  assert.deepEqual(archive.entries.map(entry => entry.path), [
    "XBRL/PublicDoc/a.htm",
    "XBRL/PublicDoc/b.htm",
  ]);
  assert.match(archive.archiveHash, /^[a-f0-9]{64}$/);
  assert.throws(
    () => buildConfiguredStructuredTextArchive({
      docID: "S900ROOT",
      sourceBinarySha256: "a".repeat(64),
      generatedAt: "2026-08-06T15:20:00.000Z",
      entries: [{ path: "../escape.htm", text: "unsafe" }],
    }),
    /unsafe structured entry path/,
  );
  console.log("edinet-configured-fidelity-extraction: structured archive hashes, ordering and path safety OK");
}

{
  const { plan, extractedDocuments } = extractionSetup();
  const bundle = buildConfiguredEdinetFidelityExtractionBundle({
    fidelityPlan: plan,
    sourceFidelityPlanFile: "configured-source-fidelity-plan-v1.fixture.json",
    extractedDocuments,
    generatedAt: "2026-08-06T15:30:00.000Z",
  });
  assert.equal(bundle.documentCount, 2);
  assert.equal(bundle.structuredEntryCount, 4);
  assert.equal(bundle.structuredLineCount, 4);
  assert.equal(bundle.pdfLineCount, 4);
  assert.equal(bundle.pdfPageCount, 4);
  assert.equal(bundle.extractionStatus, "complete");
  assert.equal(bundle.anchorInputStatus, "pending_human_input");
  assert.equal(bundle.comparisonStatus, "not_started");
  assert.equal(bundle.reviewStatus, "pending_anchor_input");
  assert.equal(bundle.automaticAnchorGenerationAuthorized, false);
  assert.equal(bundle.automaticComparisonAuthorized, false);
  assert.equal(bundle.foundationPreviewEligible, false);
  assert.equal(bundle.appendAuthorized, false);
  assert.ok(bundle.documents.every(document =>
    document.anchorCount === 0
    && document.comparisonStatus === "not_started"
    && /^[a-f0-9]{64}$/.test(document.extractionHash),
  ));
  assert.match(bundle.extractionBundleHash, /^[a-f0-9]{64}$/);
  console.log("edinet-configured-fidelity-extraction: complete extraction remains anchor-pending and non-comparable OK");

  const template = buildConfiguredEdinetAnchorInputTemplate({
    extractionBundle: bundle,
    sourceExtractionBundleFile: "configured-fidelity-extraction-v1.fixture.json",
    generatedAt: "2026-08-06T15:31:00.000Z",
  });
  assert.equal(template.documentCount, 2);
  assert.equal(template.anchorCount, 0);
  assert.equal(template.reviewer, "");
  assert.equal(template.reviewedAt, null);
  assert.equal(template.reviewStatus, "draft_human_input");
  assert.equal(template.automaticAnchorGenerationAuthorized, false);
  assert.equal(template.automaticComparisonAuthorized, false);
  assert.equal(template.foundationPreviewEligible, false);
  assert.equal(template.appendAuthorized, false);
  assert.ok(template.documents.every(document =>
    document.minimumAnchorCount === 1
    && document.maximumAnchorCount === 40
    && document.anchorCount === 0
    && document.anchors.length === 0,
  ));
  assert.match(template.recordHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetAnchorInputTemplate(template);
  assert.match(markdown, /does not compare text/);
  assert.match(markdown, /Exact structured source line/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  console.log("edinet-configured-fidelity-extraction: empty human anchor template remains non-automatic OK");
}

{
  const { plan, extractedDocuments } = extractionSetup();
  const missing = extractedDocuments.slice(0, -1);
  assert.throws(
    () => buildConfiguredEdinetFidelityExtractionBundle({
      fidelityPlan: plan,
      sourceFidelityPlanFile: "configured-source-fidelity-plan-v1.fixture.json",
      extractedDocuments: missing,
    }),
    /extracted document count does not match/,
  );
  console.log("edinet-configured-fidelity-extraction: incomplete extraction bundle blocked OK");
}

{
  const { plan, extractedDocuments } = extractionSetup();
  const changed = structuredClone(extractedDocuments);
  changed[0]!.structuredBinarySha256 = "f".repeat(64);
  assert.throws(
    () => buildConfiguredEdinetFidelityExtractionBundle({
      fidelityPlan: plan,
      sourceFidelityPlanFile: "configured-source-fidelity-plan-v1.fixture.json",
      extractedDocuments: changed,
    }),
    /source binary hash does not match/,
  );
  console.log("edinet-configured-fidelity-extraction: source binary drift blocked OK");
}

{
  const { plan, extractedDocuments } = extractionSetup();
  const tampered = structuredClone(plan) as unknown as JsonObject;
  tampered.anchorCount = 1;
  assert.throws(
    () => buildConfiguredEdinetFidelityExtractionBundle({
      fidelityPlan: tampered,
      sourceFidelityPlanFile: "configured-source-fidelity-plan-v1.fixture.json",
      extractedDocuments,
    }),
    /safety boundary is invalid|fidelityPlanHash mismatch/,
  );
  console.log("edinet-configured-fidelity-extraction: fidelity plan tampering blocked OK");
}

{
  const { plan, extractedDocuments } = extractionSetup();
  const bundle = buildConfiguredEdinetFidelityExtractionBundle({
    fidelityPlan: plan,
    sourceFidelityPlanFile: "configured-source-fidelity-plan-v1.fixture.json",
    extractedDocuments,
  });
  const tampered = structuredClone(bundle) as unknown as JsonObject;
  tampered.comparisonStatus = "complete";
  assert.throws(
    () => buildConfiguredEdinetAnchorInputTemplate({
      extractionBundle: tampered,
      sourceExtractionBundleFile: "configured-fidelity-extraction-v1.fixture.json",
    }),
    /safety boundary is invalid|extractionBundleHash mismatch/,
  );
  console.log("edinet-configured-fidelity-extraction: comparison cannot be smuggled into anchor template OK");
}

console.log("edinet-configured-fidelity-extraction.test.ts passed");
