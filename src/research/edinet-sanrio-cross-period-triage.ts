import { createHash } from "node:crypto";
import { edinetPublicDocumentLogicalKey } from "./edinet-sanrio-logical-entry-alignment.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const HIGH_SIGNAL_PATTERNS = [
  /訂正理由/,
  /訂正箇所/,
  /内部統制/,
  /不適切/,
  /誤謬/,
  /過年度/,
  /監査意見/,
  /限定付/,
  /虚偽/,
];

type UnknownRecord = Record<string, unknown>;

type SourceChange = {
  path: string;
  changeType: "added" | "removed" | "modified";
  beforeHash?: string;
  afterHash?: string;
  beforeLineCount: number;
  afterLineCount: number;
  changedBeforeLineCount: number;
  changedAfterLineCount: number;
  beforePreview: string[];
  afterPreview: string[];
};

type SourcePair = {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  fromDescription: string;
  toDescription: string;
  pairDiffHash: string;
  changes: SourceChange[];
};

export type SanrioEdinetTriagePriority = "review_first" | "review_next";
export type SanrioEdinetRecurrence = "all_pairs_same_role" | "pair_specific_or_partial";

export type SanrioEdinetTriageCandidate = {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  fromDescription: string;
  toDescription: string;
  path: string;
  beforePath: string | null;
  afterPath: string | null;
  logicalRoleKey: string;
  changeType: SourceChange["changeType"];
  beforeHash?: string;
  afterHash?: string;
  beforeLineCount: number;
  afterLineCount: number;
  changedBeforeLineCount: number;
  changedAfterLineCount: number;
  beforePreview: string[];
  afterPreview: string[];
  recurrence: SanrioEdinetRecurrence;
  pairCoverage: number;
  totalPairs: number;
  priority: SanrioEdinetTriagePriority;
  reasonCodes: string[];
  semanticType: "unknown_pending_human_review";
  materiality: "unknown_pending_human_review";
  direction: "unknown_pending_human_review";
};

export type SanrioEdinetTriageCluster = {
  clusterId: string;
  logicalRoleKey: string;
  changeType: SourceChange["changeType"];
  recurrence: SanrioEdinetRecurrence;
  pairCoverage: number;
  totalPairs: number;
  pairIds: string[];
  priority: SanrioEdinetTriagePriority;
  candidates: SanrioEdinetTriageCandidate[];
  clusterHash: string;
};

export type SanrioEdinetCrossPeriodTriageWorkspace = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceDiffWorkspaceFile: string;
  sourceDiffWorkspaceHash: string;
  generatedAt: string;
  pairCount: number;
  sourceCandidateCount: number;
  clusterCount: number;
  allPairsCommonClusterCount: number;
  pairSpecificOrPartialClusterCount: number;
  reviewFirstCandidateCount: number;
  reviewNextCandidateCount: number;
  reviewStatus: "pending_human_review";
  clusters: SanrioEdinetTriageCluster[];
  globalBlockers: string[];
  appendAuthorized: false;
  triageWorkspaceHash: string;
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
  if (!DOC_ID_PATTERN.test(result)) throw new Error(`${field} is not a valid EDINET docID`);
  return result;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
}

function requireTimestamp(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function stringArray(value: unknown, field: string): string[] {
  return asArray(value, field).map((item, index) => {
    if (typeof item !== "string") throw new Error(`${field}[${index}] must be a string`);
    return item;
  });
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

function requireLocalJsonBasename(value: string, field: string): string {
  const result = requireString(value, field);
  if (result.includes("/") || result.includes("\\") || !result.endsWith(".json")) {
    throw new Error(`${field} must be a local JSON basename`);
  }
  return result;
}

function parseChange(value: unknown, field: string): SourceChange {
  const record = asRecord(value, field);
  const changeType = requireString(record.changeType, `${field}.changeType`);
  if (changeType !== "added" && changeType !== "removed" && changeType !== "modified") {
    throw new Error(`${field}.changeType is unsupported`);
  }
  const beforeHash = asString(record.beforeHash) || undefined;
  const afterHash = asString(record.afterHash) || undefined;
  if (beforeHash) requireHash(beforeHash, `${field}.beforeHash`);
  if (afterHash) requireHash(afterHash, `${field}.afterHash`);
  if (changeType === "added" && (beforeHash || !afterHash)) {
    throw new Error(`${field} added hash boundary is invalid`);
  }
  if (changeType === "removed" && (!beforeHash || afterHash)) {
    throw new Error(`${field} removed hash boundary is invalid`);
  }
  if (changeType === "modified" && (!beforeHash || !afterHash)) {
    throw new Error(`${field} modified hashes are required`);
  }
  return {
    path: requireString(record.path, `${field}.path`),
    changeType,
    beforeHash,
    afterHash,
    beforeLineCount: requireNonNegativeInteger(record.beforeLineCount, `${field}.beforeLineCount`),
    afterLineCount: requireNonNegativeInteger(record.afterLineCount, `${field}.afterLineCount`),
    changedBeforeLineCount: requireNonNegativeInteger(
      record.changedBeforeLineCount,
      `${field}.changedBeforeLineCount`,
    ),
    changedAfterLineCount: requireNonNegativeInteger(
      record.changedAfterLineCount,
      `${field}.changedAfterLineCount`,
    ),
    beforePreview: stringArray(record.beforePreview, `${field}.beforePreview`),
    afterPreview: stringArray(record.afterPreview, `${field}.afterPreview`),
  };
}

function parsePair(value: unknown, field: string): SourcePair {
  const record = asRecord(value, field);
  const changes = asArray(record.changes, `${field}.changes`).map((item, index) =>
    parseChange(item, `${field}.changes[${index}]`),
  );
  return {
    pairId: requireString(record.pairId, `${field}.pairId`),
    fromDocID: requireDocID(record.fromDocID, `${field}.fromDocID`),
    toDocID: requireDocID(record.toDocID, `${field}.toDocID`),
    fromDescription: requireString(record.fromDescription, `${field}.fromDescription`),
    toDescription: requireString(record.toDescription, `${field}.toDescription`),
    pairDiffHash: requireHash(record.pairDiffHash, `${field}.pairDiffHash`),
    changes,
  };
}

function verifySourceWorkspaceHash(record: UnknownRecord): string {
  const expected = requireHash(record.diffWorkspaceHash, "diffWorkspace.diffWorkspaceHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceReviewWorkspaceHash: record.sourceReviewWorkspaceHash,
    pairs: record.pairs,
    appendAuthorized: record.appendAuthorized,
  };
  const actual = hashValue(payload);
  if (actual !== expected) throw new Error("diffWorkspace.diffWorkspaceHash mismatch");
  return expected;
}

function splitChangePath(change: SourceChange): { beforePath: string | null; afterPath: string | null } {
  const separator = " => ";
  const separatorIndex = change.path.indexOf(separator);
  if (separatorIndex >= 0) {
    const beforePath = change.path.slice(0, separatorIndex).trim();
    const afterPath = change.path.slice(separatorIndex + separator.length).trim();
    if (!beforePath || !afterPath) throw new Error(`invalid aligned change path: ${change.path}`);
    return { beforePath, afterPath };
  }
  if (change.changeType === "added") return { beforePath: null, afterPath: change.path };
  if (change.changeType === "removed") return { beforePath: change.path, afterPath: null };
  return { beforePath: change.path, afterPath: change.path };
}

function logicalRoleKey(change: SourceChange): {
  beforePath: string | null;
  afterPath: string | null;
  key: string;
} {
  const paths = splitChangePath(change);
  const beforeKey = paths.beforePath ? edinetPublicDocumentLogicalKey(paths.beforePath) : null;
  const afterKey = paths.afterPath ? edinetPublicDocumentLogicalKey(paths.afterPath) : null;
  const key = beforeKey && afterKey && beforeKey !== afterKey
    ? `${beforeKey} => ${afterKey}`
    : beforeKey ?? afterKey;
  if (!key) throw new Error(`unable to derive logical role for ${change.path}`);
  return { ...paths, key };
}

function containsHighSignal(change: SourceChange): boolean {
  const text = [...change.beforePreview, ...change.afterPreview].join("\n");
  return HIGH_SIGNAL_PATTERNS.some(pattern => pattern.test(text));
}

function candidatePriority(input: {
  change: SourceChange;
  recurrence: SanrioEdinetRecurrence;
}): { priority: SanrioEdinetTriagePriority; reasonCodes: string[] } {
  const reasons: string[] = [];
  if (input.change.changeType !== "modified") reasons.push("added_or_removed_document_role");
  if (input.recurrence === "pair_specific_or_partial") reasons.push("not_repeated_across_all_periods");
  if (containsHighSignal(input.change)) reasons.push("explicit_correction_or_control_keyword");
  if (reasons.length === 0) reasons.push("same_role_changed_across_all_periods_review_after_exceptions");
  return {
    priority: reasons[0] === "same_role_changed_across_all_periods_review_after_exceptions"
      ? "review_next"
      : "review_first",
    reasonCodes: reasons.sort(),
  };
}

export function buildSanrioEdinetCrossPeriodTriage(input: {
  diffWorkspace: unknown;
  sourceDiffWorkspaceFile: string;
  generatedAt?: string;
}): SanrioEdinetCrossPeriodTriageWorkspace {
  const record = asRecord(input.diffWorkspace, "diffWorkspace");
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("diffWorkspace schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review") {
    throw new Error("diffWorkspace must remain pending_human_review");
  }
  if (record.appendAuthorized !== false) {
    throw new Error("diffWorkspace.appendAuthorized must be false");
  }
  const issuer = asRecord(record.issuer, "diffWorkspace.issuer");
  if (asString(issuer.edinetCode) !== "E02655" || asString(issuer.secCode) !== "81360") {
    throw new Error("diffWorkspace issuer is not Sanrio");
  }
  const sourceDiffWorkspaceHash = verifySourceWorkspaceHash(record);
  const sourceDiffWorkspaceFile = requireLocalJsonBasename(
    input.sourceDiffWorkspaceFile,
    "sourceDiffWorkspaceFile",
  );
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();

  const pairs = asArray(record.pairs, "diffWorkspace.pairs").map((item, index) =>
    parsePair(item, `diffWorkspace.pairs[${index}]`),
  );
  if (pairs.length < 2) throw new Error("cross-period triage requires at least two correction pairs");
  const pairIds = new Set(pairs.map(pair => pair.pairId));
  if (pairIds.size !== pairs.length) throw new Error("diffWorkspace has duplicate pairId values");

  const clusterMembers = new Map<string, Array<{
    pair: SourcePair;
    change: SourceChange;
    beforePath: string | null;
    afterPath: string | null;
    logicalRoleKey: string;
  }>>();
  for (const pair of pairs) {
    for (const change of pair.changes) {
      const role = logicalRoleKey(change);
      const clusterIdentity = `${change.changeType}|${role.key}`;
      const current = clusterMembers.get(clusterIdentity) ?? [];
      current.push({ pair, change, beforePath: role.beforePath, afterPath: role.afterPath, logicalRoleKey: role.key });
      clusterMembers.set(clusterIdentity, current);
    }
  }

  const clusters: SanrioEdinetTriageCluster[] = [];
  for (const [clusterIdentity, members] of [...clusterMembers.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const coveredPairIds = [...new Set(members.map(member => member.pair.pairId))].sort();
    const recurrence: SanrioEdinetRecurrence = coveredPairIds.length === pairs.length
      ? "all_pairs_same_role"
      : "pair_specific_or_partial";
    const candidates = members
      .map(member => {
        const prioritization = candidatePriority({ change: member.change, recurrence });
        return {
          pairId: member.pair.pairId,
          fromDocID: member.pair.fromDocID,
          toDocID: member.pair.toDocID,
          fromDescription: member.pair.fromDescription,
          toDescription: member.pair.toDescription,
          path: member.change.path,
          beforePath: member.beforePath,
          afterPath: member.afterPath,
          logicalRoleKey: member.logicalRoleKey,
          changeType: member.change.changeType,
          beforeHash: member.change.beforeHash,
          afterHash: member.change.afterHash,
          beforeLineCount: member.change.beforeLineCount,
          afterLineCount: member.change.afterLineCount,
          changedBeforeLineCount: member.change.changedBeforeLineCount,
          changedAfterLineCount: member.change.changedAfterLineCount,
          beforePreview: member.change.beforePreview,
          afterPreview: member.change.afterPreview,
          recurrence,
          pairCoverage: coveredPairIds.length,
          totalPairs: pairs.length,
          priority: prioritization.priority,
          reasonCodes: prioritization.reasonCodes,
          semanticType: "unknown_pending_human_review" as const,
          materiality: "unknown_pending_human_review" as const,
          direction: "unknown_pending_human_review" as const,
        };
      })
      .sort((left, right) => `${left.priority}|${left.pairId}|${left.path}`.localeCompare(
        `${right.priority}|${right.pairId}|${right.path}`,
      ));
    const clusterPriority: SanrioEdinetTriagePriority = candidates.some(
      candidate => candidate.priority === "review_first",
    ) ? "review_first" : "review_next";
    const clusterBase = {
      clusterId: `edinet-triage:${hashValue(clusterIdentity).slice(0, 20)}`,
      logicalRoleKey: members[0]!.logicalRoleKey,
      changeType: members[0]!.change.changeType,
      recurrence,
      pairCoverage: coveredPairIds.length,
      totalPairs: pairs.length,
      pairIds: coveredPairIds,
      priority: clusterPriority,
      candidates,
    };
    clusters.push({ ...clusterBase, clusterHash: hashValue(clusterBase) });
  }

  clusters.sort((left, right) => `${left.priority}|${left.logicalRoleKey}|${left.changeType}`.localeCompare(
    `${right.priority}|${right.logicalRoleKey}|${right.changeType}`,
  ));
  const candidates = clusters.flatMap(cluster => cluster.candidates);
  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    sourceDiffWorkspaceHash,
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
    sourceDiffWorkspaceFile,
    sourceDiffWorkspaceHash,
    generatedAt,
    pairCount: pairs.length,
    sourceCandidateCount: candidates.length,
    clusterCount: clusters.length,
    allPairsCommonClusterCount: clusters.filter(cluster => cluster.recurrence === "all_pairs_same_role").length,
    pairSpecificOrPartialClusterCount: clusters.filter(
      cluster => cluster.recurrence === "pair_specific_or_partial",
    ).length,
    reviewFirstCandidateCount: candidates.filter(candidate => candidate.priority === "review_first").length,
    reviewNextCandidateCount: candidates.filter(candidate => candidate.priority === "review_next").length,
    reviewStatus: "pending_human_review",
    clusters,
    globalBlockers: [
      "cross_period_recurrence_is_not_proof_of_packaging_noise",
      "human_pdf_review_required",
      "human_changed_section_review_required",
      "semantic_type_not_confirmed",
      "materiality_not_confirmed",
      "direction_not_confirmed",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false,
    triageWorkspaceHash: hashValue(hashPayload),
  };
}

export function renderSanrioEdinetCrossPeriodTriage(
  workspace: SanrioEdinetCrossPeriodTriageWorkspace,
): string {
  const lines = [
    "# Sanrio EDINET cross-period correction triage",
    "",
    `- generatedAt: ${workspace.generatedAt}`,
    `- sourceDiffWorkspaceFile: ${workspace.sourceDiffWorkspaceFile}`,
    `- sourceDiffWorkspaceHash: ${workspace.sourceDiffWorkspaceHash}`,
    `- triageWorkspaceHash: ${workspace.triageWorkspaceHash}`,
    `- pairCount: ${workspace.pairCount}`,
    `- sourceCandidateCount: ${workspace.sourceCandidateCount}`,
    `- clusterCount: ${workspace.clusterCount}`,
    `- allPairsCommonClusterCount: ${workspace.allPairsCommonClusterCount}`,
    `- pairSpecificOrPartialClusterCount: ${workspace.pairSpecificOrPartialClusterCount}`,
    `- reviewFirstCandidateCount: ${workspace.reviewFirstCandidateCount}`,
    `- reviewNextCandidateCount: ${workspace.reviewNextCandidateCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- A role repeated across all periods is a structural recurrence candidate, not proof of harmless packaging noise.",
    "- `review_first` means inspect earlier; it does not mean material, negative, or newly disclosed.",
    "- Confirm every candidate against the original and corrected PDF before authoring facts.",
    "",
  ];

  for (const priority of ["review_first", "review_next"] as const) {
    lines.push(`## ${priority}`, "");
    for (const cluster of workspace.clusters.filter(item => item.priority === priority)) {
      lines.push(
        `### ${cluster.changeType} — ${cluster.logicalRoleKey}`,
        "",
        `- recurrence: ${cluster.recurrence}`,
        `- pairCoverage: ${cluster.pairCoverage}/${cluster.totalPairs}`,
        `- clusterHash: ${cluster.clusterHash}`,
        "",
      );
      for (const candidate of cluster.candidates) {
        lines.push(
          `#### ${candidate.fromDocID} → ${candidate.toDocID}`,
          "",
          `- path: ${candidate.path}`,
          `- reasons: ${candidate.reasonCodes.join(", ")}`,
          `- changed lines: before=${candidate.changedBeforeLineCount}, after=${candidate.changedAfterLineCount}`,
          "- semanticType/materiality/direction: unknown_pending_human_review",
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
