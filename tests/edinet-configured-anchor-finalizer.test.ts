import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  finalizeConfiguredEdinetAnchorInput,
  renderConfiguredEdinetAnchorFinalRecord,
  type ConfiguredEdinetAnchorSourceFiles,
} from "../src/research/edinet-configured-anchor-finalizer.js";
import {
  buildConfiguredEdinetAnchorInputTemplate,
  buildConfiguredEdinetFidelityExtractionBundle,
} from "../src/research/edinet-configured-fidelity-extraction.js";
import {
  buildConfiguredStructuredTextArchive,
} from "../src/research/edinet-configured-fidelity-local-extraction.js";
import { buildConfiguredEdinetFidelityPlan } from "../src/research/edinet-configured-fidelity-plan.js";
import { buildConfiguredEdinetSyntheticFixture } from "../src/research/edinet-configured-synthetic-fixture.js";

type JsonObject = Record<string, unknown>;

function textHash(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function setup() {
  const fixture = buildConfiguredEdinetSyntheticFixture();
  const plan = buildConfiguredEdinetFidelityPlan({
    registry: fixture.registry,
    reviewWorkspace: fixture.reviewWorkspace,
    sourceReviewWorkspaceFile: "configured-review-workspace-v2.json",
    generatedAt: "2026-08-06T15:10:00.000Z",
  });
  const structuredFiles: Record<string, unknown> = {};
  const pdfFiles: Record<string, string> = {};
  const sourceLines = new Map<string, { entryPath: string; structuredLine: string; pdfLine: string }>();
  const extractedDocuments = plan.documents.map((document, index) => {
    const entryPath = `XBRL/PublicDoc/${document.docID}-main.htm`;
    const structuredLine = `Structured exact line ${index + 1}`;
    const archive = buildConfiguredStructuredTextArchive({
      docID: document.docID,
      sourceBinarySha256: document.structuredSource.binarySha256,
      generatedAt: "2026-08-06T15:20:00.000Z",
      entries: [{
        path: entryPath,
        text: `${structuredLine}\nStructured secondary ${index + 1}`,
      }],
    });
    const structuredFile = `${document.docID}.configured-structured-visible-text-v1.json`;
    const structuredContent = `${JSON.stringify(archive, null, 2)}\n`;
    structuredFiles[structuredFile] = archive;

    const pdfLine = `  PDF exact line ${index + 1}`;
    const pdfFile = `${document.docID}.configured-pdf-layout-v1.txt`;
    const pdfContent = `${pdfLine}\nPDF secondary ${index + 1}\fPDF page two ${index + 1}\n`;
    pdfFiles[pdfFile] = pdfContent;
    sourceLines.set(document.docID, { entryPath, structuredLine, pdfLine });

    return {
      pairId: document.pairId,
      pairHash: document.pairHash,
      docID: document.docID,
      structuredBinarySha256: document.structuredSource.binarySha256,
      pdfBinarySha256: document.officialPdf.binarySha256,
      structuredTextFile: structuredFile,
      structuredTextFileSha256: textHash(structuredContent),
      structuredTextFileByteLength: Buffer.byteLength(structuredContent, "utf-8"),
      structuredEntries: archive.entries.map(entry => ({
        path: entry.path,
        textHash: entry.textHash,
        lineCount: entry.lineCount,
        byteLength: entry.byteLength,
      })),
      pdfLayoutTextFile: pdfFile,
      pdfLayoutTextFileSha256: textHash(pdfContent),
      pdfLayoutTextFileByteLength: Buffer.byteLength(pdfContent, "utf-8"),
      pdfLineCount: 3,
      pdfPageCount: 2,
    };
  });
  const bundle = buildConfiguredEdinetFidelityExtractionBundle({
    fidelityPlan: plan,
    sourceFidelityPlanFile: "configured-source-fidelity-plan-v1.fixture.json",
    extractedDocuments,
    generatedAt: "2026-08-06T15:30:00.000Z",
  });
  const template = buildConfiguredEdinetAnchorInputTemplate({
    extractionBundle: bundle,
    sourceExtractionBundleFile: "configured-fidelity-extraction-v1.fixture.json",
    generatedAt: "2026-08-06T15:31:00.000Z",
  });
  const edited = structuredClone(template) as unknown as JsonObject;
  edited.reviewer = "fixture-human-reviewer";
  edited.reviewedAt = "2026-08-06T15:40:00.000Z";
  for (const document of edited.documents as JsonObject[]) {
    const id = String(document.docID);
    const lines = sourceLines.get(id)!;
    document.status = "complete_human_input";
    document.anchorCount = 1;
    document.anchors = [{
      anchorId: `${id}:anchor:001`,
      reason: "Human-selected line for exact lineage verification",
      structured: {
        entryPath: lines.entryPath,
        lineNumber: 1,
        text: lines.structuredLine,
        textHash: textHash(lines.structuredLine),
      },
      pdf: {
        pageNumber: 1,
        lineNumber: 1,
        text: lines.pdfLine,
        textHash: textHash(lines.pdfLine),
      },
      expectedRelation: "exact_normalized_match",
    }];
  }
  const sourceFiles: ConfiguredEdinetAnchorSourceFiles = { structuredFiles, pdfFiles };
  return { bundle, template, edited, sourceFiles, sourceLines };
}

function finalize(input = setup()) {
  return finalizeConfiguredEdinetAnchorInput({
    extractionBundle: input.bundle,
    sourceExtractionBundleFile: "configured-fidelity-extraction-v1.fixture.json",
    editedAnchorInput: input.edited,
    sourceAnchorInputFile: "configured-fidelity-anchor-input-v1.fixture.json",
    sourceFiles: input.sourceFiles,
    generatedAt: "2026-08-06T15:45:00.000Z",
  });
}

{
  const input = setup();
  const staleTemplateHash = input.edited.recordHash;
  const final = finalize(input);
  assert.equal(typeof staleTemplateHash, "string");
  assert.equal(final.reviewer, "fixture-human-reviewer");
  assert.equal(final.reviewedAt, "2026-08-06T15:40:00.000Z");
  assert.equal(final.documentCount, 2);
  assert.equal(final.anchorCount, 2);
  assert.equal(final.reviewStatus, "complete_anchor_input");
  assert.equal(final.comparisonStatus, "not_started");
  assert.equal(final.automaticComparisonAuthorized, false);
  assert.equal(final.foundationPreviewEligible, false);
  assert.equal(final.appendAuthorized, false);
  assert.ok(final.documents.every(document =>
    document.status === "complete_human_input"
    && document.anchorCount === 1
    && document.anchors[0]!.lineageVerified
    && document.anchors[0]!.pdf.text.startsWith("  PDF")
    && /^[a-f0-9]{64}$/.test(document.anchorSetHash),
  ));
  assert.match(final.sourceAnchorInputHash, /^[a-f0-9]{64}$/);
  assert.match(final.recordHash, /^[a-f0-9]{64}$/);
  const markdown = renderConfiguredEdinetAnchorFinalRecord(final);
  assert.match(markdown, /No normalized comparison or equivalence decision has been executed/);
  assert.ok(!markdown.includes("株式会社サンリオ"));
  console.log("edinet-configured-anchor-finalizer: edited input rehash, indentation, and exact line lineage finalization OK");
}

{
  const input = setup();
  input.edited.reviewer = "";
  assert.throws(() => finalize(input), /anchorInput\.reviewer must be a non-empty string/);
  console.log("edinet-configured-anchor-finalizer: reviewer identity required OK");
}

{
  const input = setup();
  const first = (input.edited.documents as JsonObject[])[0]!;
  first.anchorCount = 0;
  first.anchors = [];
  assert.throws(() => finalize(input), /requires 1-40 anchors/);
  console.log("edinet-configured-anchor-finalizer: zero anchors blocked OK");
}

{
  const input = setup();
  const first = (input.edited.documents as JsonObject[])[0]!;
  const anchor = (first.anchors as JsonObject[])[0]!;
  const structured = anchor.structured as JsonObject;
  structured.text = "wrong line";
  structured.textHash = textHash("wrong line");
  assert.throws(() => finalize(input), /structured\.text does not match extracted line/);
  console.log("edinet-configured-anchor-finalizer: structured text mismatch blocked OK");
}

{
  const input = setup();
  const first = (input.edited.documents as JsonObject[])[0]!;
  const anchor = (first.anchors as JsonObject[])[0]!;
  const pdf = anchor.pdf as JsonObject;
  pdf.pageNumber = 99;
  assert.throws(() => finalize(input), /pdf\.pageNumber is out of range/);
  console.log("edinet-configured-anchor-finalizer: PDF page range enforced OK");
}

{
  const input = setup();
  const documents = input.edited.documents as JsonObject[];
  const secondAnchor = ((documents[1]!.anchors as JsonObject[])[0]!);
  secondAnchor.anchorId = String(((documents[0]!.anchors as JsonObject[])[0]!).anchorId);
  assert.throws(() => finalize(input), /duplicate anchorId/);
  console.log("edinet-configured-anchor-finalizer: duplicate anchor IDs blocked OK");
}

{
  const input = setup();
  const first = (input.edited.documents as JsonObject[])[0]!;
  first.structuredTextFile = "tampered.json";
  assert.throws(() => finalize(input), /source fields changed/);
  console.log("edinet-configured-anchor-finalizer: immutable source fields protected OK");
}

{
  const input = setup();
  const firstDocument = input.bundle.documents[0]!;
  const structured = input.sourceFiles.structuredFiles[firstDocument.structuredTextFile] as JsonObject;
  const entries = structured.entries as JsonObject[];
  entries[0]!.text = "tampered extracted source";
  assert.throws(() => finalize(input), /structured source file hash mismatch/);
  console.log("edinet-configured-anchor-finalizer: extracted structured file tampering blocked OK");
}

{
  const input = setup();
  const firstDocument = input.bundle.documents[0]!;
  input.sourceFiles.pdfFiles[firstDocument.pdfLayoutTextFile] = "tampered PDF text\n";
  assert.throws(() => finalize(input), /PDF layout source file hash mismatch/);
  console.log("edinet-configured-anchor-finalizer: extracted PDF text tampering blocked OK");
}

{
  const input = setup();
  const first = (input.edited.documents as JsonObject[])[0]!;
  const anchor = (first.anchors as JsonObject[])[0]!;
  const pdf = anchor.pdf as JsonObject;
  pdf.textHash = "f".repeat(64);
  assert.throws(() => finalize(input), /pdf\.textHash mismatch/);
  console.log("edinet-configured-anchor-finalizer: exact PDF line hash required OK");
}

console.log("edinet-configured-anchor-finalizer.test.ts passed");
