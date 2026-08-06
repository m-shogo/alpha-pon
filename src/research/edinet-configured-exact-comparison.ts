import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const NORMALIZATION_VERSION = "unicode-nfkc-horizontal-whitespace-v1" as const;
type JsonObject = Record<string, unknown>;

export type ConfiguredEdinetExactComparisonAnchor = {
  anchorId: string;
  reason: string;
  expectedRelation: "exact_normalized_match" | "visual_layout_variance_review";
  structured: {
    entryPath: string;
    lineNumber: number;
    textHash: string;
    normalizedTextHash: string;
    normalizedLength: number;
  };
  pdf: {
    pageNumber: number;
    lineNumber: number;
    textHash: string;
    normalizedTextHash: string;
    normalizedLength: number;
  };
  rawExactMatch: boolean;
  normalizedExactMatch: boolean;
  comparisonResult:
    | "exact_normalized_match"
    | "not_exact_normalized_match_pending_visual_review";
  visualReviewRequired: true;
  contentEquivalent: "unknown_pending_human_review";
  accountingImpact: "unknown_pending_human_review";
  internalControlImpact: "unknown_pending_human_review";
  auditOpinionImpact: "unknown_pending_human_review";
  materiality: "unknown_pending_human_review";
  direction: "unknown_pending_human_review";
  resultHash: string;
};

export type ConfiguredEdinetExactComparisonDocument = {
  pairId: string;
  pairHash: string;
  extractionHash: string;
  docID: string;
  sourceAnchorSetHash: string;
  anchorCount: number;
  exactNormalizedMatchCount: number;
  mismatchPendingVisualReviewCount: number;
  comparisonStatus: "complete_exact_normalized_comparison";
  anchors: ConfiguredEdinetExactComparisonAnchor[];
  documentResultHash: string;
};

export type ConfiguredEdinetExactComparisonReport = {
  schemaVersion: 1;
  source: "edinet";
  normalizationVersion: typeof NORMALIZATION_VERSION;
  comparisonMethod: "exact_normalized_only";
  executionMode: "explicit_local_command";
  registryHash: string;
  issuer: {
    issuerKey: string;
    name: string;
    edinetCode: string;
    secCode: string;
    boundaryHash: string;
  };
  sourceAnchorFinalFile: string;
  sourceAnchorFinalHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string;
  documentCount: number;
  anchorCount: number;
  exactNormalizedMatchCount: number;
  mismatchPendingVisualReviewCount: number;
  comparisonStatus: "complete_exact_normalized_comparison";
  reviewStatus: "pending_human_comparison_review";
  documents: ConfiguredEdinetExactComparisonDocument[];
  globalBlockers: string[];
  fuzzyMatchingUsed: false;
  semanticEquivalenceInferred: false;
  officialPdfVisualReviewComplete: false;
  automaticEquivalenceDecisionAuthorized: false;
  foundationPreviewEligible: false;
  appendAuthorized: false;
  reportHash: string;
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

function exactText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
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
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function localBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\")) {
    throw new Error(`${field} must be a local basename`);
  }
  return result;
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

function textDigest(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

export function normalizeConfiguredEdinetAnchorText(value: string): string {
  if (/[\r\n\f]/.test(value)) throw new Error("anchor text must remain a single extracted line");
  const normalized = value
    .normalize("NFKC")
    .replace(/[\t \u00a0\u3000]+/g, " ")
    .trim();
  if (!normalized) throw new Error("normalized anchor text must not be empty");
  return normalized;
}

function verifyFinalRecord(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("anchorFinal schema/source is unsupported");
  }
  if (
    record.reviewStatus !== "complete_anchor_input"
    || record.comparisonStatus !== "not_started"
    || record.automaticComparisonAuthorized !== false
    || record.foundationPreviewEligible !== false
    || record.appendAuthorized !== false
  ) {
    throw new Error("anchorFinal safety boundary is invalid");
  }
  const expected = hash(record.recordHash, "anchorFinal.recordHash");
  const { recordHash: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error("anchorFinal.recordHash mismatch");
  return expected;
}

function verifyAnchorText(value: unknown, expectedHash: unknown, field: string): string {
  const exact = exactText(value, field);
  if (textDigest(exact) !== hash(expectedHash, `${field}Hash`)) {
    throw new Error(`${field} hash mismatch`);
  }
  return exact;
}

function compareAnchor(value: unknown, field: string): ConfiguredEdinetExactComparisonAnchor {
  const anchor = object(value, field);
  if (anchor.lineageVerified !== true) throw new Error(`${field}.lineageVerified must be true`);
  const expectedRelationValue = required(anchor.expectedRelation, `${field}.expectedRelation`);
  if (expectedRelationValue !== "exact_normalized_match" && expectedRelationValue !== "visual_layout_variance_review") {
    throw new Error(`${field}.expectedRelation is invalid`);
  }
  const expectedRelation = expectedRelationValue as ConfiguredEdinetExactComparisonAnchor["expectedRelation"];
  const structured = object(anchor.structured, `${field}.structured`);
  const pdf = object(anchor.pdf, `${field}.pdf`);
  const structuredText = verifyAnchorText(structured.text, structured.textHash, `${field}.structured.text`);
  const pdfText = verifyAnchorText(pdf.text, pdf.textHash, `${field}.pdf.text`);
  const structuredNormalized = normalizeConfiguredEdinetAnchorText(structuredText);
  const pdfNormalized = normalizeConfiguredEdinetAnchorText(pdfText);
  const normalizedExactMatch = structuredNormalized === pdfNormalized;
  const base = {
    anchorId: required(anchor.anchorId, `${field}.anchorId`),
    reason: required(anchor.reason, `${field}.reason`),
    expectedRelation,
    structured: {
      entryPath: required(structured.entryPath, `${field}.structured.entryPath`),
      lineNumber: positiveInteger(structured.lineNumber, `${field}.structured.lineNumber`),
      textHash: hash(structured.textHash, `${field}.structured.textHash`),
      normalizedTextHash: textDigest(structuredNormalized),
      normalizedLength: structuredNormalized.length,
    },
    pdf: {
      pageNumber: positiveInteger(pdf.pageNumber, `${field}.pdf.pageNumber`),
      lineNumber: positiveInteger(pdf.lineNumber, `${field}.pdf.lineNumber`),
      textHash: hash(pdf.textHash, `${field}.pdf.textHash`),
      normalizedTextHash: textDigest(pdfNormalized),
      normalizedLength: pdfNormalized.length,
    },
    rawExactMatch: structuredText === pdfText,
    normalizedExactMatch,
    comparisonResult: normalizedExactMatch
      ? "exact_normalized_match" as const
      : "not_exact_normalized_match_pending_visual_review" as const,
    visualReviewRequired: true as const,
    contentEquivalent: "unknown_pending_human_review" as const,
    accountingImpact: "unknown_pending_human_review" as const,
    internalControlImpact: "unknown_pending_human_review" as const,
    auditOpinionImpact: "unknown_pending_human_review" as const,
    materiality: "unknown_pending_human_review" as const,
    direction: "unknown_pending_human_review" as const,
  };
  return { ...base, resultHash: digest(base) };
}

function compareDocument(value: unknown, field: string): ConfiguredEdinetExactComparisonDocument {
  const document = object(value, field);
  if (document.status !== "complete_human_input") {
    throw new Error(`${field}.status must be complete_human_input`);
  }
  const expectedAnchorSetHash = hash(document.anchorSetHash, `${field}.anchorSetHash`);
  const { anchorSetHash: _ignored, ...withoutHash } = document;
  if (digest(withoutHash) !== expectedAnchorSetHash) throw new Error(`${field}.anchorSetHash mismatch`);
  const rawAnchors = array(document.anchors, `${field}.anchors`);
  const anchorCount = positiveInteger(document.anchorCount, `${field}.anchorCount`);
  if (rawAnchors.length !== anchorCount) throw new Error(`${field}.anchorCount mismatch`);
  const seen = new Set<string>();
  const anchors = rawAnchors.map((anchor, index) => {
    const result = compareAnchor(anchor, `${field}.anchors[${index}]`);
    if (seen.has(result.anchorId)) throw new Error(`${field} has duplicate anchorId ${result.anchorId}`);
    seen.add(result.anchorId);
    return result;
  }).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
  const exactNormalizedMatchCount = anchors.filter(anchor => anchor.normalizedExactMatch).length;
  const base = {
    pairId: required(document.pairId, `${field}.pairId`),
    pairHash: hash(document.pairHash, `${field}.pairHash`),
    extractionHash: hash(document.extractionHash, `${field}.extractionHash`),
    docID: docID(document.docID, `${field}.docID`),
    sourceAnchorSetHash: expectedAnchorSetHash,
    anchorCount,
    exactNormalizedMatchCount,
    mismatchPendingVisualReviewCount: anchorCount - exactNormalizedMatchCount,
    comparisonStatus: "complete_exact_normalized_comparison" as const,
    anchors,
  };
  return { ...base, documentResultHash: digest(base) };
}

export function buildConfiguredEdinetExactComparisonReport(input: {
  anchorFinal: unknown;
  sourceAnchorFinalFile: string;
  generatedAt?: string;
}): ConfiguredEdinetExactComparisonReport {
  const finalRecord = object(input.anchorFinal, "anchorFinal");
  const sourceAnchorFinalHash = verifyFinalRecord(finalRecord);
  const sourceAnchorFinalFile = localBasename(input.sourceAnchorFinalFile, "sourceAnchorFinalFile");
  if (!sourceAnchorFinalFile.endsWith(".json")) throw new Error("sourceAnchorFinalFile must be JSON");
  const documents = array(finalRecord.documents, "anchorFinal.documents")
    .map((document, index) => compareDocument(document, `anchorFinal.documents[${index}]`))
    .sort((left, right) => left.docID.localeCompare(right.docID));
  const documentCount = positiveInteger(finalRecord.documentCount, "anchorFinal.documentCount");
  const anchorCount = positiveInteger(finalRecord.anchorCount, "anchorFinal.anchorCount");
  if (documents.length !== documentCount) throw new Error("anchorFinal.documentCount mismatch");
  if (documents.reduce((sum, document) => sum + document.anchorCount, 0) !== anchorCount) {
    throw new Error("anchorFinal.anchorCount mismatch");
  }
  const exactNormalizedMatchCount = documents.reduce(
    (sum, document) => sum + document.exactNormalizedMatchCount,
    0,
  );
  const issuer = object(finalRecord.issuer, "anchorFinal.issuer");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    normalizationVersion: NORMALIZATION_VERSION,
    comparisonMethod: "exact_normalized_only" as const,
    executionMode: "explicit_local_command" as const,
    registryHash: hash(finalRecord.registryHash, "anchorFinal.registryHash"),
    issuer: {
      issuerKey: required(issuer.issuerKey, "anchorFinal.issuer.issuerKey"),
      name: required(issuer.name, "anchorFinal.issuer.name"),
      edinetCode: required(issuer.edinetCode, "anchorFinal.issuer.edinetCode"),
      secCode: required(issuer.secCode, "anchorFinal.issuer.secCode"),
      boundaryHash: hash(issuer.boundaryHash, "anchorFinal.issuer.boundaryHash"),
    },
    sourceAnchorFinalFile,
    sourceAnchorFinalHash,
    generatedAt,
    reviewer: required(finalRecord.reviewer, "anchorFinal.reviewer"),
    reviewedAt: timestamp(finalRecord.reviewedAt, "anchorFinal.reviewedAt"),
    documentCount,
    anchorCount,
    exactNormalizedMatchCount,
    mismatchPendingVisualReviewCount: anchorCount - exactNormalizedMatchCount,
    comparisonStatus: "complete_exact_normalized_comparison" as const,
    reviewStatus: "pending_human_comparison_review" as const,
    documents,
    globalBlockers: [
      "official_pdf_visual_review_required_for_every_anchor",
      "normalized_equality_is_not_semantic_equivalence",
      "mismatches_require_human_layout_and_content_review",
      "accounting_internal_control_audit_impact_not_decided",
      "materiality_and_direction_not_decided",
      "foundation_preview_not_eligible",
      "governed_store_append_not_authorized",
    ].sort(),
    fuzzyMatchingUsed: false as const,
    semanticEquivalenceInferred: false as const,
    officialPdfVisualReviewComplete: false as const,
    automaticEquivalenceDecisionAuthorized: false as const,
    foundationPreviewEligible: false as const,
    appendAuthorized: false as const,
  };
  return { ...base, reportHash: digest(base) };
}

export function renderConfiguredEdinetExactComparisonReport(
  report: ConfiguredEdinetExactComparisonReport,
): string {
  const lines = [
    `# ${report.issuer.name} EDINET exact-normalized comparison`,
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- normalizationVersion: ${report.normalizationVersion}`,
    `- sourceAnchorFinalFile: ${report.sourceAnchorFinalFile}`,
    `- sourceAnchorFinalHash: ${report.sourceAnchorFinalHash}`,
    `- documents/anchors: ${report.documentCount}/${report.anchorCount}`,
    `- exact normalized matches: ${report.exactNormalizedMatchCount}`,
    `- mismatches pending visual review: ${report.mismatchPendingVisualReviewCount}`,
    `- comparisonStatus: ${report.comparisonStatus}`,
    `- reviewStatus: ${report.reviewStatus}`,
    `- reportHash: ${report.reportHash}`,
    "- fuzzyMatchingUsed: false",
    "- semanticEquivalenceInferred: false",
    "- officialPdfVisualReviewComplete: false",
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "Exact normalized equality is a deterministic text result, not proof of visual or semantic equivalence.",
    "Every anchor still requires official PDF visual review.",
    "",
  ];
  for (const document of report.documents) {
    lines.push(
      `## ${document.docID}`,
      "",
      `- anchors: ${document.anchorCount}`,
      `- exact normalized matches: ${document.exactNormalizedMatchCount}`,
      `- mismatches pending visual review: ${document.mismatchPendingVisualReviewCount}`,
      `- documentResultHash: ${document.documentResultHash}`,
      "",
    );
    for (const anchor of document.anchors) {
      lines.push(
        `### ${anchor.anchorId}`,
        "",
        `- result: ${anchor.comparisonResult}`,
        `- rawExactMatch: ${anchor.rawExactMatch}`,
        `- normalizedExactMatch: ${anchor.normalizedExactMatch}`,
        `- expectedRelation: ${anchor.expectedRelation}`,
        `- visualReviewRequired: ${anchor.visualReviewRequired}`,
        `- structured: ${anchor.structured.entryPath} L${anchor.structured.lineNumber}`,
        `- PDF: page ${anchor.pdf.pageNumber} L${anchor.pdf.lineNumber}`,
        `- resultHash: ${anchor.resultHash}`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
