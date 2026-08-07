import { createHash } from "node:crypto";
import type { SanrioFoundationReadinessAudit } from "./edinet-sanrio-foundation-readiness-audit.js";
import {
  auditSanrioConfiguredFoundationReadinessWithConfiguredDecisionConformance,
} from "./edinet-sanrio-foundation-readiness-configured-decision.js";

type JsonObject = Record<string, unknown>;
const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const NORMALIZATION_VERSION = "unicode-nfkc-horizontal-whitespace-v1";

type SourceAnchor = {
  anchorId: string;
  sourceResultHash: string;
  sourceComparisonResult: string;
  expectedRelation: string;
  rawExactMatch: boolean;
  normalizedExactMatch: boolean;
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
};

type SourceDocument = {
  pairId: string;
  pairHash: string;
  extractionHash: string;
  docID: string;
  sourceDocumentResultHash: string;
  anchors: SourceAnchor[];
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

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (
    result === "."
    || result === ".."
    || result.includes("/")
    || result.includes("\\")
    || !result.endsWith(".json")
  ) {
    throw new Error(`${field} must be a local JSON basename`);
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

function verifyHashEnvelope(record: JsonObject, hashField: string, field: string): string {
  const expected = hash(record[hashField], `${field}.${hashField}`);
  const { [hashField]: _ignored, ...withoutHash } = record;
  if (digest(withoutHash) !== expected) throw new Error(`${field}.${hashField} mismatch`);
  return expected;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function assertSanrioIssuer(value: unknown, field: string): {
  issuerKey: string;
  name: string;
  edinetCode: string;
  secCode: string;
  boundaryHash: string;
} {
  const issuer = object(value, field);
  const result = {
    issuerKey: required(issuer.issuerKey, `${field}.issuerKey`),
    name: required(issuer.name, `${field}.name`),
    edinetCode: required(issuer.edinetCode, `${field}.edinetCode`),
    secCode: required(issuer.secCode, `${field}.secCode`),
    boundaryHash: hash(issuer.boundaryHash, `${field}.boundaryHash`),
  };
  if (
    result.issuerKey !== "sanrio"
    || result.name !== "株式会社サンリオ"
    || result.edinetCode !== "E02655"
    || result.secCode !== "81360"
  ) {
    throw new Error(`${field} is not the configured Sanrio issuer`);
  }
  return result;
}

function parseComparisonResult(value: unknown, field: string): string {
  const result = required(value, field);
  if (result !== "exact_normalized_match" && result !== "not_exact_normalized_match_pending_visual_review") {
    throw new Error(`${field} is invalid`);
  }
  return result;
}

function parseExpectedRelation(value: unknown, field: string): string {
  const result = required(value, field);
  if (result !== "exact_normalized_match" && result !== "visual_layout_variance_review") {
    throw new Error(`${field} is invalid`);
  }
  return result;
}

function parseComparisonAnchor(anchorValue: unknown, field: string): SourceAnchor {
  const anchor = object(anchorValue, field);
  const resultHash = verifyHashEnvelope(anchor, "resultHash", field);
  const structured = object(anchor.structured, `${field}.structured`);
  const pdf = object(anchor.pdf, `${field}.pdf`);
  if (typeof anchor.rawExactMatch !== "boolean" || typeof anchor.normalizedExactMatch !== "boolean") {
    throw new Error(`${field} exact-match flags are invalid`);
  }
  const sourceComparisonResult = parseComparisonResult(anchor.comparisonResult, `${field}.comparisonResult`);
  if (
    (anchor.normalizedExactMatch === true && sourceComparisonResult !== "exact_normalized_match")
    || (anchor.normalizedExactMatch === false && sourceComparisonResult !== "not_exact_normalized_match_pending_visual_review")
  ) {
    throw new Error(`${field} normalized-match/result mismatch`);
  }
  if (
    anchor.visualReviewRequired !== true
    || anchor.contentEquivalent !== "unknown_pending_human_review"
    || anchor.accountingImpact !== "unknown_pending_human_review"
    || anchor.internalControlImpact !== "unknown_pending_human_review"
    || anchor.auditOpinionImpact !== "unknown_pending_human_review"
    || anchor.materiality !== "unknown_pending_human_review"
    || anchor.direction !== "unknown_pending_human_review"
  ) {
    throw new Error(`${field} pre-human decision boundary is invalid`);
  }
  return {
    anchorId: required(anchor.anchorId, `${field}.anchorId`),
    sourceResultHash: resultHash,
    sourceComparisonResult,
    expectedRelation: parseExpectedRelation(anchor.expectedRelation, `${field}.expectedRelation`),
    rawExactMatch: anchor.rawExactMatch,
    normalizedExactMatch: anchor.normalizedExactMatch,
    structured: {
      entryPath: required(structured.entryPath, `${field}.structured.entryPath`),
      lineNumber: positiveInteger(structured.lineNumber, `${field}.structured.lineNumber`),
      textHash: hash(structured.textHash, `${field}.structured.textHash`),
      normalizedTextHash: hash(structured.normalizedTextHash, `${field}.structured.normalizedTextHash`),
      normalizedLength: positiveInteger(structured.normalizedLength, `${field}.structured.normalizedLength`),
    },
    pdf: {
      pageNumber: positiveInteger(pdf.pageNumber, `${field}.pdf.pageNumber`),
      lineNumber: positiveInteger(pdf.lineNumber, `${field}.pdf.lineNumber`),
      textHash: hash(pdf.textHash, `${field}.pdf.textHash`),
      normalizedTextHash: hash(pdf.normalizedTextHash, `${field}.pdf.normalizedTextHash`),
      normalizedLength: positiveInteger(pdf.normalizedLength, `${field}.pdf.normalizedLength`),
    },
  };
}

function verifyComparisonReport(value: unknown): {
  reportHash: string;
  registryHash: string;
  issuer: ReturnType<typeof assertSanrioIssuer>;
  documents: SourceDocument[];
} {
  const report = object(value, "comparisonReport");
  if (
    report.schemaVersion !== 1
    || report.source !== "edinet"
    || report.normalizationVersion !== NORMALIZATION_VERSION
    || report.comparisonMethod !== "exact_normalized_only"
    || report.executionMode !== "explicit_local_command"
    || report.comparisonStatus !== "complete_exact_normalized_comparison"
    || report.reviewStatus !== "pending_human_comparison_review"
    || report.fuzzyMatchingUsed !== false
    || report.semanticEquivalenceInferred !== false
    || report.officialPdfVisualReviewComplete !== false
    || report.automaticEquivalenceDecisionAuthorized !== false
    || report.foundationPreviewEligible !== false
    || report.appendAuthorized !== false
  ) {
    throw new Error("comparisonReport safety/method boundary is invalid");
  }
  const reportHash = verifyHashEnvelope(report, "reportHash", "comparisonReport");
  const registryHash = hash(report.registryHash, "comparisonReport.registryHash");
  const issuer = assertSanrioIssuer(report.issuer, "comparisonReport.issuer");
  localJsonBasename(report.sourceAnchorFinalFile, "comparisonReport.sourceAnchorFinalFile");
  hash(report.sourceAnchorFinalHash, "comparisonReport.sourceAnchorFinalHash");
  const rawDocuments = array(report.documents, "comparisonReport.documents");
  const expectedDocumentCount = positiveInteger(report.documentCount, "comparisonReport.documentCount");
  const expectedAnchorCount = positiveInteger(report.anchorCount, "comparisonReport.anchorCount");
  if (rawDocuments.length !== expectedDocumentCount) throw new Error("comparisonReport.documentCount mismatch");

  const seenDocuments = new Set<string>();
  const seenAnchors = new Set<string>();
  let actualAnchorCount = 0;
  let actualExactCount = 0;
  let actualMismatchCount = 0;
  const documents = rawDocuments.map((documentValue, documentIndex) => {
    const field = `comparisonReport.documents[${documentIndex}]`;
    const document = object(documentValue, field);
    const documentHash = verifyHashEnvelope(document, "documentResultHash", field);
    if (document.comparisonStatus !== "complete_exact_normalized_comparison") {
      throw new Error(`${field}.comparisonStatus is invalid`);
    }
    const id = docID(document.docID, `${field}.docID`);
    if (seenDocuments.has(id)) throw new Error(`comparisonReport has duplicate document ${id}`);
    seenDocuments.add(id);
    const rawAnchors = array(document.anchors, `${field}.anchors`);
    const anchorCount = positiveInteger(document.anchorCount, `${field}.anchorCount`);
    if (rawAnchors.length !== anchorCount) throw new Error(`${field}.anchorCount mismatch`);
    const anchors = rawAnchors.map((anchorValue, anchorIndex) => {
      const anchor = parseComparisonAnchor(anchorValue, `${field}.anchors[${anchorIndex}]`);
      if (seenAnchors.has(anchor.anchorId)) throw new Error(`comparisonReport has duplicate anchor ${anchor.anchorId}`);
      seenAnchors.add(anchor.anchorId);
      if (anchor.normalizedExactMatch) actualExactCount += 1;
      else actualMismatchCount += 1;
      return anchor;
    }).sort((left, right) => left.anchorId.localeCompare(right.anchorId));
    actualAnchorCount += anchors.length;
    const documentExactCount = anchors.filter(anchor => anchor.normalizedExactMatch).length;
    if (documentExactCount !== nonNegativeInteger(document.exactNormalizedMatchCount, `${field}.exactNormalizedMatchCount`)) {
      throw new Error(`${field}.exactNormalizedMatchCount mismatch`);
    }
    if (
      anchors.length - documentExactCount
      !== nonNegativeInteger(document.mismatchPendingVisualReviewCount, `${field}.mismatchPendingVisualReviewCount`)
    ) {
      throw new Error(`${field}.mismatchPendingVisualReviewCount mismatch`);
    }
    return {
      pairId: required(document.pairId, `${field}.pairId`),
      pairHash: hash(document.pairHash, `${field}.pairHash`),
      extractionHash: hash(document.extractionHash, `${field}.extractionHash`),
      docID: id,
      sourceDocumentResultHash: documentHash,
      anchors,
    };
  }).sort((left, right) => left.docID.localeCompare(right.docID));

  if (actualAnchorCount !== expectedAnchorCount) throw new Error("comparisonReport.anchorCount mismatch");
  if (actualExactCount !== nonNegativeInteger(report.exactNormalizedMatchCount, "comparisonReport.exactNormalizedMatchCount")) {
    throw new Error("comparisonReport.exactNormalizedMatchCount mismatch");
  }
  if (
    actualMismatchCount
    !== nonNegativeInteger(report.mismatchPendingVisualReviewCount, "comparisonReport.mismatchPendingVisualReviewCount")
  ) {
    throw new Error("comparisonReport.mismatchPendingVisualReviewCount mismatch");
  }
  return { reportHash, registryHash, issuer, documents };
}

function configuredAnchorSource(anchorValue: unknown, field: string): SourceAnchor {
  const anchor = object(anchorValue, field);
  const structured = object(anchor.structured, `${field}.structured`);
  const pdf = object(anchor.pdf, `${field}.pdf`);
  if (typeof anchor.rawExactMatch !== "boolean" || typeof anchor.normalizedExactMatch !== "boolean") {
    throw new Error(`${field} exact-match flags are invalid`);
  }
  return {
    anchorId: required(anchor.anchorId, `${field}.anchorId`),
    sourceResultHash: hash(anchor.sourceResultHash, `${field}.sourceResultHash`),
    sourceComparisonResult: parseComparisonResult(anchor.sourceComparisonResult, `${field}.sourceComparisonResult`),
    expectedRelation: parseExpectedRelation(anchor.expectedRelation, `${field}.expectedRelation`),
    rawExactMatch: anchor.rawExactMatch,
    normalizedExactMatch: anchor.normalizedExactMatch,
    structured: {
      entryPath: required(structured.entryPath, `${field}.structured.entryPath`),
      lineNumber: positiveInteger(structured.lineNumber, `${field}.structured.lineNumber`),
      textHash: hash(structured.textHash, `${field}.structured.textHash`),
      normalizedTextHash: hash(structured.normalizedTextHash, `${field}.structured.normalizedTextHash`),
      normalizedLength: positiveInteger(structured.normalizedLength, `${field}.structured.normalizedLength`),
    },
    pdf: {
      pageNumber: positiveInteger(pdf.pageNumber, `${field}.pdf.pageNumber`),
      lineNumber: positiveInteger(pdf.lineNumber, `${field}.pdf.lineNumber`),
      textHash: hash(pdf.textHash, `${field}.pdf.textHash`),
      normalizedTextHash: hash(pdf.normalizedTextHash, `${field}.pdf.normalizedTextHash`),
      normalizedLength: positiveInteger(pdf.normalizedLength, `${field}.pdf.normalizedLength`),
    },
  };
}

export function assertSanrioFoundationConfiguredSourceLineage(input: {
  comparisonReport: unknown;
  sourceComparisonFile: string;
  configuredReview: unknown;
}): void {
  const source = verifyComparisonReport(input.comparisonReport);
  const sourceComparisonFile = localJsonBasename(input.sourceComparisonFile, "sourceComparisonFile");
  const review = object(input.configuredReview, "configuredReview");
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
  if (localJsonBasename(review.sourceComparisonFile, "configuredReview.sourceComparisonFile") !== sourceComparisonFile) {
    throw new Error("configuredReview sourceComparisonFile mismatch");
  }
  if (hash(review.sourceComparisonHash, "configuredReview.sourceComparisonHash") !== source.reportHash) {
    throw new Error("configuredReview sourceComparisonHash mismatch");
  }
  if (hash(review.registryHash, "configuredReview.registryHash") !== source.registryHash) {
    throw new Error("configuredReview registryHash mismatch");
  }
  if (!sameCanonical(assertSanrioIssuer(review.issuer, "configuredReview.issuer"), source.issuer)) {
    throw new Error("configuredReview issuer lineage mismatch");
  }

  const sourceByDoc = new Map(source.documents.map(document => [document.docID, document]));
  const rawDocuments = array(review.documents, "configuredReview.documents");
  if (rawDocuments.length !== sourceByDoc.size) throw new Error("configuredReview source document count mismatch");
  const seenDocuments = new Set<string>();
  const seenAnchors = new Set<string>();
  for (const [documentIndex, documentValue] of rawDocuments.entries()) {
    const field = `configuredReview.documents[${documentIndex}]`;
    const document = object(documentValue, field);
    const id = docID(document.docID, `${field}.docID`);
    if (seenDocuments.has(id)) throw new Error(`configuredReview has duplicate document ${id}`);
    seenDocuments.add(id);
    const sourceDocument = sourceByDoc.get(id);
    if (!sourceDocument) throw new Error(`configuredReview contains unknown source document ${id}`);
    if (
      required(document.pairId, `${field}.pairId`) !== sourceDocument.pairId
      || hash(document.pairHash, `${field}.pairHash`) !== sourceDocument.pairHash
      || hash(document.extractionHash, `${field}.extractionHash`) !== sourceDocument.extractionHash
      || hash(document.sourceDocumentResultHash, `${field}.sourceDocumentResultHash`) !== sourceDocument.sourceDocumentResultHash
    ) {
      throw new Error(`configuredReview document ${id} source lineage mismatch`);
    }
    const sourceByAnchor = new Map(sourceDocument.anchors.map(anchor => [anchor.anchorId, anchor]));
    const rawAnchors = array(document.anchors, `${field}.anchors`);
    if (rawAnchors.length !== sourceByAnchor.size) throw new Error(`configuredReview document ${id} source anchor count mismatch`);
    for (const [anchorIndex, anchorValue] of rawAnchors.entries()) {
      const anchorSource = configuredAnchorSource(anchorValue, `${field}.anchors[${anchorIndex}]`);
      if (seenAnchors.has(anchorSource.anchorId)) throw new Error(`configuredReview has duplicate anchor ${anchorSource.anchorId}`);
      seenAnchors.add(anchorSource.anchorId);
      const expected = sourceByAnchor.get(anchorSource.anchorId);
      if (!expected) throw new Error(`configuredReview contains unknown source anchor ${anchorSource.anchorId}`);
      if (!sameCanonical(anchorSource, expected)) {
        throw new Error(`configuredReview anchor ${anchorSource.anchorId} source lineage mismatch`);
      }
    }
  }
}

export function auditSanrioConfiguredFoundationReadinessWithConfiguredSourceLineage(input: {
  comparisonReport: unknown;
  sourceComparisonFile: string;
  parityReview: unknown;
  sourceParityReviewFile: string;
  parityWorkspace: unknown;
  sourceParityWorkspaceFile: string;
  configuredReview: unknown;
  sourceConfiguredReviewFile: string;
  generatedAt?: string;
}): SanrioFoundationReadinessAudit {
  assertSanrioFoundationConfiguredSourceLineage({
    comparisonReport: input.comparisonReport,
    sourceComparisonFile: input.sourceComparisonFile,
    configuredReview: input.configuredReview,
  });
  return auditSanrioConfiguredFoundationReadinessWithConfiguredDecisionConformance({
    parityReview: input.parityReview,
    sourceParityReviewFile: input.sourceParityReviewFile,
    parityWorkspace: input.parityWorkspace,
    sourceParityWorkspaceFile: input.sourceParityWorkspaceFile,
    configuredReview: input.configuredReview,
    sourceConfiguredReviewFile: input.sourceConfiguredReviewFile,
    generatedAt: input.generatedAt,
  });
}
