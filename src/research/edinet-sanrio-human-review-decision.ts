import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

type JsonObject = Record<string, unknown>;

export type SanrioEdinetReviewImpact = "yes" | "no" | "unknown";
export type SanrioEdinetCorrectionScope =
  | "governance_disclosure_only"
  | "financial_statement_change"
  | "mixed"
  | "no_substantive_change"
  | "unknown";
export type SanrioEdinetEquivalenceDecision =
  | "pending_human_review"
  | "equivalent_layout_variance"
  | "substantively_different"
  | "insufficient_visual_evidence";

export type SanrioEdinetReviewAmount = {
  amountText: string;
  currency: string;
  period: string;
  recipient: string;
  payer: string;
  sourcePage: number;
};

export type SanrioEdinetHumanReviewAnchor = {
  anchorId: string;
  candidateId: string;
  toDocID: string;
  path: string;
  pdfBinaryFile: string;
  pdfSha256: string;
  sourceLineNumber: number;
  sourceText: string;
  contextCount: number;
  availableContextPages: number[];
  equivalenceDecision: SanrioEdinetEquivalenceDecision;
  selectedContextNumbers: number[];
  manualPdfPages: number[];
  confirmedFacts: string[];
  previouslyKnownFacts: string[];
  assumptions: string[];
  opinions: string[];
  exactAmounts: SanrioEdinetReviewAmount[];
  correctionScope: SanrioEdinetCorrectionScope;
  financialStatementImpact: SanrioEdinetReviewImpact;
  internalControlImpact: SanrioEdinetReviewImpact;
  auditOpinionImpact: SanrioEdinetReviewImpact;
  pdfVisualConfirmation: boolean;
  reviewerNotes: string;
  completed: boolean;
  anchorDecisionHash: string;
};

export type SanrioEdinetHumanReviewRecord = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceInspectionFile: string;
  sourceInspectionHash: string;
  generatedAt: string;
  reviewer: string;
  reviewedAt: string | null;
  reviewStatus: "draft_human_input" | "complete_human_review";
  anchorCount: number;
  completedAnchorCount: number;
  anchors: SanrioEdinetHumanReviewAnchor[];
  foundationPreviewEligible: false;
  globalBlockers: string[];
  appendAuthorized: false;
  recordHash: string;
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

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, field: string): number {
  const result = nonNegativeInteger(value, field);
  if (result === 0) throw new Error(`${field} must be a positive integer`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function stringArray(value: unknown, field: string): string[] {
  return arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
}

function integerArray(value: unknown, field: string): number[] {
  const result = arr(value, field).map((item, index) => positiveInteger(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${field} must not contain duplicates`);
  return result.sort((a, b) => a - b);
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

function verifyInspectionReport(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("inspectionReport schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("inspectionReport safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "inspectionReport.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("inspectionReport issuer is not Sanrio");
  }
  const expected = requireHash(record.reportHash, "inspectionReport.reportHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceFidelityReportHash: record.sourceFidelityReportHash,
    candidates: record.candidates,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("inspectionReport.reportHash mismatch");
  return expected;
}

function inspectionAnchors(report: JsonObject): Array<{
  anchorId: string;
  candidateId: string;
  toDocID: string;
  path: string;
  pdfBinaryFile: string;
  pdfSha256: string;
  sourceLineNumber: number;
  sourceText: string;
  contextCount: number;
  availableContextPages: number[];
}> {
  const results: Array<{
    anchorId: string;
    candidateId: string;
    toDocID: string;
    path: string;
    pdfBinaryFile: string;
    pdfSha256: string;
    sourceLineNumber: number;
    sourceText: string;
    contextCount: number;
    availableContextPages: number[];
  }> = [];
  for (const [candidateIndex, candidateValue] of arr(report.candidates, "inspectionReport.candidates").entries()) {
    const candidate = obj(candidateValue, `inspectionReport.candidates[${candidateIndex}]`);
    const candidateId = required(candidate.candidateId, `inspectionReport.candidates[${candidateIndex}].candidateId`);
    const toDocID = requireDocID(candidate.toDocID, `inspectionReport.candidates[${candidateIndex}].toDocID`);
    const path = required(candidate.path, `inspectionReport.candidates[${candidateIndex}].path`);
    const pdfBinaryFile = required(candidate.pdfBinaryFile, `inspectionReport.candidates[${candidateIndex}].pdfBinaryFile`);
    const pdfSha256 = requireHash(candidate.pdfSha256, `inspectionReport.candidates[${candidateIndex}].pdfSha256`);
    for (const [anchorIndex, anchorValue] of arr(candidate.anchors, `inspectionReport.candidates[${candidateIndex}].anchors`).entries()) {
      const anchor = obj(anchorValue, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}]`);
      const contexts = arr(anchor.contexts, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].contexts`);
      const pages = contexts.map((contextValue, contextIndex) => {
        const context = obj(contextValue, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].contexts[${contextIndex}]`);
        return positiveInteger(context.pageNumber, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].contexts[${contextIndex}].pageNumber`);
      });
      results.push({
        anchorId: required(anchor.anchorId, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].anchorId`),
        candidateId,
        toDocID,
        path,
        pdfBinaryFile,
        pdfSha256,
        sourceLineNumber: positiveInteger(anchor.sourceLineNumber, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].sourceLineNumber`),
        sourceText: required(anchor.sourceText, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].sourceText`),
        contextCount: nonNegativeInteger(anchor.contextCount, `inspectionReport.candidates[${candidateIndex}].anchors[${anchorIndex}].contextCount`),
        availableContextPages: [...new Set(pages)].sort((a, b) => a - b),
      });
    }
  }
  if (results.length === 0) throw new Error("inspectionReport has no review anchors");
  return results.sort((a, b) => `${a.toDocID}|${a.anchorId}`.localeCompare(`${b.toDocID}|${b.anchorId}`));
}

function anchorHashPayload(anchor: Omit<SanrioEdinetHumanReviewAnchor, "anchorDecisionHash">): unknown {
  return anchor;
}

export function buildSanrioEdinetHumanReviewTemplate(input: {
  inspectionReport: unknown;
  sourceInspectionFile: string;
  generatedAt?: string;
}): SanrioEdinetHumanReviewRecord {
  const inspection = obj(input.inspectionReport, "inspectionReport");
  const sourceInspectionHash = verifyInspectionReport(inspection);
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const sourceInspectionFile = localJsonBasename(input.sourceInspectionFile, "sourceInspectionFile");
  const anchors = inspectionAnchors(inspection).map(source => {
    const base: Omit<SanrioEdinetHumanReviewAnchor, "anchorDecisionHash"> = {
      ...source,
      equivalenceDecision: "pending_human_review",
      selectedContextNumbers: [],
      manualPdfPages: [],
      confirmedFacts: [],
      previouslyKnownFacts: [],
      assumptions: [],
      opinions: [],
      exactAmounts: [],
      correctionScope: "unknown",
      financialStatementImpact: "unknown",
      internalControlImpact: "unknown",
      auditOpinionImpact: "unknown",
      pdfVisualConfirmation: false,
      reviewerNotes: "",
      completed: false,
    };
    return { ...base, anchorDecisionHash: digest(anchorHashPayload(base)) };
  });
  const recordBase = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceInspectionFile,
    sourceInspectionHash,
    generatedAt,
    reviewer: "",
    reviewedAt: null,
    reviewStatus: "draft_human_input" as const,
    anchorCount: anchors.length,
    completedAnchorCount: 0,
    anchors,
    foundationPreviewEligible: false as const,
    globalBlockers: [
      "human_reviewer_identity_required",
      "all_anchor_decisions_required",
      "visual_pdf_confirmation_required",
      "foundation_security_master_and_pit_fields_not_provided",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false as const,
  };
  return { ...recordBase, recordHash: digest(recordBase) };
}

function parseImpact(value: unknown, field: string): SanrioEdinetReviewImpact {
  const result = required(value, field);
  if (result !== "yes" && result !== "no" && result !== "unknown") throw new Error(`${field} is invalid`);
  return result;
}

function parseScope(value: unknown, field: string): SanrioEdinetCorrectionScope {
  const result = required(value, field);
  if (!["governance_disclosure_only", "financial_statement_change", "mixed", "no_substantive_change", "unknown"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as SanrioEdinetCorrectionScope;
}

function parseDecision(value: unknown, field: string): SanrioEdinetEquivalenceDecision {
  const result = required(value, field);
  if (!["pending_human_review", "equivalent_layout_variance", "substantively_different", "insufficient_visual_evidence"].includes(result)) {
    throw new Error(`${field} is invalid`);
  }
  return result as SanrioEdinetEquivalenceDecision;
}

function parseAmounts(value: unknown, field: string): SanrioEdinetReviewAmount[] {
  return arr(value, field).map((amountValue, index) => {
    const amount = obj(amountValue, `${field}[${index}]`);
    return {
      amountText: required(amount.amountText, `${field}[${index}].amountText`),
      currency: required(amount.currency, `${field}[${index}].currency`),
      period: required(amount.period, `${field}[${index}].period`),
      recipient: required(amount.recipient, `${field}[${index}].recipient`),
      payer: required(amount.payer, `${field}[${index}].payer`),
      sourcePage: positiveInteger(amount.sourcePage, `${field}[${index}].sourcePage`),
    };
  });
}

export function validateSanrioEdinetHumanReviewRecord(input: unknown): SanrioEdinetHumanReviewRecord {
  const record = obj(input, "reviewRecord");
  if (record.schemaVersion !== 1 || record.source !== "edinet") throw new Error("reviewRecord schema/source is unsupported");
  if (record.appendAuthorized !== false || record.foundationPreviewEligible !== false) {
    throw new Error("reviewRecord append/foundation boundary is invalid");
  }
  const issuer = obj(record.issuer, "reviewRecord.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") throw new Error("reviewRecord issuer is not Sanrio");
  const expectedRecordHash = requireHash(record.recordHash, "reviewRecord.recordHash");
  const { recordHash: _ignoredRecordHash, ...recordWithoutHash } = record;
  if (digest(recordWithoutHash) !== expectedRecordHash) throw new Error("reviewRecord.recordHash mismatch");

  const reviewer = required(record.reviewer, "reviewRecord.reviewer");
  const reviewedAt = timestamp(record.reviewedAt, "reviewRecord.reviewedAt");
  if (record.reviewStatus !== "complete_human_review") throw new Error("reviewRecord.reviewStatus must be complete_human_review");
  const anchors = arr(record.anchors, "reviewRecord.anchors").map((anchorValue, index) => {
    const anchor = obj(anchorValue, `reviewRecord.anchors[${index}]`);
    const expectedAnchorHash = requireHash(anchor.anchorDecisionHash, `reviewRecord.anchors[${index}].anchorDecisionHash`);
    const decision = parseDecision(anchor.equivalenceDecision, `reviewRecord.anchors[${index}].equivalenceDecision`);
    const selectedContextNumbers = integerArray(anchor.selectedContextNumbers, `reviewRecord.anchors[${index}].selectedContextNumbers`);
    const manualPdfPages = integerArray(anchor.manualPdfPages, `reviewRecord.anchors[${index}].manualPdfPages`);
    const contextCount = nonNegativeInteger(anchor.contextCount, `reviewRecord.anchors[${index}].contextCount`);
    if (selectedContextNumbers.some(number => number > contextCount)) {
      throw new Error(`reviewRecord.anchors[${index}].selectedContextNumbers exceeds contextCount`);
    }
    if (anchor.completed !== true) throw new Error(`reviewRecord.anchors[${index}] must be completed`);
    if (decision === "pending_human_review") throw new Error(`reviewRecord.anchors[${index}] decision is still pending`);
    if (anchor.pdfVisualConfirmation !== true) throw new Error(`reviewRecord.anchors[${index}] requires PDF visual confirmation`);
    if (selectedContextNumbers.length === 0 && manualPdfPages.length === 0) {
      throw new Error(`reviewRecord.anchors[${index}] requires a selected context or manual PDF page`);
    }
    const confirmedFacts = stringArray(anchor.confirmedFacts, `reviewRecord.anchors[${index}].confirmedFacts`);
    if (decision !== "insufficient_visual_evidence" && confirmedFacts.length === 0) {
      throw new Error(`reviewRecord.anchors[${index}] requires at least one confirmed fact`);
    }
    const base: Omit<SanrioEdinetHumanReviewAnchor, "anchorDecisionHash"> = {
      anchorId: required(anchor.anchorId, `reviewRecord.anchors[${index}].anchorId`),
      candidateId: required(anchor.candidateId, `reviewRecord.anchors[${index}].candidateId`),
      toDocID: requireDocID(anchor.toDocID, `reviewRecord.anchors[${index}].toDocID`),
      path: required(anchor.path, `reviewRecord.anchors[${index}].path`),
      pdfBinaryFile: required(anchor.pdfBinaryFile, `reviewRecord.anchors[${index}].pdfBinaryFile`),
      pdfSha256: requireHash(anchor.pdfSha256, `reviewRecord.anchors[${index}].pdfSha256`),
      sourceLineNumber: positiveInteger(anchor.sourceLineNumber, `reviewRecord.anchors[${index}].sourceLineNumber`),
      sourceText: required(anchor.sourceText, `reviewRecord.anchors[${index}].sourceText`),
      contextCount,
      availableContextPages: integerArray(anchor.availableContextPages, `reviewRecord.anchors[${index}].availableContextPages`),
      equivalenceDecision: decision,
      selectedContextNumbers,
      manualPdfPages,
      confirmedFacts,
      previouslyKnownFacts: stringArray(anchor.previouslyKnownFacts, `reviewRecord.anchors[${index}].previouslyKnownFacts`),
      assumptions: stringArray(anchor.assumptions, `reviewRecord.anchors[${index}].assumptions`),
      opinions: stringArray(anchor.opinions, `reviewRecord.anchors[${index}].opinions`),
      exactAmounts: parseAmounts(anchor.exactAmounts, `reviewRecord.anchors[${index}].exactAmounts`),
      correctionScope: parseScope(anchor.correctionScope, `reviewRecord.anchors[${index}].correctionScope`),
      financialStatementImpact: parseImpact(anchor.financialStatementImpact, `reviewRecord.anchors[${index}].financialStatementImpact`),
      internalControlImpact: parseImpact(anchor.internalControlImpact, `reviewRecord.anchors[${index}].internalControlImpact`),
      auditOpinionImpact: parseImpact(anchor.auditOpinionImpact, `reviewRecord.anchors[${index}].auditOpinionImpact`),
      pdfVisualConfirmation: true,
      reviewerNotes: str(anchor.reviewerNotes),
      completed: true,
    };
    if (digest(anchorHashPayload(base)) !== expectedAnchorHash) throw new Error(`reviewRecord.anchors[${index}].anchorDecisionHash mismatch`);
    return { ...base, anchorDecisionHash: expectedAnchorHash };
  });
  const anchorCount = positiveInteger(record.anchorCount, "reviewRecord.anchorCount");
  const completedAnchorCount = positiveInteger(record.completedAnchorCount, "reviewRecord.completedAnchorCount");
  if (anchors.length !== anchorCount || completedAnchorCount !== anchorCount) throw new Error("reviewRecord anchor counts mismatch");
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: {
      name: "株式会社サンリオ",
      edinetCode: "E02655",
      secCode: "81360",
    },
    sourceInspectionFile: localJsonBasename(record.sourceInspectionFile, "reviewRecord.sourceInspectionFile"),
    sourceInspectionHash: requireHash(record.sourceInspectionHash, "reviewRecord.sourceInspectionHash"),
    generatedAt: timestamp(record.generatedAt, "reviewRecord.generatedAt"),
    reviewer,
    reviewedAt,
    reviewStatus: "complete_human_review",
    anchorCount,
    completedAnchorCount,
    anchors,
    foundationPreviewEligible: false,
    globalBlockers: stringArray(record.globalBlockers, "reviewRecord.globalBlockers"),
    appendAuthorized: false,
    recordHash: expectedRecordHash,
  };
}

export function renderSanrioEdinetHumanReviewRecord(record: SanrioEdinetHumanReviewRecord): string {
  const lines = [
    "# Sanrio EDINET human review decision",
    "",
    `- sourceInspectionFile: ${record.sourceInspectionFile}`,
    `- sourceInspectionHash: ${record.sourceInspectionHash}`,
    `- recordHash: ${record.recordHash}`,
    `- reviewStatus: ${record.reviewStatus}`,
    `- reviewer: ${record.reviewer || "(fill required)"}`,
    `- reviewedAt: ${record.reviewedAt ?? "(fill required)"}`,
    `- anchors: ${record.completedAnchorCount}/${record.anchorCount} completed`,
    "- foundationPreviewEligible: false",
    "- appendAuthorized: false",
    "",
    "## Boundary",
    "",
    "- Confirmed facts, previously known facts, assumptions, and opinions must remain separate.",
    "- A complete record still cannot append Evidence or Foundation data automatically.",
    "- Security Master identity, PIT timestamps, licensing, and normalized section hashes remain separate gates.",
    "",
  ];
  for (const [index, anchor] of record.anchors.entries()) {
    lines.push(
      `## Anchor ${index + 1}: ${anchor.anchorId}`,
      "",
      `- docID: ${anchor.toDocID}`,
      `- sourceText: ${anchor.sourceText}`,
      `- PDF: ${anchor.pdfBinaryFile}`,
      `- availableContextPages: ${anchor.availableContextPages.join(", ") || "(none)"}`,
      `- equivalenceDecision: ${anchor.equivalenceDecision}`,
      `- selectedContextNumbers: ${anchor.selectedContextNumbers.join(", ") || "(none)"}`,
      `- manualPdfPages: ${anchor.manualPdfPages.join(", ") || "(none)"}`,
      `- correctionScope: ${anchor.correctionScope}`,
      `- financialStatementImpact: ${anchor.financialStatementImpact}`,
      `- internalControlImpact: ${anchor.internalControlImpact}`,
      `- auditOpinionImpact: ${anchor.auditOpinionImpact}`,
      `- pdfVisualConfirmation: ${anchor.pdfVisualConfirmation}`,
      `- completed: ${anchor.completed}`,
      "",
      "### Confirmed facts",
      ...(anchor.confirmedFacts.length ? anchor.confirmedFacts.map(item => `- ${item}`) : ["- (fill required)"]),
      "",
      "### Previously known facts",
      ...(anchor.previouslyKnownFacts.length ? anchor.previouslyKnownFacts.map(item => `- ${item}`) : ["- (none yet)"]),
      "",
      "### Assumptions",
      ...(anchor.assumptions.length ? anchor.assumptions.map(item => `- ${item}`) : ["- (none yet)"]),
      "",
      "### Opinions",
      ...(anchor.opinions.length ? anchor.opinions.map(item => `- ${item}`) : ["- (none yet)"]),
      "",
      "### Exact amounts",
      ...(anchor.exactAmounts.length
        ? anchor.exactAmounts.map(item => `- ${item.amountText} | ${item.currency} | ${item.period} | recipient=${item.recipient} | payer=${item.payer} | PDF p.${item.sourcePage}`)
        : ["- (none yet)"]),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
