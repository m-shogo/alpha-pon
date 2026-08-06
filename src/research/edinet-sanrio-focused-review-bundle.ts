import { createHash } from "node:crypto";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const FOCUS_KEYWORDS = [
  "訂正理由",
  "訂正事項",
  "訂正前",
  "訂正後",
  "役員の報酬",
  "報酬",
  "COLA",
  "学費",
  "経済的利益",
  "内部統制",
  "特別調査委員会",
  "円",
  "千円",
  "百万円",
] as const;

type UnknownRecord = Record<string, unknown>;

type SourceCandidate = {
  pairId: string;
  fromDocID: string;
  toDocID: string;
  fromDescription: string;
  toDescription: string;
  path: string;
  beforePath: string | null;
  afterPath: string | null;
  changeType: "added" | "removed" | "modified";
  priority: "review_first";
  reasonCodes: string[];
};

export type SanrioEdinetFocusedReviewPlanCandidate = SourceCandidate & {
  candidateId: string;
  clusterId: string;
  logicalRoleKey: string;
};

export type SanrioEdinetFocusedReviewPlan = {
  schemaVersion: 1;
  source: "edinet";
  issuer: {
    name: "株式会社サンリオ";
    edinetCode: "E02655";
    secCode: "81360";
  };
  sourceTriageWorkspaceFile: string;
  sourceTriageWorkspaceHash: string;
  sourceDiffWorkspaceFile: string;
  sourceDiffWorkspaceHash: string;
  clusterCount: number;
  candidateCount: number;
  candidates: SanrioEdinetFocusedReviewPlanCandidate[];
  appendAuthorized: false;
  focusedPlanHash: string;
};

export type SanrioEdinetFocusedReviewContent = {
  candidateId: string;
  beforeText: string | null;
  afterText: string | null;
};

export type SanrioEdinetFocusedReviewLine = {
  side: "before" | "after";
  lineNumber: number;
  text: string;
  matchedKeywords: string[];
};

export type SanrioEdinetFocusedReviewCandidate = SanrioEdinetFocusedReviewPlanCandidate & {
  beforeText: string | null;
  afterText: string | null;
  beforeTextHash: string | null;
  afterTextHash: string | null;
  beforeLineCount: number;
  afterLineCount: number;
  focusLines: SanrioEdinetFocusedReviewLine[];
  factStatus: "unreviewed_source_text";
  semanticType: "unknown_pending_human_review";
  materiality: "unknown_pending_human_review";
  direction: "unknown_pending_human_review";
  accountingImpact: "unknown_pending_human_review";
  candidateHash: string;
};

export type SanrioEdinetFocusedReviewBundle = {
  schemaVersion: 1;
  source: "edinet";
  issuer: SanrioEdinetFocusedReviewPlan["issuer"];
  sourceTriageWorkspaceFile: string;
  sourceTriageWorkspaceHash: string;
  sourceDiffWorkspaceFile: string;
  sourceDiffWorkspaceHash: string;
  focusedPlanHash: string;
  generatedAt: string;
  clusterCount: number;
  candidateCount: number;
  focusLineCount: number;
  reviewStatus: "pending_human_review";
  candidates: SanrioEdinetFocusedReviewCandidate[];
  globalBlockers: string[];
  appendAuthorized: false;
  focusedBundleHash: string;
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

function requireTimestamp(value: unknown, field: string): string {
  const result = requireString(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a date-time`);
  return result;
}

function requireLocalJsonBasename(value: unknown, field: string): string {
  const result = requireString(value, field);
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

function requireNullablePath(value: unknown, field: string): string | null {
  if (value === null) return null;
  const result = requireString(value, field);
  if (
    result.startsWith("/")
    || result.includes("\\")
    || result.split("/").some(segment => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`${field} is not a safe archive entry path`);
  }
  return result;
}

function requireStringArray(value: unknown, field: string): string[] {
  return asArray(value, field).map((item, index) =>
    requireString(item, `${field}[${index}]`),
  );
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

function verifyTriageWorkspaceHash(record: UnknownRecord): string {
  const expected = requireHash(record.triageWorkspaceHash, "triageWorkspace.triageWorkspaceHash");
  const payload = {
    schemaVersion: record.schemaVersion,
    source: record.source,
    sourceDiffWorkspaceHash: record.sourceDiffWorkspaceHash,
    clusters: record.clusters,
    appendAuthorized: record.appendAuthorized,
  };
  const actual = hashValue(payload);
  if (actual !== expected) throw new Error("triageWorkspace.triageWorkspaceHash mismatch");
  return expected;
}

function parseReviewFirstCandidate(
  value: unknown,
  field: string,
  cluster: { clusterId: string; logicalRoleKey: string },
): SanrioEdinetFocusedReviewPlanCandidate | null {
  const record = asRecord(value, field);
  const priority = requireString(record.priority, `${field}.priority`);
  if (priority === "review_next") return null;
  if (priority !== "review_first") throw new Error(`${field}.priority is unsupported`);
  const changeType = requireString(record.changeType, `${field}.changeType`);
  if (changeType !== "added" && changeType !== "removed" && changeType !== "modified") {
    throw new Error(`${field}.changeType is unsupported`);
  }
  const beforePath = requireNullablePath(record.beforePath, `${field}.beforePath`);
  const afterPath = requireNullablePath(record.afterPath, `${field}.afterPath`);
  if (changeType === "added" && (beforePath !== null || afterPath === null)) {
    throw new Error(`${field} added path boundary is invalid`);
  }
  if (changeType === "removed" && (beforePath === null || afterPath !== null)) {
    throw new Error(`${field} removed path boundary is invalid`);
  }
  if (changeType === "modified" && (beforePath === null || afterPath === null)) {
    throw new Error(`${field} modified paths are required`);
  }
  const pairId = requireString(record.pairId, `${field}.pairId`);
  const fromDocID = requireDocID(record.fromDocID, `${field}.fromDocID`);
  const toDocID = requireDocID(record.toDocID, `${field}.toDocID`);
  const identity = {
    clusterId: cluster.clusterId,
    pairId,
    changeType,
    beforePath,
    afterPath,
  };
  return {
    candidateId: `edinet-focused:${hashValue(identity).slice(0, 24)}`,
    clusterId: cluster.clusterId,
    logicalRoleKey: cluster.logicalRoleKey,
    pairId,
    fromDocID,
    toDocID,
    fromDescription: requireString(record.fromDescription, `${field}.fromDescription`),
    toDescription: requireString(record.toDescription, `${field}.toDescription`),
    path: requireString(record.path, `${field}.path`),
    beforePath,
    afterPath,
    changeType,
    priority: "review_first",
    reasonCodes: requireStringArray(record.reasonCodes, `${field}.reasonCodes`).sort(),
  };
}

export function buildSanrioEdinetFocusedReviewPlan(input: {
  triageWorkspace: unknown;
  sourceTriageWorkspaceFile: string;
}): SanrioEdinetFocusedReviewPlan {
  const record = asRecord(input.triageWorkspace, "triageWorkspace");
  if (record.schemaVersion !== 1 || record.source !== "edinet") {
    throw new Error("triageWorkspace schema/source is unsupported");
  }
  if (record.reviewStatus !== "pending_human_review") {
    throw new Error("triageWorkspace must remain pending_human_review");
  }
  if (record.appendAuthorized !== false) {
    throw new Error("triageWorkspace.appendAuthorized must be false");
  }
  const issuer = asRecord(record.issuer, "triageWorkspace.issuer");
  if (asString(issuer.edinetCode) !== "E02655" || asString(issuer.secCode) !== "81360") {
    throw new Error("triageWorkspace issuer is not Sanrio");
  }
  const sourceTriageWorkspaceHash = verifyTriageWorkspaceHash(record);
  const sourceTriageWorkspaceFile = requireLocalJsonBasename(
    input.sourceTriageWorkspaceFile,
    "sourceTriageWorkspaceFile",
  );
  const sourceDiffWorkspaceFile = requireLocalJsonBasename(
    record.sourceDiffWorkspaceFile,
    "triageWorkspace.sourceDiffWorkspaceFile",
  );
  const sourceDiffWorkspaceHash = requireHash(
    record.sourceDiffWorkspaceHash,
    "triageWorkspace.sourceDiffWorkspaceHash",
  );

  const candidates: SanrioEdinetFocusedReviewPlanCandidate[] = [];
  const focusedClusters = new Set<string>();
  for (const [clusterIndex, rawCluster] of asArray(record.clusters, "triageWorkspace.clusters").entries()) {
    const clusterRecord = asRecord(rawCluster, `triageWorkspace.clusters[${clusterIndex}]`);
    const cluster = {
      clusterId: requireString(clusterRecord.clusterId, `triageWorkspace.clusters[${clusterIndex}].clusterId`),
      logicalRoleKey: requireString(
        clusterRecord.logicalRoleKey,
        `triageWorkspace.clusters[${clusterIndex}].logicalRoleKey`,
      ),
    };
    for (const [candidateIndex, rawCandidate] of asArray(
      clusterRecord.candidates,
      `triageWorkspace.clusters[${clusterIndex}].candidates`,
    ).entries()) {
      const candidate = parseReviewFirstCandidate(
        rawCandidate,
        `triageWorkspace.clusters[${clusterIndex}].candidates[${candidateIndex}]`,
        cluster,
      );
      if (!candidate) continue;
      focusedClusters.add(cluster.clusterId);
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) =>
    `${left.clusterId}|${left.pairId}|${left.candidateId}`.localeCompare(
      `${right.clusterId}|${right.pairId}|${right.candidateId}`,
    ),
  );
  if (candidates.length === 0) throw new Error("triageWorkspace has no review_first candidates");
  const expectedCount = Number(record.reviewFirstCandidateCount);
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== candidates.length) {
    throw new Error("triageWorkspace.reviewFirstCandidateCount mismatch");
  }
  const identities = new Set<string>();
  for (const candidate of candidates) {
    if (identities.has(candidate.candidateId)) {
      throw new Error(`duplicate focused candidate ${candidate.candidateId}`);
    }
    identities.add(candidate.candidateId);
  }

  const base = {
    schemaVersion: 1 as const,
    source: "edinet" as const,
    issuer: {
      name: "株式会社サンリオ" as const,
      edinetCode: "E02655" as const,
      secCode: "81360" as const,
    },
    sourceTriageWorkspaceFile,
    sourceTriageWorkspaceHash,
    sourceDiffWorkspaceFile,
    sourceDiffWorkspaceHash,
    clusterCount: focusedClusters.size,
    candidateCount: candidates.length,
    candidates,
    appendAuthorized: false as const,
  };
  return { ...base, focusedPlanHash: hashValue(base) };
}

function textHash(value: string | null): string | null {
  return value === null ? null : createHash("sha256").update(value).digest("hex");
}

function lineCount(value: string | null): number {
  return value === null || value.length === 0 ? 0 : value.split("\n").length;
}

function focusLines(side: "before" | "after", value: string | null): SanrioEdinetFocusedReviewLine[] {
  if (value === null) return [];
  const results: SanrioEdinetFocusedReviewLine[] = [];
  for (const [index, text] of value.split("\n").entries()) {
    const matchedKeywords = FOCUS_KEYWORDS.filter(keyword => text.includes(keyword));
    if (matchedKeywords.length === 0) continue;
    results.push({
      side,
      lineNumber: index + 1,
      text: text.slice(0, 2000),
      matchedKeywords: [...matchedKeywords],
    });
  }
  return results;
}

function validateContentBoundary(
  plan: SanrioEdinetFocusedReviewPlanCandidate,
  content: SanrioEdinetFocusedReviewContent,
): void {
  if (content.candidateId !== plan.candidateId) {
    throw new Error(`${plan.candidateId} content identity mismatch`);
  }
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
    if (value !== null && value.length > 5_000_000) {
      throw new Error(`${plan.candidateId} ${side} text exceeds focused review limit`);
    }
  }
}

export function buildSanrioEdinetFocusedReviewBundle(input: {
  plan: SanrioEdinetFocusedReviewPlan;
  contents: SanrioEdinetFocusedReviewContent[];
  generatedAt?: string;
}): SanrioEdinetFocusedReviewBundle {
  const generatedAt = input.generatedAt
    ? requireTimestamp(input.generatedAt, "generatedAt")
    : new Date().toISOString();
  if (input.plan.appendAuthorized !== false) throw new Error("focused plan must not authorize append");
  const planBase = { ...input.plan } as SanrioEdinetFocusedReviewPlan;
  const expectedPlanHash = planBase.focusedPlanHash;
  const { focusedPlanHash: _focusedPlanHash, ...withoutPlanHash } = planBase;
  if (hashValue(withoutPlanHash) !== expectedPlanHash) throw new Error("focusedPlanHash mismatch");

  const contentById = new Map<string, SanrioEdinetFocusedReviewContent>();
  for (const content of input.contents) {
    if (contentById.has(content.candidateId)) throw new Error(`duplicate content ${content.candidateId}`);
    contentById.set(content.candidateId, content);
  }
  if (contentById.size !== input.plan.candidateCount) {
    throw new Error("focused review content count mismatch");
  }

  const candidates = input.plan.candidates.map(planCandidate => {
    const content = contentById.get(planCandidate.candidateId);
    if (!content) throw new Error(`missing content ${planCandidate.candidateId}`);
    validateContentBoundary(planCandidate, content);
    const candidateBase = {
      ...planCandidate,
      beforeText: content.beforeText,
      afterText: content.afterText,
      beforeTextHash: textHash(content.beforeText),
      afterTextHash: textHash(content.afterText),
      beforeLineCount: lineCount(content.beforeText),
      afterLineCount: lineCount(content.afterText),
      focusLines: [
        ...focusLines("before", content.beforeText),
        ...focusLines("after", content.afterText),
      ],
      factStatus: "unreviewed_source_text" as const,
      semanticType: "unknown_pending_human_review" as const,
      materiality: "unknown_pending_human_review" as const,
      direction: "unknown_pending_human_review" as const,
      accountingImpact: "unknown_pending_human_review" as const,
    };
    return { ...candidateBase, candidateHash: hashValue(candidateBase) };
  });

  const hashPayload = {
    schemaVersion: 1,
    source: "edinet",
    focusedPlanHash: input.plan.focusedPlanHash,
    candidates,
    appendAuthorized: false,
  };
  return {
    schemaVersion: 1,
    source: "edinet",
    issuer: input.plan.issuer,
    sourceTriageWorkspaceFile: input.plan.sourceTriageWorkspaceFile,
    sourceTriageWorkspaceHash: input.plan.sourceTriageWorkspaceHash,
    sourceDiffWorkspaceFile: input.plan.sourceDiffWorkspaceFile,
    sourceDiffWorkspaceHash: input.plan.sourceDiffWorkspaceHash,
    focusedPlanHash: input.plan.focusedPlanHash,
    generatedAt,
    clusterCount: input.plan.clusterCount,
    candidateCount: candidates.length,
    focusLineCount: candidates.reduce((sum, candidate) => sum + candidate.focusLines.length, 0),
    reviewStatus: "pending_human_review",
    candidates,
    globalBlockers: [
      "source_text_is_not_yet_a_confirmed_fact_record",
      "original_and_corrected_pdf_cross_check_required",
      "amount_and_period_confirmation_required",
      "accounting_impact_not_confirmed",
      "semantic_type_not_confirmed",
      "materiality_not_confirmed",
      "direction_not_confirmed",
      "foundation_preview_not_authorized",
    ].sort(),
    appendAuthorized: false,
    focusedBundleHash: hashValue(hashPayload),
  };
}

function fencedText(value: string | null): string[] {
  return ["````text", value ?? "(none)", "````"];
}

export function renderSanrioEdinetFocusedReviewBundle(
  bundle: SanrioEdinetFocusedReviewBundle,
): string {
  const lines = [
    "# Sanrio EDINET focused correction review bundle",
    "",
    `- generatedAt: ${bundle.generatedAt}`,
    `- sourceTriageWorkspaceFile: ${bundle.sourceTriageWorkspaceFile}`,
    `- sourceTriageWorkspaceHash: ${bundle.sourceTriageWorkspaceHash}`,
    `- sourceDiffWorkspaceFile: ${bundle.sourceDiffWorkspaceFile}`,
    `- sourceDiffWorkspaceHash: ${bundle.sourceDiffWorkspaceHash}`,
    `- focusedPlanHash: ${bundle.focusedPlanHash}`,
    `- focusedBundleHash: ${bundle.focusedBundleHash}`,
    `- clusterCount: ${bundle.clusterCount}`,
    `- candidateCount: ${bundle.candidateCount}`,
    `- focusLineCount: ${bundle.focusLineCount}`,
    "- reviewStatus: pending_human_review",
    "- appendAuthorized: false",
    "",
    "## Interpretation boundary",
    "",
    "- This file contains extracted EDINET source text, not confirmed Alpha Pon facts.",
    "- Confirm names, amounts, periods, correction scope, and before/after wording against both PDFs.",
    "- Do not infer accounting impact, materiality, direction, or investment meaning from keyword hits alone.",
    "- Separate newly disclosed facts, previously known facts, inference, and opinion before any Foundation preview.",
    "",
    "## Human review checklist",
    "",
    "- [ ] Open the original and corrected PDFs for both periods.",
    "- [ ] Confirm the correction reason and every listed correction item.",
    "- [ ] Confirm all compensation amounts, currencies, periods, and recipients.",
    "- [ ] Determine whether financial statements changed or only governance disclosure changed.",
    "- [ ] Determine whether internal-control disclosures or audit opinions changed.",
    "- [ ] Record newly disclosed / previously known / inference / opinion separately.",
    "",
  ];

  for (const candidate of bundle.candidates) {
    lines.push(
      `## ${candidate.fromDocID} → ${candidate.toDocID}`,
      "",
      `- candidateId: ${candidate.candidateId}`,
      `- clusterId: ${candidate.clusterId}`,
      `- logicalRoleKey: ${candidate.logicalRoleKey}`,
      `- changeType: ${candidate.changeType}`,
      `- reasons: ${candidate.reasonCodes.join(", ")}`,
      `- beforePath: ${candidate.beforePath ?? "(none)"}`,
      `- afterPath: ${candidate.afterPath ?? "(none)"}`,
      `- beforeTextHash: ${candidate.beforeTextHash ?? "(none)"}`,
      `- afterTextHash: ${candidate.afterTextHash ?? "(none)"}`,
      `- lineCount: before=${candidate.beforeLineCount}, after=${candidate.afterLineCount}`,
      `- candidateHash: ${candidate.candidateHash}`,
      "- factStatus: unreviewed_source_text",
      "- semanticType/materiality/direction/accountingImpact: unknown_pending_human_review",
      "",
      "### Focus lines",
      "",
    );
    if (candidate.focusLines.length === 0) {
      lines.push("(none)", "");
    } else {
      for (const focus of candidate.focusLines) {
        lines.push(
          `- ${focus.side} L${focus.lineNumber} [${focus.matchedKeywords.join(", ")}]: ${focus.text}`,
        );
      }
      lines.push("");
    }
    lines.push(
      "### Before full text",
      "",
      ...fencedText(candidate.beforeText),
      "",
      "### After full text",
      "",
      ...fencedText(candidate.afterText),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}
