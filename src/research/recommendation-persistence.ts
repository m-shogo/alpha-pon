import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { validatePriceRecordTimeline } from "./price-record-timeline.js";
import { computePriceRecordHash, type PitPriceRecord } from "./price-store.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type RecommendationDecision = "BUY" | "WATCH" | "WAIT" | "AVOID";
export type RecommendationEvidenceTier = "A" | "B" | "C" | "D";
export type RecommendationEdgeStage =
  | "catalog"
  | "candidate"
  | "active-research"
  | "shadow"
  | "validated"
  | "rejected"
  | "dormant";

export type RecommendationEvidenceRef = {
  tier: RecommendationEvidenceTier;
  ref: string;
};

export type RecommendationEvidenceSummary = {
  newFacts: string[];
  knownFacts: string[];
  assumptions: string[];
  forecasts: string[];
  opinions: string[];
};

export type RecommendationRecord = {
  schemaVersion: 1;
  recommendationId: string;
  issuedAt: string;
  informationCutoff: string;
  code: string;
  companyName: string;
  currentPrice: number;
  currentPriceRecordHash: string;
  currentPriceFirstExecutableAt: string;
  decision: RecommendationDecision;
  buyRange?: [number, number];
  buyRangeBasisRefs?: string[];
  targetRange?: [number, number];
  targetRangeBasisRefs?: string[];
  timeHorizon: string;
  confidence?: number;
  confidenceBasisRefs?: string[];
  bullScenario: string;
  baseScenario: string;
  bearScenario: string;
  scenarioProbabilities?: { bull: number; base: number; bear: number };
  scenarioProbabilityBasisRefs?: string[];
  catalysts: string[];
  risks: string[];
  confirmationConditions: string[];
  invalidationRules: string[];
  exitConditions: string[];
  evidenceSummary: RecommendationEvidenceSummary;
  sourceEvidence: RecommendationEvidenceRef[];
  edgeIds: string[];
  benchmark: string;
  benchmarkPriceRecordHash: string;
  benchmarkPriceFirstExecutableAt: string;
  sectorBenchmark: string;
  sectorBenchmarkPriceRecordHash: string;
  sectorBenchmarkPriceFirstExecutableAt: string;
  positionSizingRationale?: string;
  outcomeReviewDate: string;
  status: "open" | "target_reached" | "invalidated" | "expired" | "reviewed";
  supersedesId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type RecommendationEvidenceContext = {
  tier: RecommendationEvidenceTier;
  observedAt: string;
};

export type RecommendationValidationContext = {
  priceRecordsByHash: ReadonlyMap<string, PitPriceRecord>;
  evidenceByRef: ReadonlyMap<string, RecommendationEvidenceContext>;
  edgeStageById: ReadonlyMap<string, RecommendationEdgeStage>;
};

export type RecommendationIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const RECOMMENDATION_PATHS = {
  records: "research/recommendations/recommendations.jsonl",
  schema: "research/schemas/recommendation-record.schema.json",
} as const;

const ELIGIBLE_EDGE_STAGES = new Set<RecommendationEdgeStage>([
  "active-research",
  "shadow",
  "validated",
]);

function error(code: string, target: string, message: string): RecommendationIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(record: RecommendationRecord): Omit<RecommendationRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeRecommendationHash(
  record: RecommendationRecord | Omit<RecommendationRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withRecommendationHash(
  record: Omit<RecommendationRecord, "contentHash">,
): RecommendationRecord {
  return { ...record, contentHash: computeRecommendationHash(record) };
}

function canonicalCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\.T$/, "");
  return normalized.length === 5 && normalized.endsWith("0")
    ? normalized.slice(0, -1)
    : normalized;
}

function canonicalBenchmarkCode(code: string): string {
  return code.trim().toUpperCase();
}

function rangeIssues(
  range: [number, number] | undefined,
  basisRefs: string[] | undefined,
  field: "buyRange" | "targetRange",
): RecommendationIssue[] {
  const issues: RecommendationIssue[] = [];
  if (range && range[0] > range[1]) {
    issues.push(error("range_reversed", field, `${field}は lower <= upper が必要です`));
  }
  if (range && (!basisRefs || basisRefs.length === 0)) {
    issues.push(error("quantitative_basis_missing", field, `${field}を保存するには根拠refが必要です`));
  }
  if (!range && basisRefs && basisRefs.length > 0) {
    issues.push(error("orphan_quantitative_basis", `${field}BasisRefs`, `${field}なしで根拠refだけを保存できません`));
  }
  return issues;
}

function secretLikeReference(ref: string): boolean {
  return /(?:[?&](?:subscription-key|api[_-]?key|token|password)=)|(?:bearer\s+)/i.test(ref);
}

function evidenceSeparationIssues(summary: RecommendationEvidenceSummary): RecommendationIssue[] {
  const buckets: [keyof RecommendationEvidenceSummary, string[]][] = [
    ["newFacts", summary.newFacts],
    ["knownFacts", summary.knownFacts],
    ["assumptions", summary.assumptions],
    ["forecasts", summary.forecasts],
    ["opinions", summary.opinions],
  ];
  const owner = new Map<string, keyof RecommendationEvidenceSummary>();
  const issues: RecommendationIssue[] = [];
  for (const [bucket, values] of buckets) {
    for (const value of values) {
      const key = value.trim();
      const prior = owner.get(key);
      if (prior && prior !== bucket) {
        issues.push(error(
          "evidence_category_overlap",
          `evidenceSummary.${bucket}`,
          `同じ記述を ${prior} と ${bucket} に重複分類できません`,
        ));
      } else {
        owner.set(key, bucket);
      }
    }
  }
  return issues;
}

function assertCanonicalPriceHash(
  price: PitPriceRecord,
  expectedHash: string,
  target: string,
  mismatchCode: string,
): RecommendationIssue[] {
  const issues: RecommendationIssue[] = [];
  if (price.contentHash !== expectedHash) {
    issues.push(error(mismatchCode, target, "price record hashがpinと一致しません"));
  }
  if (computePriceRecordHash(price) !== price.contentHash) {
    issues.push(error("invalid_pinned_price_content_hash", target, "pinされたPIT Price Store recordのcontentHashが内容と一致しません"));
  }
  const timelineViolations = validatePriceRecordTimeline(price);
  if (timelineViolations.length > 0) {
    issues.push(error(
      "invalid_pinned_price_timeline",
      target,
      `pinされたPIT Price Store recordの時系列が不正です: ${timelineViolations
        .map((violation) => `${violation.code}(${violation.message})`)
        .join(", ")}`,
    ));
  }
  return issues;
}

function priceProvenanceIssues(
  record: RecommendationRecord,
  context: RecommendationValidationContext,
): RecommendationIssue[] {
  const target = `recommendation:${record.recommendationId}`;
  const price = context.priceRecordsByHash.get(record.currentPriceRecordHash);
  if (!price) {
    return [error(
      "missing_price_provenance",
      `${target}.currentPriceRecordHash`,
      "currentPriceはPIT Price Storeの既知recordへpinする必要があります",
    )];
  }

  const issues: RecommendationIssue[] = [];
  issues.push(...assertCanonicalPriceHash(price, record.currentPriceRecordHash, target, "price_hash_mismatch"));
  if (price.seriesKind !== "security" || canonicalCode(price.code) !== canonicalCode(record.code)) {
    issues.push(error("price_security_mismatch", target, "currentPriceのsecurityがrecommendation対象と一致しません"));
  }
  if (price.status !== "traded" || !price.ohlcv) {
    issues.push(error("price_not_traded", target, "currentPriceはtraded OHLC recordから取得する必要があります"));
  } else if (Math.abs(price.ohlcv.close - record.currentPrice) > 1e-9) {
    issues.push(error("current_price_mismatch", target, "currentPriceがpinされたPIT closeと一致しません"));
  }
  if (price.firstExecutableAt !== record.currentPriceFirstExecutableAt) {
    issues.push(error("price_execution_pin_mismatch", target, "currentPriceFirstExecutableAtがPIT recordと一致しません"));
  }
  if (Date.parse(price.observedAt) > Date.parse(record.informationCutoff)) {
    issues.push(error("future_price_observation", target, "informationCutoff後に観測された価格を当初判断へ混ぜられません"));
  }
  if (Date.parse(price.firstExecutableAt) > Date.parse(record.issuedAt)) {
    issues.push(error("price_not_yet_executable", target, "issuedAt時点でまだ実行可能でない価格をcurrentPriceにできません"));
  }
  if (price.license === "unknown") {
    issues.push(error("unknown_price_license", target, "利用権不明のprice recordをrecommendationへ使えません"));
  }
  return issues;
}

function benchmarkProvenanceIssues(input: {
  record: RecommendationRecord;
  context: RecommendationValidationContext;
  label: "benchmark" | "sectorBenchmark";
  expectedCode: string;
  recordHash: string;
  firstExecutableAt: string;
}): RecommendationIssue[] {
  const target = `recommendation:${input.record.recommendationId}`;
  const price = input.context.priceRecordsByHash.get(input.recordHash);
  if (!price) {
    return [error(
      "missing_benchmark_price_provenance",
      `${target}.${input.label}PriceRecordHash`,
      `${input.label}はPIT Price Storeの既知benchmark recordへpinする必要があります`,
    )];
  }

  const issues: RecommendationIssue[] = [];
  issues.push(...assertCanonicalPriceHash(price, input.recordHash, target, "benchmark_price_hash_mismatch"));
  if (price.seriesKind !== "benchmark" || canonicalBenchmarkCode(price.code) !== canonicalBenchmarkCode(input.expectedCode)) {
    issues.push(error("benchmark_identity_mismatch", target, `${input.label}のPIT record identityが一致しません`));
  }
  if (price.status !== "traded" || !price.ohlcv) {
    issues.push(error("benchmark_price_not_traded", target, `${input.label}はtraded OHLC recordである必要があります`));
  }
  if (price.firstExecutableAt !== input.firstExecutableAt) {
    issues.push(error("benchmark_execution_pin_mismatch", target, `${input.label}PriceFirstExecutableAtがPIT recordと一致しません`));
  }
  if (Date.parse(price.observedAt) > Date.parse(input.record.informationCutoff)) {
    issues.push(error("future_benchmark_observation", target, `${input.label}がinformationCutoff後に観測されています`));
  }
  if (Date.parse(price.firstExecutableAt) > Date.parse(input.record.issuedAt)) {
    issues.push(error("benchmark_not_yet_executable", target, `${input.label}はissuedAt時点でまだ実行可能ではありません`));
  }
  if (price.license === "unknown") {
    issues.push(error("unknown_benchmark_license", target, `${input.label}の利用権が不明です`));
  }
  return issues;
}

function evidenceContextIssues(
  record: RecommendationRecord,
  context: RecommendationValidationContext,
): RecommendationIssue[] {
  const target = `recommendation:${record.recommendationId}`;
  const issues: RecommendationIssue[] = [];
  for (const evidence of record.sourceEvidence) {
    if (secretLikeReference(evidence.ref)) {
      issues.push(error("secret_like_evidence_ref", target, "secret/tokenを含む可能性があるevidence refは保存できません"));
      continue;
    }
    const source = context.evidenceByRef.get(evidence.ref);
    if (!source) {
      issues.push(error("unknown_evidence_ref", target, `未検証evidence refです: ${evidence.ref}`));
      continue;
    }
    if (source.tier !== evidence.tier) {
      issues.push(error("evidence_tier_mismatch", target, `evidence tierが正本と一致しません: ${evidence.ref}`));
    }
    if (Date.parse(source.observedAt) > Date.parse(record.informationCutoff)) {
      issues.push(error("future_evidence", target, `informationCutoff後のevidenceです: ${evidence.ref}`));
    }
  }
  return issues;
}

function edgeContextIssues(
  record: RecommendationRecord,
  context: RecommendationValidationContext,
): RecommendationIssue[] {
  const target = `recommendation:${record.recommendationId}`;
  const issues: RecommendationIssue[] = [];
  let eligibleCount = 0;
  for (const edgeId of record.edgeIds) {
    const stage = context.edgeStageById.get(edgeId);
    if (!stage) {
      issues.push(error("unknown_edge", target, `未知のEdgeです: ${edgeId}`));
      continue;
    }
    if (!ELIGIBLE_EDGE_STAGES.has(stage)) {
      issues.push(error("ineligible_edge_stage", target, `${edgeId} は recommendation に使えないstageです: ${stage}`));
      continue;
    }
    eligibleCount += 1;
  }
  if (record.decision === "BUY" && eligibleCount === 0) {
    issues.push(error("buy_without_eligible_edge", target, "BUYにはactive-research/shadow/validated Edgeが最低1件必要です"));
  }
  return issues;
}

export function validateRecommendationRecord(
  value: unknown,
  schema: JsonSchema,
  context: RecommendationValidationContext,
): RecommendationIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((item) => error(
      "schema_violation",
      item.path || "RecommendationRecord",
      item.message,
    ));
  }

  const record = value as RecommendationRecord;
  const target = `recommendation:${record.recommendationId}`;
  const issues: RecommendationIssue[] = [];

  if (record.contentHash !== computeRecommendationHash(record)) {
    issues.push(error("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  if (Date.parse(record.informationCutoff) > Date.parse(record.issuedAt)) {
    issues.push(error("cutoff_after_issue", target, "informationCutoffはissuedAt以前である必要があります"));
  }
  if (Date.parse(record.currentPriceFirstExecutableAt) > Date.parse(record.issuedAt)) {
    issues.push(error("current_price_after_issue", target, "currentPriceはissuedAt時点で実行可能である必要があります"));
  }
  const reviewEnd = Date.parse(`${record.outcomeReviewDate}T23:59:59+09:00`);
  if (reviewEnd < Date.parse(record.issuedAt)) {
    issues.push(error("outcome_review_before_issue", target, "outcomeReviewDateをissuedAtより前にできません"));
  }

  issues.push(...rangeIssues(record.buyRange, record.buyRangeBasisRefs, "buyRange"));
  issues.push(...rangeIssues(record.targetRange, record.targetRangeBasisRefs, "targetRange"));

  if (record.confidence !== undefined && (!record.confidenceBasisRefs || record.confidenceBasisRefs.length === 0)) {
    issues.push(error("confidence_basis_missing", target, "confidenceを保存するには計算根拠refが必要です"));
  }
  if (record.confidence === undefined && record.confidenceBasisRefs?.length) {
    issues.push(error("orphan_confidence_basis", target, "confidenceなしでconfidenceBasisRefsだけを保存できません"));
  }

  if (record.scenarioProbabilities) {
    const sum = record.scenarioProbabilities.bull
      + record.scenarioProbabilities.base
      + record.scenarioProbabilities.bear;
    if (Math.abs(sum - 1) > 1e-9) {
      issues.push(error("scenario_probability_sum", target, "scenarioProbabilitiesは合計1である必要があります"));
    }
    if (!record.scenarioProbabilityBasisRefs?.length) {
      issues.push(error("scenario_probability_basis_missing", target, "scenarioProbabilitiesには計算根拠refが必要です"));
    }
  } else if (record.scenarioProbabilityBasisRefs?.length) {
    issues.push(error("orphan_scenario_probability_basis", target, "scenarioProbabilitiesなしで根拠refだけを保存できません"));
  }

  if (!record.supersedesId && record.status !== "open") {
    issues.push(error("root_status_not_open", target, "新規RecommendationRecordのstatusはopenで開始する必要があります"));
  }

  issues.push(...evidenceSeparationIssues(record.evidenceSummary));
  issues.push(...priceProvenanceIssues(record, context));
  issues.push(...benchmarkProvenanceIssues({
    record,
    context,
    label: "benchmark",
    expectedCode: record.benchmark,
    recordHash: record.benchmarkPriceRecordHash,
    firstExecutableAt: record.benchmarkPriceFirstExecutableAt,
  }));
  issues.push(...benchmarkProvenanceIssues({
    record,
    context,
    label: "sectorBenchmark",
    expectedCode: record.sectorBenchmark,
    recordHash: record.sectorBenchmarkPriceRecordHash,
    firstExecutableAt: record.sectorBenchmarkPriceFirstExecutableAt,
  }));
  issues.push(...evidenceContextIssues(record, context));
  issues.push(...edgeContextIssues(record, context));

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateRecommendationRecords(
  records: RecommendationRecord[],
  schema: JsonSchema,
  context: RecommendationValidationContext,
): RecommendationIssue[] {
  const issues = records.flatMap((record) => validateRecommendationRecord(record, schema, context));
  const byId = new Map<string, RecommendationRecord>();
  const byHash = new Map<string, RecommendationRecord>();
  const childrenByParent = new Map<string, string[]>();

  for (const record of records) {
    if (byId.has(record.recommendationId)) {
      issues.push(error("duplicate_recommendation_id", record.recommendationId, "recommendationIdが重複しています"));
    } else {
      byId.set(record.recommendationId, record);
    }
    if (byHash.has(record.contentHash)) {
      issues.push(error("duplicate_recommendation_hash", record.recommendationId, "contentHashが重複しています"));
    } else {
      byHash.set(record.contentHash, record);
    }
    if (record.supersedesId) {
      const children = childrenByParent.get(record.supersedesId) ?? [];
      children.push(record.recommendationId);
      childrenByParent.set(record.supersedesId, children);
    }
  }

  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(error(
        "revision_fork",
        parentId,
        `同一RecommendationRecordから複数revisionへ分岐できません: ${children.sort().join(", ")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesId) continue;
    const prior = byId.get(record.supersedesId);
    if (!prior) {
      issues.push(error("missing_superseded_record", record.recommendationId, `supersedesIdが見つかりません: ${record.supersedesId}`));
      continue;
    }
    if (prior.recommendationId === record.recommendationId) {
      issues.push(error("self_supersession", record.recommendationId, "自分自身をsupersedeできません"));
    }
    if (canonicalCode(prior.code) !== canonicalCode(record.code) || prior.companyName !== record.companyName) {
      issues.push(error("revision_identity_mismatch", record.recommendationId, "revisionでsecurity/company identityを変更できません"));
    }
    if (Date.parse(record.issuedAt) <= Date.parse(prior.issuedAt)) {
      issues.push(error("revision_issue_time_not_monotonic", record.recommendationId, "revision issuedAtは直前recordより後である必要があります"));
    }
    if (Date.parse(record.informationCutoff) < Date.parse(prior.informationCutoff)) {
      issues.push(error("revision_cutoff_regressed", record.recommendationId, "revisionでinformationCutoffを過去へ戻せません"));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseRecommendationJsonl(content: string, path = "<memory>"): RecommendationRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as RecommendationRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readRecommendationJsonl(path: string): RecommendationRecord[] {
  if (!existsSync(path)) return [];
  return parseRecommendationJsonl(readFileSync(path, "utf-8"), path);
}

export function appendRecommendationRecords(input: {
  path: string;
  incoming: RecommendationRecord[];
  schema: JsonSchema;
  context: RecommendationValidationContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readRecommendationJsonl(input.path);
  const issues = validateRecommendationRecords(
    [...existing, ...input.incoming],
    input.schema,
    input.context,
  ).filter((item) => item.severity === "error");
  if (issues.length > 0) {
    throw new Error(issues.map((item) => `${item.code} ${item.target}: ${item.message}`).join("\n"));
  }

  mkdirSync(dirname(input.path), { recursive: true });
  const fd = openSync(input.path, "a");
  try {
    appendFileSync(fd, `${input.incoming.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}