import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MONEY_TOKEN_RE = /\d[\d,]*(?:\.\d+)?(?:円|千円|万円|百万円)?/g;
const MAX_CONTEXTS_PER_ANCHOR = 8;
const CONTEXT_RADIUS = 2;

type JsonObject = Record<string, unknown>;

type FidelityAnchorResult = {
  anchorId: string;
  sourceLineNumber: number;
  sourceText: string;
  matchedKeywords: string[];
  matched: boolean | null;
};

type FidelityCandidate = {
  candidateId: string;
  toDocID: string;
  path: string;
  pdfBinaryFile: string;
  pdfSha256: string;
  status: string;
  anchorResults: FidelityAnchorResult[];
};

export type SanrioEdinetPdfInspectionInput = {
  docID: string;
  pdfBinaryFile: string;
  pdfText: string;
};

export type SanrioEdinetPdfContext = {
  pageNumber: number;
  startLine: number;
  endLine: number;
  matchedTokens: string[];
  lines: Array<{ lineNumber: number; text: string }>;
};

export type SanrioEdinetUnmatchedAnchorInspection = {
  anchorId: string;
  sourceLineNumber: number;
  sourceText: string;
  matchedKeywords: string[];
  searchTokens: string[];
  contextCount: number;
  contexts: SanrioEdinetPdfContext[];
  diagnosticStatus: "context_candidates_found" | "no_context_candidate_found";
  equivalenceDecision: "unknown_pending_human_review";
  inspectionHash: string;
};

export type SanrioEdinetUnmatchedCandidateInspection = {
  candidateId: string;
  toDocID: string;
  path: string;
  pdfBinaryFile: string;
  pdfSha256: string;
  sourceStatus: string;
  unmatchedAnchorCount: number;
  anchors: SanrioEdinetUnmatchedAnchorInspection[];
  candidateInspectionHash: string;
};

export type SanrioEdinetUnmatchedAnchorReport = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceFidelityReportFile: string;
  sourceFidelityReportHash: string;
  generatedAt: string;
  candidateCount: number;
  unmatchedAnchorCount: number;
  contextCandidateCount: number;
  reviewStatus: "pending_human_review";
  candidates: SanrioEdinetUnmatchedCandidateInspection[];
  globalBlockers: string[];
  appendAuthorized: false;
  reportHash: string;
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

function requireHash(value: unknown, field: string): string {
  const result = required(value, field);
  if (!HASH_RE.test(result)) throw new Error(`${field} must be a SHA-256 hash`);
  return result;
}

function requireDocID(value: unknown, field: string): string {
  const result = required(value, field);
  if (!DOC_ID_RE.test(result)) throw new Error(`${field} must be a valid EDINET docID`);
  return result;
}

function requirePositiveInteger(value: unknown, field: string): number {
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

function verifyFidelityReport(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("fidelityReport schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("fidelityReport safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "fidelityReport.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("fidelityReport issuer is not Sanrio");
  }
  const expected = requireHash(record.fidelityReportHash, "fidelityReport.fidelityReportHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceFocusedBundleHash: record.sourceFocusedBundleHash,
    sourceReviewWorkspaceHash: record.sourceReviewWorkspaceHash,
    fidelityPlanHash: record.fidelityPlanHash,
    candidates: record.candidates,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("fidelityReport.fidelityReportHash mismatch");
  return expected;
}

function parseAnchor(value: unknown, field: string): FidelityAnchorResult {
  const record = obj(value, field);
  const matched = record.matched;
  if (matched !== true && matched !== false && matched !== null) {
    throw new Error(`${field}.matched must be true, false, or null`);
  }
  return {
    anchorId: required(record.anchorId, `${field}.anchorId`),
    sourceLineNumber: requirePositiveInteger(record.sourceLineNumber, `${field}.sourceLineNumber`),
    sourceText: required(record.sourceText, `${field}.sourceText`),
    matchedKeywords: arr(record.matchedKeywords, `${field}.matchedKeywords`).map((item, index) =>
      required(item, `${field}.matchedKeywords[${index}]`),
    ),
    matched,
  };
}

function parseCandidate(value: unknown, field: string): FidelityCandidate {
  const record = obj(value, field);
  return {
    candidateId: required(record.candidateId, `${field}.candidateId`),
    toDocID: requireDocID(record.toDocID, `${field}.toDocID`),
    path: required(record.path, `${field}.path`),
    pdfBinaryFile: required(record.pdfBinaryFile, `${field}.pdfBinaryFile`),
    pdfSha256: requireHash(record.pdfSha256, `${field}.pdfSha256`),
    status: required(record.status, `${field}.status`),
    anchorResults: arr(record.anchorResults, `${field}.anchorResults`).map((item, index) =>
      parseAnchor(item, `${field}.anchorResults[${index}]`),
    ),
  };
}

function searchTokens(anchor: FidelityAnchorResult): string[] {
  const tokens = new Set<string>();
  for (const keyword of anchor.matchedKeywords) {
    const normalized = normalize(keyword);
    if (normalized.length >= 2) tokens.add(keyword);
  }
  for (const token of anchor.sourceText.normalize("NFKC").match(MONEY_TOKEN_RE) ?? []) {
    const normalized = normalize(token);
    if (/\d/.test(normalized)) tokens.add(token);
  }
  return [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function contextsForAnchor(pdfText: string, anchor: FidelityAnchorResult): SanrioEdinetPdfContext[] {
  const tokens = searchTokens(anchor);
  if (tokens.length === 0) return [];
  const normalizedTokens = tokens.map(token => ({ original: token, normalized: normalize(token) }));
  const contexts: SanrioEdinetPdfContext[] = [];
  const identities = new Set<string>();
  for (const [pageIndex, page] of pdfText.split("\f").entries()) {
    const lines = page.split("\n");
    for (const [lineIndex, line] of lines.entries()) {
      const normalizedLine = normalize(line);
      const matchedTokens = normalizedTokens
        .filter(token => normalizedLine.includes(token.normalized))
        .map(token => token.original);
      if (matchedTokens.length === 0) continue;
      const start = Math.max(0, lineIndex - CONTEXT_RADIUS);
      const end = Math.min(lines.length - 1, lineIndex + CONTEXT_RADIUS);
      const identity = `${pageIndex + 1}|${start + 1}|${end + 1}`;
      if (identities.has(identity)) continue;
      identities.add(identity);
      contexts.push({
        pageNumber: pageIndex + 1,
        startLine: start + 1,
        endLine: end + 1,
        matchedTokens: [...new Set(matchedTokens)].sort(),
        lines: lines.slice(start, end + 1).map((text, offset) => ({
          lineNumber: start + offset + 1,
          text: text.slice(0, 2000),
        })),
      });
      if (contexts.length >= MAX_CONTEXTS_PER_ANCHOR) return contexts;
    }
  }
  return contexts;
}

export function buildSanrioEdinetUnmatchedAnchorReport(input: {
  fidelityReport: unknown;
  sourceFidelityReportFile: string;
  pdfInputs: SanrioEdinetPdfInspectionInput[];
  generatedAt?: string;
}): SanrioEdinetUnmatchedAnchorReport {
  const fidelity = obj(input.fidelityReport, "fidelityReport");
  const sourceFidelityReportHash = verifyFidelityReport(fidelity);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  parseExplicitIso8601Instant(generatedAt, "generatedAt");
  const sourceFidelityReportFile = required(input.sourceFidelityReportFile, "sourceFidelityReportFile");
  if (sourceFidelityReportFile.includes("/") || sourceFidelityReportFile.includes("\\") || !sourceFidelityReportFile.endsWith(".json")) {
    throw new Error("sourceFidelityReportFile must be a local JSON basename");
  }

  const pdfByDoc = new Map<string, SanrioEdinetPdfInspectionInput>();
  for (const pdf of input.pdfInputs) {
    if (pdfByDoc.has(pdf.docID)) throw new Error(`duplicate PDF input for ${pdf.docID}`);
    if (!pdf.pdfText.trim()) throw new Error(`PDF text is empty for ${pdf.docID}`);
    pdfByDoc.set(pdf.docID, pdf);
  }

  const candidates = arr(fidelity.candidates, "fidelityReport.candidates")
    .map((item, index) => parseCandidate(item, `fidelityReport.candidates[${index}]`))
    .filter(candidate => candidate.anchorResults.some(anchor => anchor.matched === false))
    .map(candidate => {
      const pdf = pdfByDoc.get(candidate.toDocID);
      if (!pdf) throw new Error(`PDF text input missing for ${candidate.toDocID}`);
      if (pdf.pdfBinaryFile !== candidate.pdfBinaryFile) {
        throw new Error(`PDF binary mismatch for ${candidate.toDocID}`);
      }
      const anchors = candidate.anchorResults
        .filter(anchor => anchor.matched === false)
        .map(anchor => {
          const contexts = contextsForAnchor(pdf.pdfText, anchor);
          const base = {
            anchorId: anchor.anchorId,
            sourceLineNumber: anchor.sourceLineNumber,
            sourceText: anchor.sourceText,
            matchedKeywords: anchor.matchedKeywords,
            searchTokens: searchTokens(anchor),
            contextCount: contexts.length,
            contexts,
            diagnosticStatus: contexts.length > 0
              ? "context_candidates_found" as const
              : "no_context_candidate_found" as const,
            equivalenceDecision: "unknown_pending_human_review" as const,
          };
          return { ...base, inspectionHash: digest(base) };
        });
      const base = {
        candidateId: candidate.candidateId,
        toDocID: candidate.toDocID,
        path: candidate.path,
        pdfBinaryFile: candidate.pdfBinaryFile,
        pdfSha256: candidate.pdfSha256,
        sourceStatus: candidate.status,
        unmatchedAnchorCount: anchors.length,
        anchors,
      };
      return { ...base, candidateInspectionHash: digest(base) };
    });

  if (candidates.length === 0) throw new Error("fidelityReport has no unmatched anchors");
  const hashBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    sourceFidelityReportHash,
    candidates,
    appendAuthorized: false as const,
  };
  const reportBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceFidelityReportFile,
    sourceFidelityReportHash,
    generatedAt,
    candidateCount: candidates.length,
    unmatchedAnchorCount: candidates.reduce((sum, candidate) => sum + candidate.unmatchedAnchorCount, 0),
    contextCandidateCount: candidates.reduce(
      (sum, candidate) => sum + candidate.anchors.reduce((inner, anchor) => inner + anchor.contextCount, 0),
      0,
    ),
    reviewStatus: "pending_human_review" as const,
    candidates,
    globalBlockers: [
      "diagnostic_context_is_not_equivalence_confirmation",
      "human_pdf_visual_review_required",
      "financial_statement_impact_not_confirmed",
      "materiality_not_confirmed",
      "direction_not_confirmed",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false as const,
  };
  return { ...reportBase, reportHash: digest(hashBase) };
}

export function renderSanrioEdinetUnmatchedAnchorReport(
  report: SanrioEdinetUnmatchedAnchorReport,
): string {
  const lines = [
    "# Sanrio EDINET unmatched PDF anchor inspection",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- sourceFidelityReportFile: ${report.sourceFidelityReportFile}`,
    `- sourceFidelityReportHash: ${report.sourceFidelityReportHash}`,
    `- reportHash: ${report.reportHash}`,
    `- candidateCount: ${report.candidateCount}`,
    `- unmatchedAnchorCount: ${report.unmatchedAnchorCount}`,
    `- contextCandidateCount: ${report.contextCandidateCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- Context candidates are exact keyword/number hits near the unmatched anchor; they are not fuzzy equivalence decisions.",
    "- PDF line wrapping and table layout can prevent a full-line anchor match even when the same facts are visible.",
    "- The final determination remains a human visual review of the cited PDF page.",
    "",
  ];
  for (const candidate of report.candidates) {
    lines.push(
      `## ${candidate.toDocID} — ${candidate.path}`,
      "",
      `- PDF: ${candidate.pdfBinaryFile}`,
      `- PDF SHA-256: ${candidate.pdfSha256}`,
      `- sourceStatus: ${candidate.sourceStatus}`,
      `- unmatchedAnchorCount: ${candidate.unmatchedAnchorCount}`,
      "",
    );
    for (const anchor of candidate.anchors) {
      lines.push(
        `### ${anchor.anchorId}`,
        "",
        `- sourceLineNumber: ${anchor.sourceLineNumber}`,
        `- sourceText: ${anchor.sourceText}`,
        `- searchTokens: ${anchor.searchTokens.join(", ") || "(none)"}`,
        `- diagnosticStatus: ${anchor.diagnosticStatus}`,
        `- equivalenceDecision: ${anchor.equivalenceDecision}`,
        "",
      );
      for (const [index, context] of anchor.contexts.entries()) {
        lines.push(
          `#### Context ${index + 1} — PDF page ${context.pageNumber}, lines ${context.startLine}-${context.endLine}`,
          "",
          `- matchedTokens: ${context.matchedTokens.join(", ")}`,
          "",
          "```text",
          ...context.lines.map(line => `${line.lineNumber}: ${line.text}`),
          "```",
          "",
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
