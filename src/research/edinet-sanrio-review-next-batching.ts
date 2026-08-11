import { createHash } from "node:crypto";
import { parseExplicitIso8601Instant } from "./iso-instant.js";

const HASH_RE = /^[a-f0-9]{64}$/;
const DOC_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
const LARGE_CHANGED_LINE_THRESHOLD = 20;
const HIGH_SIGNAL_KEYWORDS = [
  "財務諸表",
  "売上",
  "利益",
  "損失",
  "資産",
  "負債",
  "純資産",
  "キャッシュ・フロー",
  "キャッシュフロー",
  "内部統制",
  "監査",
  "継続企業",
  "関連当事者",
  "役員の報酬",
  "報酬",
  "偶発債務",
  "訴訟",
  "引当金",
  "税金",
  "減損",
  "不適切",
  "誤謬",
] as const;

type JsonObject = Record<string, unknown>;

type SourceCandidate = {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  path: string;
  beforePath: string | null;
  afterPath: string | null;
  logicalRoleKey: string;
  changeType: "added" | "removed" | "modified";
  beforeLineCount: number;
  afterLineCount: number;
  changedBeforeLineCount: number;
  changedAfterLineCount: number;
  beforePreview: string[];
  afterPreview: string[];
  pairCoverage: number;
  totalPairs: number;
  priority: "review_next";
  reasonCodes: string[];
};

export type SanrioEdinetReviewNextBatchCandidate = SourceCandidate & {
  candidateId: string;
  shapeSignature: string;
  numericPreviewVariance: boolean;
  highSignalKeywords: string[];
  reviewSignals: string[];
};

export type SanrioEdinetReviewNextBatchCluster = {
  batchId: string;
  sourceClusterId: string;
  logicalRoleKey: string;
  strategy: "review_all_candidates_first" | "review_representative_then_confirm_pair";
  reviewOrder: "exception_first" | "representative_first";
  pairCoverage: number;
  totalPairs: number;
  candidateCount: number;
  initialReviewCandidateIds: string[];
  deferredPairConfirmationCandidateIds: string[];
  reviewSignals: string[];
  candidates: SanrioEdinetReviewNextBatchCandidate[];
  batchHash: string;
};

export type SanrioEdinetReviewNextBatchWorkspace = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceTriageWorkspaceFile: string;
  sourceTriageWorkspaceHash: string;
  generatedAt: string;
  sourceCandidateCount: number;
  sourceClusterCount: number;
  exceptionClusterCount: number;
  representativeClusterCount: number;
  initialReviewCandidateCount: number;
  deferredPairConfirmationCount: number;
  estimatedInitialReviewReduction: number;
  reviewStatus: "pending_human_review";
  clusters: SanrioEdinetReviewNextBatchCluster[];
  globalBlockers: string[];
  appendAuthorized: false;
  workspaceHash: string;
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

function localJsonBasename(value: unknown, field: string): string {
  const result = required(value, field);
  if (result === "." || result === ".." || result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function timestamp(value: unknown, field: string): string {
  const result = required(value, field);
  parseExplicitIso8601Instant(result, field);
  return result;
}

function strings(value: unknown, field: string): string[] {
  return arr(value, field).map((item, index) => required(item, `${field}[${index}]`));
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

function verifyTriageWorkspace(record: JsonObject): string {
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("triageWorkspace schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review" || record.appendAuthorized !== false) {
    throw new Error("triageWorkspace safety boundary is invalid");
  }
  const issuer = obj(record.issuer, "triageWorkspace.issuer");
  if (str(issuer.edinetCode) !== "E02655" || str(issuer.secCode) !== "81360") {
    throw new Error("triageWorkspace issuer is not Sanrio");
  }
  const expected = requireHash(record.triageWorkspaceHash, "triageWorkspace.triageWorkspaceHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceDiffWorkspaceHash: record.sourceDiffWorkspaceHash,
    clusters: record.clusters,
    appendAuthorized: record.appendAuthorized,
  };
  if (digest(payload) !== expected) throw new Error("triageWorkspace.triageWorkspaceHash mismatch");
  return expected;
}

function nullablePath(value: unknown, field: string): string | null {
  if (value === null) return null;
  return required(value, field);
}

function parseCandidate(value: unknown, field: string): SourceCandidate {
  const record = obj(value, field);
  if (record.priority !== "review_next") throw new Error(`${field}.priority must be review_next`);
  const changeType = required(record.changeType, `${field}.changeType`);
  if (changeType !== "added" && changeType !== "removed" && changeType !== "modified") {
    throw new Error(`${field}.changeType is unsupported`);
  }
  return {
    pairId: required(record.pairId, `${field}.pairId`),
    fromDocID: requireDocID(record.fromDocID, `${field}.fromDocID`),
    toDocID: requireDocID(record.toDocID, `${field}.toDocID`),
    path: required(record.path, `${field}.path`),
    beforePath: nullablePath(record.beforePath, `${field}.beforePath`),
    afterPath: nullablePath(record.afterPath, `${field}.afterPath`),
    logicalRoleKey: required(record.logicalRoleKey, `${field}.logicalRoleKey`),
    changeType,
    beforeLineCount: nonNegativeInteger(record.beforeLineCount, `${field}.beforeLineCount`),
    afterLineCount: nonNegativeInteger(record.afterLineCount, `${field}.afterLineCount`),
    changedBeforeLineCount: nonNegativeInteger(record.changedBeforeLineCount, `${field}.changedBeforeLineCount`),
    changedAfterLineCount: nonNegativeInteger(record.changedAfterLineCount, `${field}.changedAfterLineCount`),
    beforePreview: strings(record.beforePreview, `${field}.beforePreview`),
    afterPreview: strings(record.afterPreview, `${field}.afterPreview`),
    pairCoverage: positiveInteger(record.pairCoverage, `${field}.pairCoverage`),
    totalPairs: positiveInteger(record.totalPairs, `${field}.totalPairs`),
    priority: "review_next",
    reasonCodes: strings(record.reasonCodes, `${field}.reasonCodes`).sort(),
  };
}

function normalizeStructuralText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?/g, "<date>")
    .replace(/\d{8}/g, "<date>")
    .replace(/第\d+期/g, "第<period>期")
    .replace(/\d[\d,.]*/g, "<n>")
    .replace(/[\s\u00a0]+/g, "")
    .replace(/[‐‑‒–—―−]/g, "-");
}

function numericTokens(value: string): string[] {
  const normalized = value
    .normalize("NFKC")
    .replace(/\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?/g, " ")
    .replace(/\d{8}/g, " ")
    .replace(/第\d+期/g, " ");
  return [...new Set(normalized.match(/\d[\d,]*(?:\.\d+)?(?:円|千円|万円|百万円)?/g) ?? [])].sort();
}

function numericPreviewVariance(candidate: SourceCandidate): boolean {
  const before = numericTokens(candidate.beforePreview.join("\n"));
  const after = numericTokens(candidate.afterPreview.join("\n"));
  return JSON.stringify(before) !== JSON.stringify(after) && (before.length > 0 || after.length > 0);
}

function highSignalKeywords(candidate: SourceCandidate): string[] {
  const text = [candidate.logicalRoleKey, ...candidate.beforePreview, ...candidate.afterPreview].join("\n");
  return HIGH_SIGNAL_KEYWORDS.filter(keyword => text.includes(keyword));
}

function shapeSignature(candidate: SourceCandidate): string {
  return digest({
    changeType: candidate.changeType,
    beforeLineCount: candidate.beforeLineCount,
    afterLineCount: candidate.afterLineCount,
    changedBeforeLineCount: candidate.changedBeforeLineCount,
    changedAfterLineCount: candidate.changedAfterLineCount,
    beforePreview: candidate.beforePreview.map(normalizeStructuralText),
    afterPreview: candidate.afterPreview.map(normalizeStructuralText),
  });
}

function candidateId(candidate: SourceCandidate): string {
  return `edinet-review-next:${digest({
    pairId: candidate.pairId,
    path: candidate.path,
    logicalRoleKey: candidate.logicalRoleKey,
  }).slice(0, 24)}`;
}

function candidateSignals(candidate: SourceCandidate): string[] {
  const signals: string[] = [];
  const keywords = highSignalKeywords(candidate);
  for (const keyword of keywords) signals.push(`high_signal_keyword:${keyword}`);
  if (numericPreviewVariance(candidate)) signals.push("numeric_preview_variance");
  if (candidate.changeType !== "modified") signals.push("non_modified_review_next_candidate");
  if (
    candidate.changedBeforeLineCount >= LARGE_CHANGED_LINE_THRESHOLD
    || candidate.changedAfterLineCount >= LARGE_CHANGED_LINE_THRESHOLD
  ) {
    signals.push("large_changed_section");
  }
  if (candidate.pairCoverage !== candidate.totalPairs) signals.push("pair_coverage_incomplete");
  return [...new Set(signals)].sort();
}

export function buildSanrioEdinetReviewNextBatchWorkspace(input: {
  triageWorkspace: unknown;
  sourceTriageWorkspaceFile: string;
  generatedAt?: string;
}): SanrioEdinetReviewNextBatchWorkspace {
  const source = obj(input.triageWorkspace, "triageWorkspace");
  const sourceTriageWorkspaceHash = verifyTriageWorkspace(source);
  const sourceTriageWorkspaceFile = localJsonBasename(input.sourceTriageWorkspaceFile, "sourceTriageWorkspaceFile");
  const generatedAt = input.generatedAt ? timestamp(input.generatedAt, "generatedAt") : new Date().toISOString();
  const sourceReviewNextCount = nonNegativeInteger(
    source.reviewNextCandidateCount,
    "triageWorkspace.reviewNextCandidateCount",
  );

  const clusters: SanrioEdinetReviewNextBatchCluster[] = [];
  let parsedCandidateCount = 0;
  for (const [clusterIndex, clusterValue] of arr(source.clusters, "triageWorkspace.clusters").entries()) {
    const cluster = obj(clusterValue, `triageWorkspace.clusters[${clusterIndex}]`);
    if (cluster.priority !== "review_next") continue;
    const sourceClusterId = required(cluster.clusterId, `triageWorkspace.clusters[${clusterIndex}].clusterId`);
    const logicalRoleKey = required(
      cluster.logicalRoleKey,
      `triageWorkspace.clusters[${clusterIndex}].logicalRoleKey`,
    );
    const sourceCandidates = arr(
      cluster.candidates,
      `triageWorkspace.clusters[${clusterIndex}].candidates`,
    ).map((candidateValue, candidateIndex) =>
      parseCandidate(
        candidateValue,
        `triageWorkspace.clusters[${clusterIndex}].candidates[${candidateIndex}]`,
      ),
    );
    if (sourceCandidates.length === 0) throw new Error(`${sourceClusterId} has no review_next candidates`);
    parsedCandidateCount += sourceCandidates.length;

    const candidates = sourceCandidates
      .map(candidate => {
        const signals = candidateSignals(candidate);
        return {
          ...candidate,
          candidateId: candidateId(candidate),
          shapeSignature: shapeSignature(candidate),
          numericPreviewVariance: numericPreviewVariance(candidate),
          highSignalKeywords: highSignalKeywords(candidate),
          reviewSignals: signals,
        };
      })
      .sort((left, right) => `${left.pairId}|${left.path}`.localeCompare(`${right.pairId}|${right.path}`));

    const shapeSignatures = new Set(candidates.map(candidate => candidate.shapeSignature));
    const pairCoverage = positiveInteger(cluster.pairCoverage, `triageWorkspace.clusters[${clusterIndex}].pairCoverage`);
    const totalPairs = positiveInteger(cluster.totalPairs, `triageWorkspace.clusters[${clusterIndex}].totalPairs`);
    const clusterSignals = new Set(candidates.flatMap(candidate => candidate.reviewSignals));
    if (shapeSignatures.size > 1) clusterSignals.add("shape_divergence_across_periods");
    if (candidates.length !== totalPairs) clusterSignals.add("candidate_count_differs_from_total_pairs");
    if (pairCoverage !== totalPairs) clusterSignals.add("cluster_pair_coverage_incomplete");

    const reviewSignals = [...clusterSignals].sort();
    const strategy = reviewSignals.length > 0
      ? "review_all_candidates_first" as const
      : "review_representative_then_confirm_pair" as const;
    const initialReviewCandidateIds = strategy === "review_all_candidates_first"
      ? candidates.map(candidate => candidate.candidateId)
      : [candidates[0]!.candidateId];
    const deferredPairConfirmationCandidateIds = strategy === "review_all_candidates_first"
      ? []
      : candidates.slice(1).map(candidate => candidate.candidateId);
    const base = {
      batchId: `edinet-review-batch:${digest({ sourceClusterId, logicalRoleKey }).slice(0, 20)}`,
      sourceClusterId,
      logicalRoleKey,
      strategy,
      reviewOrder: strategy === "review_all_candidates_first"
        ? "exception_first" as const
        : "representative_first" as const,
      pairCoverage,
      totalPairs,
      candidateCount: candidates.length,
      initialReviewCandidateIds,
      deferredPairConfirmationCandidateIds,
      reviewSignals,
      candidates,
    };
    clusters.push({ ...base, batchHash: digest(base) });
  }

  if (parsedCandidateCount !== sourceReviewNextCount) {
    throw new Error("triageWorkspace.reviewNextCandidateCount mismatch");
  }
  if (clusters.length === 0) throw new Error("triageWorkspace has no review_next clusters");
  clusters.sort((left, right) =>
    `${left.reviewOrder}|${left.logicalRoleKey}|${left.sourceClusterId}`.localeCompare(
      `${right.reviewOrder}|${right.logicalRoleKey}|${right.sourceClusterId}`,
    ),
  );

  const initialReviewCandidateCount = clusters.reduce(
    (sum, cluster) => sum + cluster.initialReviewCandidateIds.length,
    0,
  );
  const deferredPairConfirmationCount = clusters.reduce(
    (sum, cluster) => sum + cluster.deferredPairConfirmationCandidateIds.length,
    0,
  );
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceTriageWorkspaceHash,
    clusters,
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
    sourceTriageWorkspaceFile,
    sourceTriageWorkspaceHash,
    generatedAt,
    sourceCandidateCount: parsedCandidateCount,
    sourceClusterCount: clusters.length,
    exceptionClusterCount: clusters.filter(cluster => cluster.strategy === "review_all_candidates_first").length,
    representativeClusterCount: clusters.filter(
      cluster => cluster.strategy === "review_representative_then_confirm_pair",
    ).length,
    initialReviewCandidateCount,
    deferredPairConfirmationCount,
    estimatedInitialReviewReduction: parsedCandidateCount - initialReviewCandidateCount,
    reviewStatus: "pending_human_review",
    clusters,
    globalBlockers: [
      "batching_is_review_order_only_not_materiality",
      "representative_review_does_not_replace_pair_confirmation",
      "full_source_text_and_pdf_review_still_required",
      "financial_statement_impact_not_confirmed",
      "internal_control_impact_not_confirmed",
      "audit_opinion_impact_not_confirmed",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false,
    workspaceHash: digest(hashPayload),
  };
}

export function renderSanrioEdinetReviewNextBatchWorkspace(
  workspace: SanrioEdinetReviewNextBatchWorkspace,
): string {
  const lines = [
    "# Sanrio EDINET review-next batching",
    "",
    `- generatedAt: ${workspace.generatedAt}`,
    `- sourceTriageWorkspaceFile: ${workspace.sourceTriageWorkspaceFile}`,
    `- sourceTriageWorkspaceHash: ${workspace.sourceTriageWorkspaceHash}`,
    `- workspaceHash: ${workspace.workspaceHash}`,
    `- sourceCandidateCount: ${workspace.sourceCandidateCount}`,
    `- sourceClusterCount: ${workspace.sourceClusterCount}`,
    `- exceptionClusterCount: ${workspace.exceptionClusterCount}`,
    `- representativeClusterCount: ${workspace.representativeClusterCount}`,
    `- initialReviewCandidateCount: ${workspace.initialReviewCandidateCount}`,
    `- deferredPairConfirmationCount: ${workspace.deferredPairConfirmationCount}`,
    `- estimatedInitialReviewReduction: ${workspace.estimatedInitialReviewReduction}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- This output changes review order only. It does not classify materiality, accounting impact, direction, or investment meaning.",
    "- `review_representative_then_confirm_pair` means inspect one period first, then still confirm the paired period before completing human review.",
    "- Preview numeric variance and keyword signals are exception-routing aids, not confirmed facts.",
    "",
  ];

  for (const order of ["exception_first", "representative_first"] as const) {
    lines.push(`## ${order}`, "");
    for (const cluster of workspace.clusters.filter(item => item.reviewOrder === order)) {
      lines.push(
        `### ${cluster.logicalRoleKey}`,
        "",
        `- sourceClusterId: ${cluster.sourceClusterId}`,
        `- strategy: ${cluster.strategy}`,
        `- pairCoverage: ${cluster.pairCoverage}/${cluster.totalPairs}`,
        `- reviewSignals: ${cluster.reviewSignals.join(", ") || "(none)"}`,
        `- initialReviewCandidateIds: ${cluster.initialReviewCandidateIds.join(", ")}`,
        `- deferredPairConfirmationCandidateIds: ${cluster.deferredPairConfirmationCandidateIds.join(", ") || "(none)"}`,
        `- batchHash: ${cluster.batchHash}`,
        "",
      );
      for (const candidate of cluster.candidates) {
        lines.push(
          `#### ${candidate.fromDocID} → ${candidate.toDocID}`,
          "",
          `- candidateId: ${candidate.candidateId}`,
          `- pairId: ${candidate.pairId}`,
          `- path: ${candidate.path}`,
          `- changedLines: before=${candidate.changedBeforeLineCount}, after=${candidate.changedAfterLineCount}`,
          `- numericPreviewVariance: ${candidate.numericPreviewVariance}`,
          `- highSignalKeywords: ${candidate.highSignalKeywords.join(", ") || "(none)"}`,
          `- reviewSignals: ${candidate.reviewSignals.join(", ") || "(none)"}`,
          "",
          "Before preview:",
          "```text",
          ...(candidate.beforePreview.length ? candidate.beforePreview : ["(none)"]),
          "```",
          "",
          "After preview:",
          "```text",
          ...(candidate.afterPreview.length ? candidate.afterPreview : ["(none)"]),
          "```",
          "",
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
