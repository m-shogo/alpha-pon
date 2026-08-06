import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MONEY_RE = /\d[\d,]*(?:\.\d+)?(?:円|千円|万円|百万円)/;
const MAX_ANCHORS = 40;

type JsonObject = Record<string, unknown>;

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

export type SanrioEdinetPdfAnchor = {
  anchorId: string;
  sourceLineNumber: number;
  sourceText: string;
  normalizedText: string;
  matchedKeywords: string[];
};

export type SanrioEdinetPdfFidelityPlanCandidate = FocusedCandidate & {
  pdfBinaryFile: string;
  pdfSha256: string;
  pdfByteLength: number;
  pdfRetrievedAt: string;
  anchors: SanrioEdinetPdfAnchor[];
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
  pendingAnchorCount: number;
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
    matched: boolean | null;
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
  pendingAnchorCount: number;
  reviewStatus: "pending_human_review";
  candidates: SanrioEdinetPdfFidelityCandidateResult[];
  globalBlockers: string[];
  appendAuthorized: false;
  fidelityReportHash: string;
};

function obj(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as JsonObject;
}

function arr(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function required(value: unknown, field: string): string {
  const result = str(value);
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

function integer(value: unknown, field: string, positive = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || (positive && Number(value) === 0)) {
    throw new Error(`${field} must be ${positive ? "a positive" : "a non-negative"} integer`);
  }
  return Number(value);
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function basenameOnly(value: unknown, field: string, extension: string): string {
  const result = required(value, field);
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

function verifyIssuer(value: unknown, field: string): void {
  const issuer = obj(value, field);
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error(`${field} is not Sanrio`);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u00a0]+/g, "")
    .replace(/[‐‑‒–—―−]/g, "-")
    .toLowerCase();
}

function reviewable(text: string): boolean {
  const normalized = normalize(text);
  return normalized.length >= 8 || (normalized.length >= 4 && MONEY_RE.test(text.normalize("NFKC")));
}

function verifyFocusedHash(record: JsonObject): string {
  const expected = hash(record.focusedBundleHash, "focusedBundle.focusedBundleHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    focusedPlanHash: record.focusedPlanHash,
    candidates: record.candidates,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("focusedBundle.focusedBundleHash mismatch");
  return expected;
}

function verifyReviewHash(record: JsonObject): string {
  const expected = hash(record.workspaceHash, "reviewWorkspace.workspaceHash");
  const { workspaceHash: _ignored, ...payload } = record;
  const actual = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  if (actual !== expected) throw new Error("reviewWorkspace.workspaceHash mismatch");
  return expected;
}

function parseFocusLine(value: unknown, field: string): FocusLine {
  const record = obj(value, field);
  const side = required(record.side, `${field}.side`);
  if (side !== "before" && side !== "after") throw new Error(`${field}.side is invalid`);
  return {
    side,
    lineNumber: integer(record.lineNumber, `${field}.lineNumber`, true),
    text: required(record.text, `${field}.text`),
    matchedKeywords: arr(record.matchedKeywords, `${field}.matchedKeywords`).map((item, index) =>
      required(item, `${field}.matchedKeywords[${index}]`),
    ),
  };
}

function parseFocusedCandidate(value: unknown, field: string): FocusedCandidate {
  const record = obj(value, field);
  if (record.factStatus !== "unreviewed_source_text") {
    throw new Error(`${field}.factStatus must remain unreviewed_source_text`);
  }
  return {
    candidateId: required(record.candidateId, `${field}.candidateId`),
    clusterId: required(record.clusterId, `${field}.clusterId`),
    pairId: required(record.pairId, `${field}.pairId`),
    fromDocID: docID(record.fromDocID, `${field}.fromDocID`),
    toDocID: docID(record.toDocID, `${field}.toDocID`),
    path: required(record.path, `${field}.path`),
    afterPath: record.afterPath === null ? null : required(record.afterPath, `${field}.afterPath`),
    focusLines: arr(record.focusLines, `${field}.focusLines`).map((item, index) =>
      parseFocusLine(item, `${field}.focusLines[${index}]`),
    ),
    candidateHash: hash(record.candidateHash, `${field}.candidateHash`),
  };
}

function pdfAcquisitions(workspace: JsonObject): Map<string, PdfAcquisition> {
  const result = new Map<string, PdfAcquisition>();
  for (const [groupIndex, groupValue] of arr(workspace.groups, "reviewWorkspace.groups").entries()) {
    const group = obj(groupValue, `reviewWorkspace.groups[${groupIndex}]`);
    for (const [documentIndex, documentValue] of arr(
      group.documents,
      `reviewWorkspace.groups[${groupIndex}].documents`,
    ).entries()) {
      const document = obj(
        documentValue,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}]`,
      );
      const id = docID(
        document.docID,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].docID`,
      );
      for (const [acquisitionIndex, acquisitionValue] of arr(
        document.acquisitions,
        `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions`,
      ).entries()) {
        const acquisition = obj(
          acquisitionValue,
          `reviewWorkspace.groups[${groupIndex}].documents[${documentIndex}].acquisitions[${acquisitionIndex}]`,
        );
        if (str(acquisition.documentType) !== "2" || str(acquisition.format) !== "pdf") continue;
        if (result.has(id)) throw new Error(`duplicate type=2 PDF acquisition for ${id}`);
        result.set(id, {
          binaryFile: basenameOnly(acquisition.binaryFile, `PDF ${id}.binaryFile`, ".pdf"),
          sha256: hash(acquisition.sha256, `PDF ${id}.sha256`),
          byteLength: integer(acquisition.byteLength, `PDF ${id}.byteLength`, true),
          retrievedAt: timestamp(acquisition.retrievedAt, `PDF ${id}.retrievedAt`),
        });
      }
    }
  }
  return result;
}

function anchors(candidate: FocusedCandidate): SanrioEdinetPdfAnchor[] {
  const result: SanrioEdinetPdfAnchor[] = [];
  const seen = new Set<string>();
  for (const line of candidate.focusLines.filter(item => item.side === "after")) {
    if (!reviewable(line.text)) continue;
    const normalizedText = normalize(line.text);
    if (seen.has(normalizedText)) continue;
    seen.add(normalizedText);
    const base = {
      sourceLineNumber: line.lineNumber,
      sourceText: line.text,
      normalizedText,
      matchedKeywords: [...line.matchedKeywords].sort(),
    };
    result.push({ ...base, anchorId: `anchor:${digest(base).slice(0, 20)}` });
    if (result.length >= MAX_ANCHORS) break;
  }
  return result;
}

export function buildSanrioEdinetPdfFidelityPlan(input: {
  focusedBundle: unknown;
  sourceFocusedBundleFile: string;
  reviewWorkspace: unknown;
  sourceReviewWorkspaceFile: string;
}): SanrioEdinetPdfFidelityPlan {
  const focused = obj(input.focusedBundle, "focusedBundle");
  if (focused.schemaVersion !== 1 || focused.source !== "edinet") {
    throw new Error("focusedBundle schema/source is unsupported");
  }
  if (focused.reviewStatus !== "pending_human_review" || focused.appendAuthorized !== false) {
    throw new Error("focusedBundle review boundary is invalid");
  }
  verifyIssuer(focused.issuer, "focusedBundle.issuer");
  const sourceFocusedBundleHash = verifyFocusedHash(focused);

  const review = obj(input.reviewWorkspace, "reviewWorkspace");
  if (review.schemaVersion !== 1 || review.source !== "edinet") {
    throw new Error("reviewWorkspace schema/source is unsupported");
  }
  if (review.reviewStatus !== "pending_human_review" || review.appendAuthorized !== false) {
    throw new Error("reviewWorkspace review boundary is invalid");
  }
  verifyIssuer(review.issuer, "reviewWorkspace.issuer");
  const sourceReviewWorkspaceHash = verifyReviewHash(review);
  const pdfs = pdfAcquisitions(review);

  const candidates = arr(focused.candidates, "focusedBundle.candidates")
    .map((value, index) => parseFocusedCandidate(value, `focusedBundle.candidates[${index}]`))
    .map(candidate => {
      const pdf = pdfs.get(candidate.toDocID);
      if (!pdf) throw new Error(`type=2 PDF acquisition missing for ${candidate.toDocID}`);
      return {
        ...candidate,
        pdfBinaryFile: pdf.binaryFile,
        pdfSha256: pdf.sha256,
        pdfByteLength: pdf.byteLength,
        pdfRetrievedAt: pdf.retrievedAt,
        anchors: anchors(candidate),
      };
    })
    .sort((a, b) => `${a.toDocID}|${a.candidateId}`.localeCompare(`${b.toDocID}|${b.candidateId}`));

  if (candidates.length !== integer(focused.candidateCount, "focusedBundle.candidateCount")) {
    throw new Error("focusedBundle.candidateCount mismatch");
  }
  const sourceFocusedBundleFile = basenameOnly(
    input.sourceFocusedBundleFile,
    "sourceFocusedBundleFile",
    ".json",
  );
  const sourceReviewWorkspaceFile = basenameOnly(
    input.sourceReviewWorkspaceFile,
    "sourceReviewWorkspaceFile",
    ".json",
  );
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceFocusedBundleFile,
    sourceFocusedBundleHash,
    sourceReviewWorkspaceFile,
    sourceReviewWorkspaceHash,
    candidateCount: candidates.length,
    uniquePdfCount: new Set(candidates.map(item => item.pdfBinaryFile)).size,
    candidates,
    appendAuthorized: false as const,
  };
  return { ...base, fidelityPlanHash: digest(base) };
}

export function buildSanrioEdinetPdfFidelityReport(input: {
  plan: SanrioEdinetPdfFidelityPlan;
  pdfTexts: SanrioEdinetPdfTextInput[];
  generatedAt?: string;
}): SanrioEdinetPdfFidelityReport {
  const { fidelityPlanHash, ...planWithoutHash } = input.plan;
  if (digest(planWithoutHash) !== fidelityPlanHash) throw new Error("fidelityPlanHash mismatch");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const textByDoc = new Map<string, SanrioEdinetPdfTextInput>();
  for (const item of input.pdfTexts) {
    if (textByDoc.has(item.docID)) throw new Error(`duplicate PDF text for ${item.docID}`);
    textByDoc.set(item.docID, item);
  }

  const candidates = input.plan.candidates.map(candidate => {
    const pdf = textByDoc.get(candidate.toDocID);
    if (!pdf) throw new Error(`PDF text input missing for ${candidate.toDocID}`);
    if (pdf.pdfBinaryFile !== candidate.pdfBinaryFile) {
      throw new Error(`PDF binary mismatch for ${candidate.toDocID}`);
    }
    const extractionAvailable = pdf.text !== null;
    const normalizedPdf = extractionAvailable ? normalize(pdf.text!) : "";
    const anchorResults = candidate.anchors.map(anchor => ({
      anchorId: anchor.anchorId,
      sourceLineNumber: anchor.sourceLineNumber,
      sourceText: anchor.sourceText,
      matchedKeywords: anchor.matchedKeywords,
      matched: extractionAvailable ? normalizedPdf.includes(anchor.normalizedText) : null,
    }));
    const matchedAnchorCount = anchorResults.filter(item => item.matched === true).length;
    const unmatchedAnchorCount = extractionAvailable
      ? anchorResults.filter(item => item.matched === false).length
      : 0;
    const pendingAnchorCount = extractionAvailable ? 0 : anchorResults.length;
    const status: SanrioEdinetPdfFidelityCandidateResult["status"] = !extractionAvailable
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
      extractionMethod: pdf.extractionMethod,
      pdfTextHash: pdf.text === null ? null : createHash("sha256").update(pdf.text).digest("hex"),
      pdfTextLength: pdf.text?.length ?? 0,
      anchorCount: anchorResults.length,
      matchedAnchorCount,
      unmatchedAnchorCount,
      pendingAnchorCount,
      status,
      anchorResults,
      contentEquivalent: "unknown_pending_human_review" as const,
      accountingImpact: "unknown_pending_human_review" as const,
      materiality: "unknown_pending_human_review" as const,
      direction: "unknown_pending_human_review" as const,
    };
    return { ...base, candidateResultHash: digest(base) };
  });

  const extractedPdfCount = new Set(
    input.pdfTexts.filter(item => item.text !== null).map(item => item.pdfBinaryFile),
  ).size;
  const matchedAnchorCount = candidates.reduce((sum, item) => sum + item.matchedAnchorCount, 0);
  const unmatchedAnchorCount = candidates.reduce((sum, item) => sum + item.unmatchedAnchorCount, 0);
  const pendingAnchorCount = candidates.reduce((sum, item) => sum + item.pendingAnchorCount, 0);
  const hashBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    sourceFocusedBundleHash: input.plan.sourceFocusedBundleHash,
    sourceReviewWorkspaceHash: input.plan.sourceReviewWorkspaceHash,
    fidelityPlanHash: input.plan.fidelityPlanHash,
    candidates,
    appendAuthorized: false as const,
  };
  const reportBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
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
    exactCoverageCandidateCount: candidates.filter(item => item.status === "exact_anchor_coverage_complete").length,
    partialCoverageCandidateCount: candidates.filter(item => item.status === "partial_exact_anchor_match").length,
    unavailableCandidateCount: candidates.filter(item => item.status === "pdf_text_extraction_unavailable").length,
    matchedAnchorCount,
    unmatchedAnchorCount,
    pendingAnchorCount,
    reviewStatus: "pending_human_review" as const,
    candidates,
    globalBlockers: [
      "exact_anchor_match_is_not_full_document_equivalence",
      ...(unmatchedAnchorCount > 0
        ? ["unmatched_anchor_may_be_pdf_layout_or_text_extraction_variance"]
        : []),
      ...(pendingAnchorCount > 0
        ? ["pending_anchor_requires_pdf_text_extraction_or_visual_review"]
        : []),
      "human_pdf_visual_review_required",
      "financial_statement_impact_not_confirmed",
      "materiality_not_confirmed",
      "direction_not_confirmed",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false as const,
  };
  return { ...reportBase, fidelityReportHash: digest(hashBase) };
}

export function renderSanrioEdinetPdfFidelityReport(report: SanrioEdinetPdfFidelityReport): string {
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
    `- pendingAnchorCount: ${report.pendingAnchorCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- EDINET API type=1 structured data and type=2 PDF are official acquisition artifacts for the same filing docID.",
    "- Exact anchor coverage confirms selected source lines also appear in extracted PDF text; it does not prove full document equivalence.",
    "- PDF extraction can alter line breaks, spacing, and table order. Unmatched anchors require visual PDF review, not an automatic contradiction finding.",
    "- Pending anchors were not evaluated because PDF text extraction was unavailable; they are not mismatches.",
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
      `- anchors: matched=${candidate.matchedAnchorCount}, unmatched=${candidate.unmatchedAnchorCount}, pending=${candidate.pendingAnchorCount}`,
      "- contentEquivalent/accountingImpact/materiality/direction: unknown_pending_human_review",
      "",
    );
    for (const result of candidate.anchorResults) {
      const marker = result.matched === true ? "x" : result.matched === false ? " " : "?";
      lines.push(`- [${marker}] line ${result.sourceLineNumber}: ${result.sourceText}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
