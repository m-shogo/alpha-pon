import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const MAX_TEXT_LENGTH = 5_000_000;
const MAX_REVIEW_LINES_PER_SIDE = 500;
const NUMERIC_TOKEN_RE = /[-+−]?\d[\d,]*(?:\.\d+)?(?:円|千円|万円|百万円|億円|兆円|%|％|株|人|件|回|年|月|日)?/g;
const FOOTNOTE_RE = /^(?:注(?:記)?[：:]?|[（(]注[）)]|※|[*＊])/;
const ACCOUNTING_KEYWORDS = [
  "財務諸表",
  "連結財務諸表",
  "貸借対照表",
  "損益計算書",
  "包括利益",
  "キャッシュ・フロー",
  "キャッシュフロー",
  "売上高",
  "営業利益",
  "経常利益",
  "当期純利益",
  "資産",
  "負債",
  "純資産",
  "引当金",
  "減損",
  "税金",
  "関連当事者",
  "偶発債務",
  "継続企業",
  "内部統制",
  "監査意見",
  "役員の報酬",
] as const;

type JsonObject = Record<string, unknown>;

export type SanrioEdinetReviewNextContentPlanCandidate = {
  candidateId: string;
  batchId: string;
  sourceClusterId: string;
  strategy: "review_all_candidates_first" | "review_representative_then_confirm_pair";
  pairId: string;
  fromDocID: string;
  toDocID: string;
  path: string;
  beforePath: string | null;
  afterPath: string | null;
  logicalRoleKey: string;
  changeType: "added" | "removed" | "modified";
  reviewSignals: string[];
};

export type SanrioEdinetReviewNextContentPlan = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceBatchWorkspaceFile: string;
  sourceBatchWorkspaceHash: string;
  candidateCount: number;
  candidates: SanrioEdinetReviewNextContentPlanCandidate[];
  appendAuthorized: false;
  planHash: string;
};

export type SanrioEdinetReviewNextContentInput = {
  candidateId: string;
  beforeText: string | null;
  afterText: string | null;
};

export type SanrioEdinetReviewLineCandidate = {
  side: "before" | "after";
  lineNumber: number;
  text: string;
  candidateTypes: Array<"numeric_line" | "footnote_line" | "accounting_keyword_line">;
  numericTokens: string[];
  matchedKeywords: string[];
};

export type SanrioEdinetReviewNextContentCandidate = SanrioEdinetReviewNextContentPlanCandidate & {
  beforeText: string | null;
  afterText: string | null;
  beforeTextHash: string | null;
  afterTextHash: string | null;
  beforeLineCount: number;
  afterLineCount: number;
  reviewLines: SanrioEdinetReviewLineCandidate[];
  numericLineCount: number;
  footnoteLineCount: number;
  accountingKeywordLineCount: number;
  factStatus: "unreviewed_source_text";
  accountingImpact: "unknown_pending_human_review";
  internalControlImpact: "unknown_pending_human_review";
  auditOpinionImpact: "unknown_pending_human_review";
  candidateHash: string;
};

export type SanrioEdinetReviewNextContentBundle = {
  schemaVersion: 1;
  source: "edinet";
  issuer: SanrioEdinetReviewNextContentPlan["issuer"];
  sourceBatchWorkspaceFile: string;
  sourceBatchWorkspaceHash: string;
  planHash: string;
  generatedAt: string;
  candidateCount: number;
  numericLineCount: number;
  footnoteLineCount: number;
  accountingKeywordLineCount: number;
  reviewStatus: "pending_human_review";
  candidates: SanrioEdinetReviewNextContentCandidate[];
  globalBlockers: string[];
  appendAuthorized: false;
  bundleHash: string;
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

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function strings(value: unknown, field: string): string[] {
  return arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
}

function nullablePath(value: unknown, field: string): string | null {
  if (value === null) return null;
  return required(value, field);
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

function verifyBatchWorkspace(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("batchWorkspace schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("batchWorkspace safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "batchWorkspace.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("batchWorkspace issuer is not Sanrio");
  }
  const expected = requireHash(record.workspaceHash, "batchWorkspace.workspaceHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceTriageWorkspaceHash: record.sourceTriageWorkspaceHash,
    clusters: record.clusters,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("batchWorkspace.workspaceHash mismatch");
  return expected;
}

function parsePlanCandidate(input: {
  candidate: JsonObject;
  candidateField: string;
  batchId: string;
  sourceClusterId: string;
  strategy: SanrioEdinetReviewNextContentPlanCandidate["strategy"];
}): SanrioEdinetReviewNextContentPlanCandidate {
  const changeType = required(input.candidate.changeType, `${input.candidateField}.changeType`);
  if (changeType !== "added" && changeType !== "removed" && changeType !== "modified") {
    throw new Error(`${input.candidateField}.changeType is unsupported`);
  }
  return {
    candidateId: required(input.candidate.candidateId, `${input.candidateField}.candidateId`),
    batchId: input.batchId,
    sourceClusterId: input.sourceClusterId,
    strategy: input.strategy,
    pairId: required(input.candidate.pairId, `${input.candidateField}.pairId`),
    fromDocID: requireDocID(input.candidate.fromDocID, `${input.candidateField}.fromDocID`),
    toDocID: requireDocID(input.candidate.toDocID, `${input.candidateField}.toDocID`),
    path: required(input.candidate.path, `${input.candidateField}.path`),
    beforePath: nullablePath(input.candidate.beforePath, `${input.candidateField}.beforePath`),
    afterPath: nullablePath(input.candidate.afterPath, `${input.candidateField}.afterPath`),
    logicalRoleKey: required(input.candidate.logicalRoleKey, `${input.candidateField}.logicalRoleKey`),
    changeType,
    reviewSignals: strings(input.candidate.reviewSignals, `${input.candidateField}.reviewSignals`).sort(),
  };
}

export function buildSanrioEdinetReviewNextContentPlan(input: {
  batchWorkspace: unknown;
  sourceBatchWorkspaceFile: string;
}): SanrioEdinetReviewNextContentPlan {
  const source = obj(input.batchWorkspace, "batchWorkspace");
  const sourceBatchWorkspaceHash = verifyBatchWorkspace(source);
  const sourceBatchWorkspaceFile = localJsonBasename(input.sourceBatchWorkspaceFile, "sourceBatchWorkspaceFile");
  const expectedInitialCount = nonNegativeInteger(
    source.initialReviewCandidateCount,
    "batchWorkspace.initialReviewCandidateCount",
  );
  const candidates: SanrioEdinetReviewNextContentPlanCandidate[] = [];
  const seen = new Set<string>();

  for (const [clusterIndex, clusterValue] of arr(source.clusters, "batchWorkspace.clusters").entries()) {
    const cluster = obj(clusterValue, `batchWorkspace.clusters[${clusterIndex}]`);
    const batchId = required(cluster.batchId, `batchWorkspace.clusters[${clusterIndex}].batchId`);
    const sourceClusterId = required(
      cluster.sourceClusterId,
      `batchWorkspace.clusters[${clusterIndex}].sourceClusterId`,
    );
    const strategyValue = required(cluster.strategy, `batchWorkspace.clusters[${clusterIndex}].strategy`);
    if (strategyValue !== "review_all_candidates_first" && strategyValue !== "review_representative_then_confirm_pair") {
      throw new Error(`batchWorkspace.clusters[${clusterIndex}].strategy is unsupported`);
    }
    const initialIds = strings(
      cluster.initialReviewCandidateIds,
      `batchWorkspace.clusters[${clusterIndex}].initialReviewCandidateIds`,
    );
    const deferredIds = new Set(strings(
      cluster.deferredPairConfirmationCandidateIds,
      `batchWorkspace.clusters[${clusterIndex}].deferredPairConfirmationCandidateIds`,
    ));
    const candidateById = new Map<string, JsonObject>();
    for (const [candidateIndex, candidateValue] of arr(
      cluster.candidates,
      `batchWorkspace.clusters[${clusterIndex}].candidates`,
    ).entries()) {
      const candidate = obj(
        candidateValue,
        `batchWorkspace.clusters[${clusterIndex}].candidates[${candidateIndex}]`,
      );
      const id = required(
        candidate.candidateId,
        `batchWorkspace.clusters[${clusterIndex}].candidates[${candidateIndex}].candidateId`,
      );
      if (candidateById.has(id)) throw new Error(`duplicate batch candidate ${id}`);
      candidateById.set(id, candidate);
    }
    for (const id of initialIds) {
      if (deferredIds.has(id)) throw new Error(`${id} cannot be both initial and deferred`);
      if (seen.has(id)) throw new Error(`duplicate initial review candidate ${id}`);
      const candidate = candidateById.get(id);
      if (!candidate) throw new Error(`initial review candidate ${id} is missing from cluster`);
      seen.add(id);
      candidates.push(parsePlanCandidate({
        candidate,
        candidateField: `batch candidate ${id}`,
        batchId,
        sourceClusterId,
        strategy: strategyValue,
      }));
    }
  }

  if (candidates.length !== expectedInitialCount) {
    throw new Error("batchWorkspace.initialReviewCandidateCount mismatch");
  }
  if (candidates.length === 0) throw new Error("batchWorkspace has no initial review candidates");
  candidates.sort((left, right) => `${left.batchId}|${left.pairId}|${left.candidateId}`.localeCompare(
    `${right.batchId}|${right.pairId}|${right.candidateId}`,
  ));
  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceBatchWorkspaceFile,
    sourceBatchWorkspaceHash,
    candidateCount: candidates.length,
    candidates,
    appendAuthorized: false as const,
  };
  return { ...base, planHash: digest(base) };
}

function textHash(value: string | null): string | null {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
}

function lineCount(value: string | null): number {
  return value === null || value.length === 0 ? 0 : value.split("\n").length;
}

function validateContentBoundary(
  plan: SanrioEdinetReviewNextContentPlanCandidate,
  content: SanrioEdinetReviewNextContentInput,
): void {
  if (content.candidateId !== plan.candidateId) throw new Error(`${plan.candidateId} content identity mismatch`);
  if (plan.changeType === "added" && (content.beforeText !== null || content.afterText === null)) {
    throw new Error(`${plan.candidateId} added content boundary is invalid`);
  }
  if (plan.changeType === "removed" && (content.beforeText === null || content.afterText !== null)) {
    throw new Error(`${plan.candidateId} removed content boundary is invalid`);
  }
  if (plan.changeType === "modified" && (content.beforeText === null || content.afterText === null)) {
    throw new Error(`${plan.candidateId} modified content is incomplete`);
  }
  for (const [side, value] of [["before", content.beforeText], ["after", content.afterText]] as const) {
    if (value !== null && !value.trim()) throw new Error(`${plan.candidateId} ${side} text is empty`);
    if (value !== null && value.length > MAX_TEXT_LENGTH) throw new Error(`${plan.candidateId} ${side} text exceeds limit`);
  }
}

function uniqueTokens(line: string): string[] {
  return [...new Set(line.normalize("NFKC").match(NUMERIC_TOKEN_RE) ?? [])].sort();
}

function reviewLines(side: "before" | "after", text: string | null): SanrioEdinetReviewLineCandidate[] {
  if (text === null) return [];
  const results: SanrioEdinetReviewLineCandidate[] = [];
  for (const [index, rawLine] of text.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const numericTokens = uniqueTokens(line);
    const matchedKeywords = ACCOUNTING_KEYWORDS.filter(keyword => line.includes(keyword));
    const candidateTypes: SanrioEdinetReviewLineCandidate["candidateTypes"] = [];
    if (numericTokens.length > 0) candidateTypes.push("numeric_line");
    if (FOOTNOTE_RE.test(line)) candidateTypes.push("footnote_line");
    if (matchedKeywords.length > 0) candidateTypes.push("accounting_keyword_line");
    if (candidateTypes.length === 0) continue;
    results.push({
      side,
      lineNumber: index + 1,
      text: line.slice(0, 2000),
      candidateTypes,
      numericTokens,
      matchedKeywords: [...matchedKeywords],
    });
    if (results.length >= MAX_REVIEW_LINES_PER_SIDE) break;
  }
  return results;
}

export function buildSanrioEdinetReviewNextContentBundle(input: {
  plan: SanrioEdinetReviewNextContentPlan;
  contents: SanrioEdinetReviewNextContentInput[];
  generatedAt?: string;
}): SanrioEdinetReviewNextContentBundle {
  const { planHash, ...planWithoutHash } = input.plan;
  if (digest(planWithoutHash) !== planHash) throw new Error("content plan hash mismatch");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const contentById = new Map<string, SanrioEdinetReviewNextContentInput>();
  for (const content of input.contents) {
    if (contentById.has(content.candidateId)) throw new Error(`duplicate content ${content.candidateId}`);
    contentById.set(content.candidateId, content);
  }
  if (contentById.size !== input.plan.candidateCount) throw new Error("content count mismatch");

  const candidates = input.plan.candidates.map(planCandidate => {
    const content = contentById.get(planCandidate.candidateId);
    if (!content) throw new Error(`missing content ${planCandidate.candidateId}`);
    validateContentBoundary(planCandidate, content);
    const lines = [
      ...reviewLines("before", content.beforeText),
      ...reviewLines("after", content.afterText),
    ];
    const base = {
      ...planCandidate,
      beforeText: content.beforeText,
      afterText: content.afterText,
      beforeTextHash: textHash(content.beforeText),
      afterTextHash: textHash(content.afterText),
      beforeLineCount: lineCount(content.beforeText),
      afterLineCount: lineCount(content.afterText),
      reviewLines: lines,
      numericLineCount: lines.filter(line => line.candidateTypes.includes("numeric_line")).length,
      footnoteLineCount: lines.filter(line => line.candidateTypes.includes("footnote_line")).length,
      accountingKeywordLineCount: lines.filter(line => line.candidateTypes.includes("accounting_keyword_line")).length,
      factStatus: "unreviewed_source_text" as const,
      accountingImpact: "unknown_pending_human_review" as const,
      internalControlImpact: "unknown_pending_human_review" as const,
      auditOpinionImpact: "unknown_pending_human_review" as const,
    };
    return { ...base, candidateHash: digest(base) };
  });

  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceBatchWorkspaceHash: input.plan.sourceBatchWorkspaceHash,
    planHash: input.plan.planHash,
    candidates,
    appendAuthorized: false,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: input.plan.issuer,
    sourceBatchWorkspaceFile: input.plan.sourceBatchWorkspaceFile,
    sourceBatchWorkspaceHash: input.plan.sourceBatchWorkspaceHash,
    planHash: input.plan.planHash,
    generatedAt,
    candidateCount: candidates.length,
    numericLineCount: candidates.reduce((sum, candidate) => sum + candidate.numericLineCount, 0),
    footnoteLineCount: candidates.reduce((sum, candidate) => sum + candidate.footnoteLineCount, 0),
    accountingKeywordLineCount: candidates.reduce((sum, candidate) => sum + candidate.accountingKeywordLineCount, 0),
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: [
      "numeric_and_footnote_lines_are_navigation_candidates_only",
      "full_table_structure_not_confirmed",
      "exact_amount_currency_period_recipient_payer_not_confirmed",
      "financial_statement_impact_not_confirmed",
      "internal_control_impact_not_confirmed",
      "audit_opinion_impact_not_confirmed",
      "official_pdf_visual_review_required",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false,
    bundleHash: digest(hashPayload),
  };
}

function fenced(value: string | null): string[] {
  return ["````text", value ?? "(none)", "````"];
}

export function renderSanrioEdinetReviewNextContentBundle(
  bundle: SanrioEdinetReviewNextContentBundle,
): string {
  const lines = [
    "# Sanrio EDINET review-next content bundle",
    "",
    `- generatedAt: ${bundle.generatedAt}`,
    `- sourceBatchWorkspaceFile: ${bundle.sourceBatchWorkspaceFile}`,
    `- sourceBatchWorkspaceHash: ${bundle.sourceBatchWorkspaceHash}`,
    `- planHash: ${bundle.planHash}`,
    `- bundleHash: ${bundle.bundleHash}`,
    `- candidateCount: ${bundle.candidateCount}`,
    `- numericLineCount: ${bundle.numericLineCount}`,
    `- footnoteLineCount: ${bundle.footnoteLineCount}`,
    `- accountingKeywordLineCount: ${bundle.accountingKeywordLineCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- Numeric, footnote, and accounting-keyword lines are navigation candidates, not confirmed facts or table cells.",
    "- Confirm exact amount, unit, currency, period, recipient, payer, table headers, and footnotes in the official PDF.",
    "- Do not infer accounting, internal-control, audit-opinion, materiality, direction, or investment impact from this bundle alone.",
    "",
  ];
  for (const candidate of bundle.candidates) {
    lines.push(
      `## ${candidate.fromDocID} → ${candidate.toDocID}`,
      "",
      `- candidateId: ${candidate.candidateId}`,
      `- batchId: ${candidate.batchId}`,
      `- strategy: ${candidate.strategy}`,
      `- logicalRoleKey: ${candidate.logicalRoleKey}`,
      `- path: ${candidate.path}`,
      `- reviewSignals: ${candidate.reviewSignals.join(", ") || "(none)"}`,
      `- textHashes: before=${candidate.beforeTextHash ?? "(none)"}, after=${candidate.afterTextHash ?? "(none)"}`,
      `- lineCounts: before=${candidate.beforeLineCount}, after=${candidate.afterLineCount}`,
      `- extractedLines: numeric=${candidate.numericLineCount}, footnote=${candidate.footnoteLineCount}, accountingKeyword=${candidate.accountingKeywordLineCount}`,
      "- factStatus: unreviewed_source_text",
      "- accountingImpact/internalControlImpact/auditOpinionImpact: unknown_pending_human_review",
      "",
      "### Review lines",
      "",
    );
    if (candidate.reviewLines.length === 0) {
      lines.push("(none)", "");
    } else {
      for (const line of candidate.reviewLines) {
        lines.push(
          `- ${line.side} L${line.lineNumber} [${line.candidateTypes.join(", ")}]`,
          `  - numericTokens: ${line.numericTokens.join(", ") || "(none)"}`,
          `  - matchedKeywords: ${line.matchedKeywords.join(", ") || "(none)"}`,
          `  - text: ${line.text}`,
        );
      }
      lines.push("");
    }
    lines.push(
      "### Before full text",
      "",
      ...fenced(candidate.beforeText),
      "",
      "### After full text",
      "",
      ...fenced(candidate.afterText),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
