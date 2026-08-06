import { createHash } from "node:crypto";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const MONEY_PATTERN = /\d[\d,]*(?:\.\d+)?(?:円|千円|百万円|万円)/;
const MAX_ANCHORS_PER_CANDIDATE = 40;

type UnknownRecord = Record<string, unknown>;

type FocusLine = {
  side: "before" | "after";
  lineNumber: number;
  text: string;
  matchedKeywords: string[];
};

type FocusedCandidate = {
  candidateId: string;
  clusterId: string;
  pairId: string;
  fromDocID: string;
  toDocID: string;
  path: string;
  afterPath: string | null;
  focusLines: FocusLine[];
  candidateHash: string;
};

type PdfAcquisition = {
  binaryFile: string;
  sha256: string;
  byteLength: number;
  retrievedAt: string;
};

export type SanrioEdinetPdfFidelityPlanCandidate = FocusedCandidate & {
  pdfBinaryFile: string;
  pdfSha256: string;
  pdfByteLength: number;
  pdfRetrievedAt: string;
  anchors: Array<{
    anchorId: string;
    sourceLineNumber: number;
    sourceText: string;
    normalizedText: string;
    matchedKeywords: string[];
  }>;
};

export type SanrioEdinetPdfFidelityPlan = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceFocusedBundleFile: string;
  sourceFocusedBundleHash: string;
  sourceReviewWorkspaceFile: string;
  sourceReviewWorkspaceHash: string;
  candidateCount: number;
  uniquePdfCount: number;
  candidates: SanrioEdinetPdfFidelityPlanCandidate[];
  appendAuthorized: false;
  fidelityPlanHash: string;
};

export type SanrioEdinetPdfTextInput = {
  docID: string;
  pdfBinaryFile: string;
  extractionMethod: "pdftotext_layout" | "unavailable" | "provided_fixture";
  text: string | null;
};

export type SanrioEdinetPdfFidelityCandidateResult = SanrioEdinetPdfFidelityPlanCandidate & {
  extractionMethod: SanrioEdinetPdfTextInput["extractionMethod"];
  pdfTextHash: string | null;
  pdfTextLength: number;
  anchorCount: number;
  matchedAnchorCount: number;
  unmatchedAnchorCount: number;
  status:
    | "exact_anchor_coverage_complete"
    | "partial_exact_anchor_match"
    | "no_exact_anchor_match"
    | "pdf_text_extraction_unavailable"
    | "no_reviewable_anchors";
  anchorResults: Array<{
    anchorId: string;
    sourceLineNumber: number;
    sourceText: string;
    matchedKeywords: string[];
    matched: boolean;
  }>;
  contentEquivalent: "unknown_pending_human_review";
  accountingImpact: "unknown_pending_human_review";
  materiality: "unknown_pending_human_review";
  direction: "unknown_pending_human_review";
  candidateResultHash: string;
};

export type SanrioEdinetPdfFidelityReport = {
  schemaVersion: 1;
  source: "edinet";
  issuer: SanrioEdinetPdfFidelityPlan["issuer"];
  sourceFocusedBundleFile: string;
  sourceFocusedBundleHash: string;
  sourceReviewWorkspaceFile: string;
  sourceReviewWorkspaceHash: string;
  fidelityPlanHash: string;
  generatedAt: string;
  candidateCount: number;
  uniquePdfCount: number;
  extractedPdfCount: number;
  exactCoverageCandidateCount: number;
  partialCoverageCandidateCount: number;
  unavailableCandidateCount: number;
  matchedAnchorCount: number;
  unmatchedAnchorCount: number;
  reviewStatus: "pending_human_review";
  candidates: SanrioEdinetPdfFidelityCandidateResult[];
  globalBlockers: string[];
  appendAuthorized: false;
  fidelityReportHash: string;
};

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as UnknownRecord;
}

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requireString(value: unknown, field: string): string {
  const result = asString(value);
  if (!result) throw new Error(`${field} must be a non-empty string`);
  return result;
}

function requireHash(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!HASH_PATTERN.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!DOC_ID_PATTERN.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function requirePositiveInteger(value: unknown, field: string): number {
  const result = requireNonNegativeInteger(value, field);
  if (result === 0) throw new Error(`${field} must be positive`);
  return result;
}

function requireTimestamp(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function requireLocalFile(value: unknown, field: string, extension: string): string {
  const result = requireString(value, field);
  if (
    result === "."
    || result === ".."
    || result.includes("/")
    || result.includes("\\")
    || !result.endsWith(extension)
  ) {
    throw new Error(`${field} must be a local ${extension} basename`);
  }
  return result;
}

function requireIssuer(value: unknown, field: string): void {
  const issuer = asRecord(value, field);
  if (asString(issuer.edinetCode) !== "E02655" || asString(issuer.secCode) !== "81360") {
    throw new Error(`${field} is not Sanrio`);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as UnknownRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u00a0]+/g, "")
    .replace(/[‐‑‒–—―−]/g, "-")
    .toLowerCase();
}

function isReviewableAnchor(text: string): boolean {
  const normalized = normalizeForSearch(text);
  if (normalized.length >= 8) return true;
  return normalized.length >= 4 && MONEY_PATTERN.test(text.normalize("NFKC"));
}

function verifyFocusedBundleHash(record: UnknownRecord): string {
  const expected = requireHash(record.focusedBundleHash, "focusedBundle.focusedBundleHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceTriageWorkspaceHash: record.sourceTriageWorkspaceHash,
    sourceDiffWorkspaceHash: record.sourceDiffWorkspaceHash,
    focusedPlanHash: record.focusedPlanHash,
    candidates: record.candidates,
    appendAuthorized: record.appendAuthorized,
  };
  const actual = hashValue(payload);
  if (actual !== expected) throw new Error("focusedBundle.focusedBundleHash mismatch");
  return expected;
}

function verifyReviewWorkspaceHash(record: UnknownRecord): string {
  const expected = requireHash(record.workspaceHash, "reviewWorkspace.workspaceHash");
  const { workspaceHash: _ignored, ...payload } = record;
  const actual = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  if (actual !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");
  return expected;
}

function parseFocusLine(value: unknown, field: string): FocusLine {
  const record = asRecord(value, field);
  const side = requireString(record.side, `${field}.side`);
  if (side !== "before" && side !== "after") throw new Error(`${field}.side is invalid`);
  return {
    side,
    lineNumber: requirePositiveInteger(record.lineNumber, `${field}.lineNumber`),
    text: requireString(record.text, `${field}.text`),
    matchedKeywords: asArray(record.matchedKeywords, `${field}.matchedKeywords`).map((item, index) =>
      requireString(item, `${field}.matchedKeywords[${index}]`),
    ),
  };
}

function parseFocusedCandidate(value: unknown, field: string): FocusedCandidate {
  const record = asRecord(value, field);
  if (record.factStatus !== "unreviewed_source_text") {
    throw new Error(`${field}.factStatus must remain unreviewed_source_text`);
  }
  const afterPath = record.afterPath === null
    ? null
    : requireString(record.afterPath, `${field}.afterPath`);
  return {
    candidateId: requireString(record.candidateId, `${field}.candidateId`),
    clusterId: requireString(record.clusterId, `${field}.clusterId`),
    pairId: requireString(record.pairId, `${field}.pairId`),
    fromDocID: requireDocID(record.fromDocID, `${field}.fromDocID`),
    toDocID: requireDocID(record.toDocID, `${field}.toDocID`),
    path: requireString(record.path, `${field}.path`),
    afterPath,
    focusLines: asArray(record.focusLines, `${field}.focusLines`).map((item, index) =>
      parseFocusLine(item, `${field}.focusLines[${index}]`),
    ),
    candidateHash: requireHash(record.candidateHash, `${field}.candidateHash`),
  };
}

function parsePdfAcquisitions(reviewWorkspace: UnknownRecord): Map<string, PdfAcquisition> {
  const result = new Map<string, PdfAcquisition>();
  for (const [groupIndex, groupValue] of asArray(reviewWorkspace.groups, "reviewWorkspace.groups").entries()) {
    const group = asRecord(groupValue, `reviewWorkspace.groups[${groupIndex}]`);
    for (const [docIndex, docValue] of asArray(
      group.documents,
      `reviewWorkspace.groups[${groupIndex}].documents`,
    ).entries()) {
      const doc = asRecord(docValue, `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}]`);
      const docID = requireDocID(doc.docID, `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}].docID`);
      for (const [acquisitionIndex, acquisitionValue] of asArray(
        doc.acquisitions,
        `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}].acquisitions`,
      ).entries()) {
        const acquisition = asRecord(
          acquisitionValue,
          `reviewWorkspace.groups[${groupIndex}].documents[${docIndex}].acquisitions[${acquisitionIndex}]`,
        );
        if (asString(acquisition.documentType) !== "2" || asString(acquisition.format) !== "pdf") continue;
        if (result.has(docID)) throw new Error(`duplicate type=2 PDF acquisition for ${docID}`);
        result.set(docID, {
          binaryFile: requireLocalFile(acquisition.binaryFile, `PDF ${docID}.binaryFile`, ".pdf"),
          sha256: requireHash(acquisition.sha256, `PDF ${docID}.sha256`),
          byteLength: requirePositiveInteger(acquisition.byteLength, `PDF ${docID}.byteLength`),
          retrievedAt: requireTimestamp(acquisition.retrievedAt, `PDF ${docID}.retrievedAt`),
        });
      }
    }
  }
  return result;
}

function buildAnchors(candidate: FocusedCandidate): SanrioEdinetPdfFidelityPlanCandidate["anchors"] {
  const seen = new Set<string>();
  const anchors: SanrioEdinetPdfFidelityPlanCandidate["anchors"] = [];
  for (const line of candidate.focusLines.filter(item => item.side === "after")) {
    if (!isReviewableAnchor(line.text)) continue;
    const normalizedText = normalizeForSearch(line.text);
    if (seen.has(normalizedText)) continue;
    seen.add(normalizedText);
    const base = {
      sourceLineNumber: line.lineNumber,
      sourceText: line.text,
      normalizedText,
      matchedKeywords: [...line.matchedKeywords].sort(),
    };
    anchors.push({ ...base, anchorId: `anchor:${hashValue(base).slice(0, 20)}` });
    if (anchors.length >= MAX_ANCHORS_PER_CANDIDATE) break;
  }
  return anchors;
}

export function buildSanrioEdinetPdfFidelityPlan(input: {
  focusedBundle: unknown;
  sourceFocusedBundleFile: string;
  reviewWorkspace: unknown;
  sourceReviewWorkspaceFile: string;
}): SanrioEdinetPdfFidelityPlan {
  const focusedBundle = asRecord(input.focusedBundle, "focusedBundle");
  if (focusedBundle.schemaVersion !== 1 || focusedBundle.source !== "edinet") {
    throw new Error("focusedBundle schema/source is unsupported");
  }
  if (focusedBundle.reviewStatus !== "pending_human_review" || focusedBundle.appendAuthorized !== false) {
    throw new Error("focusedBundle review boundary is invalid");
  }
  requireIssuer(focusedBundle.issuer, "focusedBundle.issuer");
  const sourceFocusedBundleHash = verifyFocusedBundleHash(focusedBundle);

  const reviewWorkspace = asRecord(input.reviewWorkspace, "reviewWorkspace");
  if (reviewWorkspace.schemaVersion !== 1 || reviewWorkspace.source !== "edinet") {
    throw new Error("reviewWorkspace schema/source is unsupported");
  }
  if (reviewWorkspace.reviewStatus !== "pending_human_review" || reviewWorkspace.appendAuthorized !== false) {
    throw new Error("reviewWorkspace review boundary is invalid");
  }
  requireIssuer(reviewWorkspace.issuer, "reviewWorkspace.issuer");
  const sourceReviewWorkspaceHash = verifyReviewWorkspaceHash(reviewWorkspace);
  const pdfs = parsePdfAcquisitions(reviewWorkspace);

  const candidates = asArray(focusedBundle.candidates, "focusedBundle.candidates")
    .map((item, index) => parseFocusedCandidate(item, `focusedBundle.candidates[${index}]`))
    .map(candidate => {
      const pdf = pdfs.get(candidate.toDocID);
      if (!pdf) throw new Error(`type=2 PDF acquisition missing for ${candidate.toDocID}`);
      return {
        ...candidate,
        pdfBinaryFile: pdf.binaryFile,
        pdfSha256: pdf.sha256,
        pdfByteLength: pdf.byteLength,
        pdfRetrievedAt: pdf.retrievedAt,
        anchors: buildAnchors(candidate),
      };
    })
    .sort((left, right) => `${left.toDocID}|${left.candidateId}`.localeCompare(
      `${right.toDocID}|${right.candidateId}`,
    ));

  const declaredCandidateCount = requireNonNegativeInteger(
    focusedBundle.candidateCount,
    "focusedBundle.candidateCount",
  );
  if (candidates.length !== declaredCandidateCount) {
    throw new Error("focusedBundle.candidateCount mismatch");
  }
  const sourceFocusedBundleFile = requireLocalFile(
    input.sourceFocusedBundleFile,
    "sourceFocusedBundleFile",
    ".json",
  );
  const sourceReviewWorkspaceFile = requireLocalFile(
    input.sourceReviewWorkspaceFile,
    "sourceReviewWorkspaceFile",
    ".json",
  );
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceFocusedBundleHash,
    sourceReviewWorkspaceHash,
    candidates,
    appendAuthorized: false,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceFocusedBundleFile,
    sourceFocusedBundleHash,
    sourceReviewWorkspaceFile,
    sourceReviewWorkspaceHash,
    candidateCount: candidates.length,
    uniquePdfCount: new Set(candidates.map(candidate => candidate.pdfBinaryFile)).size,
    candidates,
    appendAuthorized: false,
    fidelityPlanHash: hashValue(hashPayload),
  };
}

export function buildSanrioEdinetPdfFidelityReport(input: {
  plan: SanrioEdinetPdfFidelityPlan;
  pdfTexts: SanrioEdinetPdfTextInput[];
  generatedAt?: string;
}): SanrioEdinetPdfFidelityReport {
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  const texts = new Map<string, SanrioEdinetPdfTextInput>();
  for (const item of input.pdfTexts) {
    if (texts.has(item.docID)) throw new Error(`duplicate PDF text for ${item.docID}`);
    texts.set(item.docID, item);
  }

  const candidates = input.plan.candidates.map(candidate => {
    const pdfText = texts.get(candidate.toDocID);
    if (!pdfText) throw new Error(`PDF text input missing for ${candidate.toDocID}`);
    if (pdfText.pdfBinaryFile !== candidate.pdfBinaryFile) {
      throw new Error(`PDF binary mismatch for ${candidate.toDocID}`);
    }
    const normalizedPdf = pdfText.text === null ? "" : normalizeForSearch(pdfText.text);
    const anchorResults = candidate.anchors.map(anchor => ({
      anchorId: anchor.anchorId,
      sourceLineNumber: anchor.sourceLineNumber,
      sourceText: anchor.sourceText,
      matchedKeywords: anchor.matchedKeywords,
      matched: pdfText.text !== null && normalizedPdf.includes(anchor.normalizedText),
    }));
    const matchedAnchorCount = anchorResults.filter(item => item.matched).length;
    const unmatchedAnchorCount = anchorResults.length - matchedAnchorCount;
    const status: SanrioEdinetPdfFidelityCandidateResult["status"] = pdfText.text === null
      ? "pdf_text_extraction_unavailable"
      : anchorResults.length === 0
        ? "no_reviewable_anchors"
        : matchedAnchorCount === anchorResults.length
          ? "exact_anchor_coverage_complete"
          : matchedAnchorCount === 0
            ? "no_exact_anchor_match"
            : "partial_exact_anchor_match";
    const base = {
      ...candidate,
      extractionMethod: pdfText.extractionMethod,
      pdfTextHash: pdfText.text === null ? null : createHash("sha256").update(pdfText.text).digest("hex"),
      pdfTextLength: pdfText.text?.length ?? 0,
      anchorCount: anchorResults.length,
      matchedAnchorCount,
      unmatchedAnchorCount,
      status,
      anchorResults,
      contentEquivalent: "unknown_pending_human_review" as const,
      accountingImpact: "unknown_pending_human_review" as const,
      materiality: "unknown_pending_human_review" as const,
      direction: "unknown_pending_human_review" as const,
    };
    return { ...base, candidateResultHash: hashValue(base) };
  });

  const extractedPdfCount = new Set(
    input.pdfTexts.filter(item => item.text !== null).map(item => item.pdfBinaryFile),
  ).size;
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceFocusedBundleHash: input.plan.sourceFocusedBundleHash,
    sourceReviewWorkspaceHash: input.plan.sourceReviewWorkspaceHash,
    fidelityPlanHash: input.plan.fidelityPlanHash,
    candidates,
    appendAuthorized: false,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: input.plan.issuer,
    sourceFocusedBundleFile: input.plan.sourceFocusedBundleFile,
    sourceFocusedBundleHash: input.plan.sourceFocusedBundleHash,
    sourceReviewWorkspaceFile: input.plan.sourceReviewWorkspaceFile,
    sourceReviewWorkspaceHash: input.plan.sourceReviewWorkspaceHash,
    fidelityPlanHash: input.plan.fidelityPlanHash,
    generatedAt,
    candidateCount: candidates.length,
    uniquePdfCount: input.plan.uniquePdfCount,
    extractedPdfCount,
    exactCoverageCandidateCount: candidates.filter(
      candidate => candidate.status === "exact_anchor_coverage_complete",
    ).length,
    partialCoverageCandidateCount: candidates.filter(
      candidate => candidate.status === "partial_exact_anchor_match",
    ).length,
    unavailableCandidateCount: candidates.filter(
      candidate => candidate.status === "pdf_text_extraction_unavailable",
    ).length,
    matchedAnchorCount: candidates.reduce((sum, candidate) => sum + candidate.matchedAnchorCount, 0),
    unmatchedAnchorCount: candidates.reduce((sum, candidate) => sum + candidate.unmatchedAnchorCount, 0),
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: [
      "exact_anchor_match_is_not_full_document_equivalence",
      "unmatched_anchor_may_be_pdf_layout_or_text_extraction_variance",
      "human_pdf_visual_review_required",
      "financial_statement_impact_not_confirmed",
      "materiality_not_confirmed",
      "direction_not_confirmed",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false,
    fidelityReportHash: hashValue(hashPayload),
  };
}

export function renderSanrioEdinetPdfFidelityReport(
  report: SanrioEdinetPdfFidelityReport,
): string {
  const lines = [
    "# Sanrio EDINET API/PDF source fidelity review",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- sourceFocusedBundleFile: ${report.sourceFocusedBundleFile}`,
    `- sourceFocusedBundleHash: ${report.sourceFocusedBundleHash}`,
    `- sourceReviewWorkspaceFile: ${report.sourceReviewWorkspaceFile}`,
    `- sourceReviewWorkspaceHash: ${report.sourceReviewWorkspaceHash}`,
    `- fidelityPlanHash: ${report.fidelityPlanHash}`,
    `- fidelityReportHash: ${report.fidelityReportHash}`,
    `- candidateCount: ${report.candidateCount}`,
    `- uniquePdfCount: ${report.uniquePdfCount}`,
    `- extractedPdfCount: ${report.extractedPdfCount}`,
    `- exactCoverageCandidateCount: ${report.exactCoverageCandidateCount}`,
    `- partialCoverageCandidateCount: ${report.partialCoverageCandidateCount}`,
    `- unavailableCandidateCount: ${report.unavailableCandidateCount}`,
    `- matchedAnchorCount: ${report.matchedAnchorCount}`,
    `- unmatchedAnchorCount: ${report.unmatchedAnchorCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- EDINET API type=1 structured data and type=2 PDF are both official acquisition artifacts for the same filing docID.",
    "- Exact anchor coverage confirms that selected source lines also appear in extracted PDF text; it does not prove complete document equivalence.",
    "- PDF extraction can alter line breaks, spacing, and table order. Unmatched anchors require visual PDF review rather than an automatic contradiction finding.",
    "",
  ];
  for (const candidate of report.candidates) {
    lines.push(
      `## ${candidate.toDocID} — ${candidate.path}`,
      "",
      `- candidateId: ${candidate.candidateId}`,
      `- PDF: ${candidate.pdfBinaryFile}`,
      `- PDF SHA-256: ${candidate.pdfSha256}`,
      `- extractionMethod: ${candidate.extractionMethod}`,
      `- status: ${candidate.status}`,
      `- anchors: matched=${candidate.matchedAnchorCount}, unmatched=${candidate.unmatchedAnchorCount}`,
      "- contentEquivalent/accountingImpact/materiality/direction: unknown_pending_human_review",
      "",
    );
    for (const result of candidate.anchorResults) {
      lines.push(
        `- [${result.matched ? "x" : " "}] line ${result.sourceLineNumber}: ${result.sourceText}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
