import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_ANCHORS_PER_DOCUMENT = 40;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetStructuredEntryDescriptor = {
  path: string;
  textHash: string;
  lineCount: number;
  byteLength: number;
};

export type ConfiguredEdinetExtractedDocumentInput = {
  pairId: string;
  pairHash: string;
  docID: string;
  structuredBinarySha256: string;
  pdfBinarySha256: string;
  structuredTextFile: string;
  structuredTextFileSha256: string;
  structuredTextFileByteLength: number;
  structuredEntries: ConfiguredEdinetStructuredEntryDescriptor[];
  pdfLayoutTextFile: string;
  pdfLayoutTextFileSha256: string;
  pdfLayoutTextFileByteLength: number;
  pdfLineCount: number;
  pdfPageCount: number;
};

export type ConfiguredEdinetFidelityExtractionDocument = ConfiguredEdinetExtractedDocumentInput & {
  structuredEntryCount: number;
  structuredLineCount: number;
  extractionStatus: "complete";
  anchorCount: 0;
  comparisonStatus: "not_started";
  blockers: string[];
  extractionHash: string;
};

export type ConfiguredEdinetFidelityExtractionBundle = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  sourceFidelityPlanFile: string;
  sourceFidelityPlanHash: string;
  sourceReviewWorkspaceFile: string;
  sourceReviewWorkspaceHash: string;
  generatedAt: string;
  documentCount: number;
  structuredEntryCount: number;
  structuredLineCount: number;
  pdfLineCount: number;
  pdfPageCount: number;
  extractionStatus: "complete";
  anchorInputStatus: "pending_human_input";
  comparisonStatus: "not_started";
  reviewStatus: "pending_anchor_input";
  documents: ConfiguredEdinetFidelityExtractionDocument[];
  globalBlockers: string[];
  automaticAnchorGenerationAuthorized: false;
  automaticComparisonAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  extractionBundleHash: string;
};

export type ConfiguredEdinetAnchorInput = {
  anchorId: string;
  reason: string;
  structured: {
    entryPath: string;
    lineNumber: number;
    text: string;
    textHash: string;
  };
  pdf: {
    pageNumber: number;
    lineNumber: number;
    text: string;
    textHash: string;
  };
  expectedRelation: "exact_normalized_match" | "visual_layout_variance_review";
};

export type ConfiguredEdinetAnchorDocumentInput = {
  pairId: string;
  pairHash: string;
  extractionHash: string;
  docID: string;
  structuredTextFile: string;
  structuredTextFileSha256: string;
  pdfLayoutTextFile: string;
  pdfLayoutTextFileSha256: string;
  minimumAnchorCount: 1;
  maximumAnchorCount: 40;
  anchorCount: 0;
  anchors: [];
  status: "draft_human_input";
};

export type ConfiguredEdinetAnchorInputTemplate = {
  schemaVersion: 1;
  source: "edinet";
  registryHash: string;
  issuer: ConfiguredEdinetFidelityExtractionBundle["issuer"];
  sourceExtractionBundleFile: string;
  sourceExtractionBundleHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: null;
  documentCount: number;
  anchorCount: 0;
  reviewStatus: "draft_human_input";
  documents: ConfiguredEdinetAnchorDocumentInput[];
  globalBlockers: string[];
  automaticAnchorGenerationAuthorized: false;
  automaticComparisonAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  recordHash: string;
};

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

function hash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function docID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
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

function verifyFidelityPlan(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("fidelityPlan schema/source is unsupported");
  }
  if (
    record.anchorCount !== 0
    || record.anchorInputStatus !== "pending_human_input"
    || record.extractionStatus !== "not_started"
    || record.reviewStatus !== "pending_source_fidelity_review"
    || record.automaticExtractionAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("fidelityPlan safety boundary is invalid");
  }
  const expected = hash(record.fidelityPlanHash, "fidelityPlan.fidelityPlanHash");
  const { fidelityPlanHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("fidelityPlan.fidelityPlanHash mismatch");
  return expected;
}

function planDocuments(record: JsonObject): Map<string, JsonObject> {
  const documents = new Map<string, JsonObject>();
  for (const [index, value] of array(record.documents, "fidelityPlan.documents").entries()) {
    const document = object(value, `fidelityPlan.documents[${index}]`);
    const id = docID(document.docID, `fidelityPlan.documents[${index}].docID`);
    if (documents.has(id)) throw new Error(`fidelityPlan has duplicate document ${id}`);
    if (object(document.anchorInput, `fidelityPlan document ${id}.anchorInput`).anchorCount !== 0) {
      throw new Error(`fidelityPlan document ${id} already contains anchors`);
    }
    if (object(document.extraction, `fidelityPlan document ${id}.extraction`).automaticExecutionAuthorized !== false) {
      throw new Error(`fidelityPlan document ${id} automatic extraction boundary is invalid`);
    }
    documents.set(id, document);
  }
  if (documents.size === 0) throw new Error("fidelityPlan has no documents");
  return documents;
}

function parseEntry(value: unknown, field: string): ConfiguredEdinetStructuredEntryDescriptor {
  const entry = object(value, field);
  const path = required(entry.path, `${field}.path`);
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`${field}.path is unsafe`);
  }
  return {
    path,
    textHash: hash(entry.textHash, `${field}.textHash`),
    lineCount: positiveInteger(entry.lineCount, `${field}.lineCount`),
    byteLength: positiveInteger(entry.byteLength, `${field}.byteLength`),
  };
}

function parseExtractedDocument(
  value: ConfiguredEdinetExtractedDocumentInput,
  planDocument: JsonObject,
  field: string,
): ConfiguredEdinetFidelityExtractionDocument {
  const structured = object(planDocument.structuredSource, `${field}.plan.structuredSource`);
  const pdf = object(planDocument.officialPdf, `${field}.plan.officialPdf`);
  if (
    value.pairId !== text(planDocument.pairId)
    || value.pairHash !== text(planDocument.pairHash)
    || value.docID !== text(planDocument.docID)
  ) {
    throw new Error(`${field} identity does not match fidelity plan`);
  }
  if (
    hash(value.structuredBinarySha256, `${field}.structuredBinarySha256`) !== text(structured.binarySha256)
    || hash(value.pdfBinarySha256, `${field}.pdfBinarySha256`) !== text(pdf.binarySha256)
  ) {
    throw new Error(`${field} source binary hash does not match fidelity plan`);
  }
  const structuredEntries = value.structuredEntries.map((entry, index) =>
    parseEntry(entry, `${field}.structuredEntries[${index}]`),
  );
  if (structuredEntries.length === 0) throw new Error(`${field} has no structured entries`);
  const paths = structuredEntries.map(entry => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error(`${field} has duplicate structured entry paths`);
  const structuredLineCount = structuredEntries.reduce((sum, entry) => sum + entry.lineCount, 0);
  const base = {
    pairId: value.pairId,
    pairHash: hash(value.pairHash, `${field}.pairHash`),
    docID: docID(value.docID, `${field}.docID`),
    structuredBinarySha256: hash(value.structuredBinarySha256, `${field}.structuredBinarySha256`),
    pdfBinarySha256: hash(value.pdfBinarySha256, `${field}.pdfBinarySha256`),
    structuredTextFile: localBasename(value.structuredTextFile, `${field}.structuredTextFile`),
    structuredTextFileSha256: hash(value.structuredTextFileSha256, `${field}.structuredTextFileSha256`),
    structuredTextFileByteLength: positiveInteger(
      value.structuredTextFileByteLength,
      `${field}.structuredTextFileByteLength`,
    ),
    structuredEntries,
    pdfLayoutTextFile: localBasename(value.pdfLayoutTextFile, `${field}.pdfLayoutTextFile`),
    pdfLayoutTextFileSha256: hash(value.pdfLayoutTextFileSha256, `${field}.pdfLayoutTextFileSha256`),
    pdfLayoutTextFileByteLength: positiveInteger(
      value.pdfLayoutTextFileByteLength,
      `${field}.pdfLayoutTextFileByteLength`,
    ),
    pdfLineCount: positiveInteger(value.pdfLineCount, `${field}.pdfLineCount`),
    pdfPageCount: positiveInteger(value.pdfPageCount, `${field}.pdfPageCount`),
    structuredEntryCount: structuredEntries.length,
    structuredLineCount,
    extractionStatus: "complete" as const,
    anchorCount: 0 as const,
    comparisonStatus: "not_started" as const,
    blockers: [
      "human_anchor_input_required",
      "exact_anchor_comparison_not_started",
      "official_pdf_visual_review_required",
      "equivalence_and_impact_decisions_not_recorded",
    ].sort(),
  };
  return { ...base, extractionHash: digest(base) };
}

export function buildConfiguredEdinetFidelityExtractionBundle(input: {
  fidelityPlan: unknown;
  sourceFidelityPlanFile: string;
  extractedDocuments: ConfiguredEdinetExtractedDocumentInput[];
  generatedAt?: string;
}): ConfiguredEdinetFidelityExtractionBundle {
  const plan = object(input.fidelityPlan, "fidelityPlan");
  const sourceFidelityPlanHash = verifyFidelityPlan(plan);
  const planned = planDocuments(plan);
  const sourceFidelityPlanFile = localBasename(input.sourceFidelityPlanFile, "sourceFidelityPlanFile");
  if (!sourceFidelityPlanFile.endsWith(".json")) throw new Error("sourceFidelityPlanFile must be JSON");
  if (input.extractedDocuments.length !== planned.size) {
    throw new Error("extracted document count does not match fidelity plan");
  }
  const seen = new Set<string>();
  const documents = input.extractedDocuments.map((value, index) => {
    if (seen.has(value.docID)) throw new Error(`duplicate extracted document ${value.docID}`);
    seen.add(value.docID);
    const planDocument = planned.get(value.docID);
    if (!planDocument) throw new Error(`unexpected extracted document ${value.docID}`);
    return parseExtractedDocument(value, planDocument, `extractedDocuments[${index}]`);
  }).sort((left, right) => left.docID.localeCompare(right.docID));
  const issuer = object(plan.issuer, "fidelityPlan.issuer");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: hash(plan.registryHash, "fidelityPlan.registryHash"),
    issuer: {
      issuerKey: required(issuer.issuerKey, "fidelityPlan.issuer.issuerKey"),
      name: required(issuer.name, "fidelityPlan.issuer.name"),
      edinetCode: required(issuer.edinetCode, "fidelityPlan.issuer.edinetCode"),
      secCode: required(issuer.secCode, "fidelityPlan.issuer.secCode"),
      boundaryHash: hash(issuer.boundaryHash, "fidelityPlan.issuer.boundaryHash"),
    },
    sourceFidelityPlanFile,
    sourceFidelityPlanHash,
    sourceReviewWorkspaceFile: localBasename(
      plan.sourceReviewWorkspaceFile,
      "fidelityPlan.sourceReviewWorkspaceFile",
    ),
    sourceReviewWorkspaceHash: hash(
      plan.sourceReviewWorkspaceHash,
      "fidelityPlan.sourceReviewWorkspaceHash",
    ),
    generatedAt,
    documentCount: documents.length,
    structuredEntryCount: documents.reduce((sum, document) => sum + document.structuredEntryCount, 0),
    structuredLineCount: documents.reduce((sum, document) => sum + document.structuredLineCount, 0),
    pdfLineCount: documents.reduce((sum, document) => sum + document.pdfLineCount, 0),
    pdfPageCount: documents.reduce((sum, document) => sum + document.pdfPageCount, 0),
    extractionStatus: "complete" as const,
    anchorInputStatus: "pending_human_input" as const,
    comparisonStatus: "not_started" as const,
    reviewStatus: "pending_anchor_input" as const,
    documents,
    globalBlockers: [
      "human_anchor_input_required",
      "anchor_text_and_lineage_not_confirmed",
      "exact_comparison_not_started",
      "official_pdf_visual_review_not_completed",
      "equivalence_and_impact_decisions_not_recorded",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    automaticAnchorGenerationAuthorized: false as const,
    automaticComparisonAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, extractionBundleHash: digest(base) };
}

function verifyExtractionBundle(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("extractionBundle schema/source is unsupported");
  }
  if (
    record.extractionStatus !== "complete"
    || record.anchorInputStatus !== "pending_human_input"
    || record.comparisonStatus !== "not_started"
    || record.reviewStatus !== "pending_anchor_input"
    || record.automaticAnchorGenerationAuthorized !== false
    || record.automaticComparisonAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("extractionBundle safety boundary is invalid");
  }
  const expected = hash(record.extractionBundleHash, "extractionBundle.extractionBundleHash");
  const { extractionBundleHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("extractionBundle.extractionBundleHash mismatch");
  return expected;
}

export function buildConfiguredEdinetAnchorInputTemplate(input: {
  extractionBundle: unknown;
  sourceExtractionBundleFile: string;
  generatedAt?: string;
}): ConfiguredEdinetAnchorInputTemplate {
  const bundle = object(input.extractionBundle, "extractionBundle");
  const sourceExtractionBundleHash = verifyExtractionBundle(bundle);
  const sourceExtractionBundleFile = localBasename(
    input.sourceExtractionBundleFile,
    "sourceExtractionBundleFile",
  );
  if (!sourceExtractionBundleFile.endsWith(".json")) {
    throw new Error("sourceExtractionBundleFile must be JSON");
  }
  const documents = array(bundle.documents, "extractionBundle.documents").map((value, index) => {
    const document = object(value, `extractionBundle.documents[${index}]`);
    return {
      pairId: required(document.pairId, `extractionBundle.documents[${index}].pairId`),
      pairHash: hash(document.pairHash, `extractionBundle.documents[${index}].pairHash`),
      extractionHash: hash(
        document.extractionHash,
        `extractionBundle.documents[${index}].extractionHash`,
      ),
      docID: docID(document.docID, `extractionBundle.documents[${index}].docID`),
      structuredTextFile: localBasename(
        document.structuredTextFile,
        `extractionBundle.documents[${index}].structuredTextFile`,
      ),
      structuredTextFileSha256: hash(
        document.structuredTextFileSha256,
        `extractionBundle.documents[${index}].structuredTextFileSha256`,
      ),
      pdfLayoutTextFile: localBasename(
        document.pdfLayoutTextFile,
        `extractionBundle.documents[${index}].pdfLayoutTextFile`,
      ),
      pdfLayoutTextFileSha256: hash(
        document.pdfLayoutTextFileSha256,
        `extractionBundle.documents[${index}].pdfLayoutTextFileSha256`,
      ),
      minimumAnchorCount: 1 as const,
      maximumAnchorCount: MAX_ANCHORS_PER_DOCUMENT as 40,
      anchorCount: 0 as const,
      anchors: [] as [],
      status: "draft_human_input" as const,
    };
  }).sort((left, right) => left.docID.localeCompare(right.docID));
  const issuer = object(bundle.issuer, "extractionBundle.issuer");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    registryHash: hash(bundle.registryHash, "extractionBundle.registryHash"),
    issuer: {
      issuerKey: required(issuer.issuerKey, "extractionBundle.issuer.issuerKey"),
      name: required(issuer.name, "extractionBundle.issuer.name"),
      edinetCode: required(issuer.edinetCode, "extractionBundle.issuer.edinetCode"),
      secCode: required(issuer.secCode, "extractionBundle.issuer.secCode"),
      boundaryHash: hash(issuer.boundaryHash, "extractionBundle.issuer.boundaryHash"),
    },
    sourceExtractionBundleFile,
    sourceExtractionBundleHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    documentCount: documents.length,
    anchorCount: 0 as const,
    reviewStatus: "draft_human_input" as const,
    documents,
    globalBlockers: [
      "reviewer_identity_required",
      "one_or_more_human_anchors_required_per_document",
      "structured_and_pdf_lineage_must_be_confirmed",
      "anchor_text_hashes_must_be_recomputed",
      "exact_comparison_not_authorized_by_template",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    automaticAnchorGenerationAuthorized: false as const,
    automaticComparisonAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, recordHash: digest(base) };
}

export function renderConfiguredEdinetAnchorInputTemplate(
  template: ConfiguredEdinetAnchorInputTemplate,
): string {
  const lines = [
    `# ${template.issuer.name} EDINET anchor input template`,
    "",
    `- generatedAt: ${template.generatedAt}`,
    `- sourceExtractionBundleFile: ${template.sourceExtractionBundleFile}`,
    `- sourceExtractionBundleHash: ${template.sourceExtractionBundleHash}`,
    `- documentCount: ${template.documentCount}`,
    `- anchorCount: ${template.anchorCount}`,
    `- reviewStatus: ${template.reviewStatus}`,
    `- recordHash: ${template.recordHash}`,
    "- automaticAnchorGenerationAuthorized: false",
    "- automaticComparisonAuthorized: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "Edit the JSON only after opening the extracted structured and PDF-layout text files.",
    "Each document requires 1–40 human-selected anchors. The template itself does not compare text.",
    "",
  ];
  for (const document of template.documents) {
    lines.push(
      `## ${document.docID}`,
      "",
      `- pairId: ${document.pairId}`,
      `- extractionHash: ${document.extractionHash}`,
      `- structuredTextFile: ${document.structuredTextFile}`,
      `- structuredTextFileSha256: ${document.structuredTextFileSha256}`,
      `- pdfLayoutTextFile: ${document.pdfLayoutTextFile}`,
      `- pdfLayoutTextFileSha256: ${document.pdfLayoutTextFileSha256}`,
      `- anchors: ${document.anchorCount}/${document.minimumAnchorCount} required, max ${document.maximumAnchorCount}`,
      "",
      "Anchor JSON shape:",
      "```json",
      JSON.stringify({
        anchorId: `${document.docID}:anchor:001`,
        reason: "Human explanation of why this source statement matters",
        structured: {
          entryPath: "XBRL/PublicDoc/example.htm",
          lineNumber: 1,
          text: "Exact structured source line",
          textHash: "sha256 of exact text",
        },
        pdf: {
          pageNumber: 1,
          lineNumber: 1,
          text: "Exact PDF layout line",
          textHash: "sha256 of exact text",
        },
        expectedRelation: "exact_normalized_match",
      }, null, 2),
      "```",
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
