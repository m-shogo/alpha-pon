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
import {
  computeCorporateActionClearanceHash,
  type CorporateActionClearanceRecord,
} from "./corporate-action-clearance.js";
import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./iso-instant.js";
import { validatePriceRecordTimeline } from "./price-record-timeline.js";
import {
  computePriceRecordHash,
  type PitPriceRecord,
} from "./price-store.js";
import {
  computeRecommendationHash,
  type RecommendationRecord,
} from "./recommendation-persistence.js";
import { stableStringify, validate, type JsonSchema } from "./schema.js";

export type QuantitativeOutcomeRecord = {
  schemaVersion: 1;
  outcomeId: string;
  recommendationId: string;
  recommendationContentHash: string;
  reviewedAt: string;
  measurementCutoff: string;
  measurementMethod: "pit-close-common-date-v1";
  returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1";
  issuerCorporateActionClearanceHash: string;
  baselineTradingDate: string;
  terminalTradingDate: string;
  issuerBaselineRecordHash: string;
  benchmarkBaselineRecordHash: string;
  sectorBenchmarkBaselineRecordHash: string;
  issuerTerminalRecordHash: string;
  benchmarkTerminalRecordHash: string;
  sectorBenchmarkTerminalRecordHash: string;
  issuerMeasurementRecordHashes: string[];
  benchmarkMeasurementRecordHashes: string[];
  sectorBenchmarkMeasurementRecordHashes: string[];
  maxReturn: number;
  maxDrawdown: number;
  terminalReturn: number;
  benchmarkReturn: number;
  sectorBenchmarkReturn: number;
  benchmarkExcessReturn: number;
  sectorBenchmarkExcessReturn: number;
  targetAssessment: "reached" | "not_reached" | "not_applicable";
  targetReachedAt?: string;
  reviewStage: "quantitative_measurement";
  invalidationAssessment: "not_assessed";
  verdict: "inconclusive";
  correctAssumptions: string[];
  incorrectAssumptions: string[];
  missingEvidence: string[];
  unexpectedConfounders: string[];
  lessons: string[];
  nextRuleChanges: string[];
  supersedesOutcomeId?: string;
  automaticTradingAuthorized: false;
  contentHash: string;
};

export type QuantitativeOutcomeContext = {
  recommendationsById: ReadonlyMap<string, RecommendationRecord>;
  priceRecordsByHash: ReadonlyMap<string, PitPriceRecord>;
  corporateActionClearancesByHash: ReadonlyMap<string, CorporateActionClearanceRecord>;
};

export type QuantitativeOutcomeIssue = {
  severity: "error" | "warning";
  code: string;
  target: string;
  message: string;
};

export const QUANTITATIVE_OUTCOME_PATHS = {
  records: "research/recommendations/quantitative-outcomes.jsonl",
  schema: "research/schemas/quantitative-outcome-record.schema.json",
} as const;

function issue(code: string, target: string, message: string): QuantitativeOutcomeIssue {
  return { severity: "error", code, target, message };
}

function withoutHash(record: QuantitativeOutcomeRecord): Omit<QuantitativeOutcomeRecord, "contentHash"> {
  const { contentHash: _contentHash, ...input } = record;
  return input;
}

export function computeQuantitativeOutcomeHash(
  record: QuantitativeOutcomeRecord | Omit<QuantitativeOutcomeRecord, "contentHash">,
): string {
  const input = "contentHash" in record ? withoutHash(record) : record;
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function withQuantitativeOutcomeHash(
  record: Omit<QuantitativeOutcomeRecord, "contentHash">,
): QuantitativeOutcomeRecord {
  return { ...record, contentHash: computeQuantitativeOutcomeHash(record) };
}

function assertCanonicalPriceTimeline(record: PitPriceRecord, label: string): void {
  const violations = validatePriceRecordTimeline(record);
  if (violations.length === 0) return;
  throw new Error(
    `${label}: invalid price PIT timeline: ${violations
      .map((violation) => `${violation.code}(${violation.message})`)
      .join(", ")}`,
  );
}

function canonicalPrice(
  hash: string,
  priceRecordsByHash: ReadonlyMap<string, PitPriceRecord>,
  label: string,
): PitPriceRecord {
  const record = priceRecordsByHash.get(hash);
  if (!record) throw new Error(`${label}: price record not found: ${hash}`);
  if (record.contentHash !== hash || computePriceRecordHash(record) !== hash) {
    throw new Error(`${label}: price record hash mismatch: ${hash}`);
  }
  assertCanonicalPriceTimeline(record, label);
  if (record.status !== "traded" || !record.ohlcv) {
    throw new Error(`${label}: traded OHLC record required`);
  }
  if (record.license === "unknown") {
    throw new Error(`${label}: unknown price license`);
  }
  return record;
}

function canonicalClearance(
  hash: string,
  clearancesByHash: ReadonlyMap<string, CorporateActionClearanceRecord>,
): CorporateActionClearanceRecord {
  const clearance = clearancesByHash.get(hash);
  if (!clearance) throw new Error(`corporate action clearance not found: ${hash}`);
  if (
    clearance.contentHash !== hash
    || computeCorporateActionClearanceHash(clearance) !== hash
  ) {
    throw new Error(`corporate action clearance hash mismatch: ${hash}`);
  }
  if (clearance.status !== "clear") {
    throw new Error(`corporate action clearance must be clear: ${clearance.status}`);
  }
  return clearance;
}

function assertBaselineIdentity(
  recommendation: RecommendationRecord,
  issuer: PitPriceRecord,
  benchmark: PitPriceRecord,
  sector: PitPriceRecord,
): void {
  if (issuer.seriesKind !== "security") throw new Error("issuer baseline must be security");
  if (benchmark.seriesKind !== "benchmark") throw new Error("benchmark baseline must be benchmark");
  if (sector.seriesKind !== "benchmark") throw new Error("sector benchmark baseline must be benchmark");
  if (issuer.contentHash !== recommendation.currentPriceRecordHash) throw new Error("issuer baseline pin mismatch");
  if (benchmark.contentHash !== recommendation.benchmarkPriceRecordHash) throw new Error("benchmark baseline pin mismatch");
  if (sector.contentHash !== recommendation.sectorBenchmarkPriceRecordHash) throw new Error("sector baseline pin mismatch");
  if (issuer.firstExecutableAt !== recommendation.currentPriceFirstExecutableAt) {
    throw new Error("issuer baseline executable pin mismatch");
  }
  if (benchmark.firstExecutableAt !== recommendation.benchmarkPriceFirstExecutableAt) {
    throw new Error("benchmark baseline executable pin mismatch");
  }
  if (sector.firstExecutableAt !== recommendation.sectorBenchmarkPriceFirstExecutableAt) {
    throw new Error("sector baseline executable pin mismatch");
  }
  if (issuer.tradingDate !== benchmark.tradingDate || issuer.tradingDate !== sector.tradingDate) {
    throw new Error("issuer/TOPIX/sector baselines must share one tradingDate");
  }
  if (issuer.ohlcv!.close !== recommendation.currentPrice) {
    throw new Error("issuer baseline close does not match recommendation currentPrice");
  }
}

function sameSeries(record: PitPriceRecord, baseline: PitPriceRecord): boolean {
  return record.seriesKind === baseline.seriesKind
    && record.code === baseline.code
    && record.market === baseline.market
    && record.source === baseline.source
    && record.providerPlan === baseline.providerPlan;
}

function selectedSeriesAfterIssue(input: {
  baseline: PitPriceRecord;
  recommendation: RecommendationRecord;
  reviewedAt: string;
  priceRecordsByHash: ReadonlyMap<string, PitPriceRecord>;
  label: string;
}): PitPriceRecord[] {
  const selected = new Map<string, PitPriceRecord>();

  for (const record of input.priceRecordsByHash.values()) {
    if (!sameSeries(record, input.baseline)) continue;
    if (record.tradingDate <= input.baseline.tradingDate) continue;
    if (compareExplicitIso8601Instants(
      record.firstExecutableAt,
      input.recommendation.issuedAt,
      `${input.label} measurement.firstExecutableAt`,
      "recommendation.issuedAt",
    ) <= 0) continue;
    if (compareExplicitIso8601Instants(
      record.firstExecutableAt,
      input.reviewedAt,
      `${input.label} measurement.firstExecutableAt`,
      "reviewedAt",
    ) > 0) continue;
    if (compareExplicitIso8601Instants(
      record.observedAt,
      input.reviewedAt,
      `${input.label} measurement.observedAt`,
      "reviewedAt",
    ) > 0) continue;
    assertCanonicalPriceTimeline(record, `${input.label} measurement`);
    if (record.status !== "traded" || !record.ohlcv) continue;
    if (record.license === "unknown") throw new Error(`${input.label}: unknown price license in measurement path`);
    if (computePriceRecordHash(record) !== record.contentHash) {
      throw new Error(`${input.label}: invalid price contentHash in measurement path: ${record.contentHash}`);
    }

    const prior = selected.get(record.tradingDate);
    const observedOrdering = prior
      ? compareExplicitIso8601Instants(
        record.observedAt,
        prior.observedAt,
        `${input.label} measurement.observedAt`,
        `${input.label} prior measurement.observedAt`,
      )
      : 1;
    if (
      !prior
      || observedOrdering > 0
      || (observedOrdering === 0 && record.contentHash < prior.contentHash)
    ) {
      selected.set(record.tradingDate, record);
    }
  }

  return [...selected.values()].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
}

function latestCommonTradingDate(series: readonly PitPriceRecord[][]): string {
  if (series.some((records) => records.length === 0)) {
    throw new Error("quantitative outcome requires post-issue issuer, benchmark and sector records");
  }
  const [first, ...rest] = series;
  const otherSets = rest.map((records) => new Set(records.map((record) => record.tradingDate)));
  const common = first
    .map((record) => record.tradingDate)
    .filter((date) => otherSets.every((set) => set.has(date)))
    .sort();
  const terminal = common.at(-1);
  if (!terminal) throw new Error("no common terminal tradingDate across issuer/TOPIX/sector series");
  return terminal;
}

function recordsThrough(records: PitPriceRecord[], terminalTradingDate: string): PitPriceRecord[] {
  return records.filter((record) => record.tradingDate <= terminalTradingDate);
}

function recordOn(records: PitPriceRecord[], tradingDate: string, label: string): PitPriceRecord {
  const record = records.find((candidate) => candidate.tradingDate === tradingDate);
  if (!record) throw new Error(`${label}: terminal record not found for ${tradingDate}`);
  return record;
}

function assertUnadjustedIssuerMeasurement(
  baseline: PitPriceRecord,
  records: PitPriceRecord[],
): void {
  for (const record of [baseline, ...records]) {
    if (record.adjusted || record.adjustmentFactor !== 1 || record.corporateActions.length > 0) {
      throw new Error(
        `pit-close-common-date-v1 only supports unadjusted issuer records with adjustmentFactor=1 and no embedded corporate actions: ${record.contentHash}`,
      );
    }
  }
}

function assertCorporateActionClearance(input: {
  clearance: CorporateActionClearanceRecord;
  clearancesByHash: ReadonlyMap<string, CorporateActionClearanceRecord>;
  issuerBaseline: PitPriceRecord;
  terminalTradingDate: string;
  reviewedAt: string;
}): void {
  if (
    input.clearance.code !== input.issuerBaseline.code
    || input.clearance.market !== input.issuerBaseline.market
    || input.clearance.source !== input.issuerBaseline.source
    || input.clearance.providerPlan !== input.issuerBaseline.providerPlan
  ) {
    throw new Error("corporate action clearance series identity does not match issuer price series");
  }
  if (input.clearance.fromTradingDate > input.issuerBaseline.tradingDate) {
    throw new Error("corporate action clearance does not cover issuer baseline tradingDate");
  }
  if (input.clearance.throughTradingDate < input.terminalTradingDate) {
    throw new Error("corporate action clearance does not cover terminal tradingDate");
  }
  if (compareExplicitIso8601Instants(
    input.clearance.assessedAt,
    input.reviewedAt,
    "corporateActionClearance.assessedAt",
    "reviewedAt",
  ) > 0) {
    throw new Error("corporate action clearance was assessed after reviewedAt");
  }
  const supersedingClearance = [...input.clearancesByHash.values()].find((candidate) =>
    candidate.supersedesClearanceId === input.clearance.clearanceId
    && compareExplicitIso8601Instants(
      candidate.assessedAt,
      input.reviewedAt,
      `corporateActionClearance:${candidate.clearanceId}.assessedAt`,
      "reviewedAt",
    ) <= 0
  );
  if (supersedingClearance) {
    throw new Error(
      `corporate action clearance was superseded before reviewedAt: ${supersedingClearance.clearanceId}`,
    );
  }
}

function closeReturn(close: number, baseline: number): number {
  return close / baseline - 1;
}

function maxCloseReturn(records: PitPriceRecord[], baselineClose: number): number {
  return Math.max(...records.map((record) => closeReturn(record.ohlcv!.close, baselineClose)));
}

function maxCloseDrawdown(records: PitPriceRecord[], baselineClose: number): number {
  let peak = baselineClose;
  let maxDrawdown = 0;
  for (const record of records) {
    const close = record.ohlcv!.close;
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }
  return maxDrawdown;
}

function measurementHashes(baseline: PitPriceRecord, records: PitPriceRecord[]): string[] {
  return [baseline.contentHash, ...records.map((record) => record.contentHash)];
}

function targetAssessment(
  recommendation: RecommendationRecord,
  issuerRecords: PitPriceRecord[],
): { assessment: QuantitativeOutcomeRecord["targetAssessment"]; reachedAt?: string } {
  if (!recommendation.targetRange) return { assessment: "not_applicable" };
  const threshold = recommendation.targetRange[0];
  const reached = issuerRecords.find((record) => record.ohlcv!.close >= threshold);
  return reached
    ? { assessment: "reached", reachedAt: reached.tradingDate }
    : { assessment: "not_reached" };
}

export function buildQuantitativeOutcomeRecord(input: {
  outcomeId: string;
  recommendation: RecommendationRecord;
  reviewedAt: string;
  priceRecordsByHash: ReadonlyMap<string, PitPriceRecord>;
  corporateActionClearancesByHash: ReadonlyMap<string, CorporateActionClearanceRecord>;
  issuerCorporateActionClearanceHash: string;
  supersedesOutcomeId?: string;
}): QuantitativeOutcomeRecord {
  parseExplicitIso8601Instant(input.reviewedAt, "reviewedAt");
  parseExplicitIso8601Instant(input.recommendation.issuedAt, "recommendation.issuedAt");
  if (compareExplicitIso8601Instants(
    input.reviewedAt,
    input.recommendation.issuedAt,
    "reviewedAt",
    "recommendation.issuedAt",
  ) <= 0) {
    throw new Error("reviewedAt must be after recommendation issuedAt");
  }
  if (computeRecommendationHash(input.recommendation) !== input.recommendation.contentHash) {
    throw new Error("recommendation contentHash mismatch");
  }

  const issuerBaseline = canonicalPrice(
    input.recommendation.currentPriceRecordHash,
    input.priceRecordsByHash,
    "issuer baseline",
  );
  const benchmarkBaseline = canonicalPrice(
    input.recommendation.benchmarkPriceRecordHash,
    input.priceRecordsByHash,
    "benchmark baseline",
  );
  const sectorBaseline = canonicalPrice(
    input.recommendation.sectorBenchmarkPriceRecordHash,
    input.priceRecordsByHash,
    "sector benchmark baseline",
  );
  assertBaselineIdentity(input.recommendation, issuerBaseline, benchmarkBaseline, sectorBaseline);

  const issuerSeries = selectedSeriesAfterIssue({
    baseline: issuerBaseline,
    recommendation: input.recommendation,
    reviewedAt: input.reviewedAt,
    priceRecordsByHash: input.priceRecordsByHash,
    label: "issuer",
  });
  const benchmarkSeries = selectedSeriesAfterIssue({
    baseline: benchmarkBaseline,
    recommendation: input.recommendation,
    reviewedAt: input.reviewedAt,
    priceRecordsByHash: input.priceRecordsByHash,
    label: "benchmark",
  });
  const sectorSeries = selectedSeriesAfterIssue({
    baseline: sectorBaseline,
    recommendation: input.recommendation,
    reviewedAt: input.reviewedAt,
    priceRecordsByHash: input.priceRecordsByHash,
    label: "sector benchmark",
  });

  const terminalTradingDate = latestCommonTradingDate([issuerSeries, benchmarkSeries, sectorSeries]);
  const issuerThrough = recordsThrough(issuerSeries, terminalTradingDate);
  const benchmarkThrough = recordsThrough(benchmarkSeries, terminalTradingDate);
  const sectorThrough = recordsThrough(sectorSeries, terminalTradingDate);
  const issuerTerminal = recordOn(issuerThrough, terminalTradingDate, "issuer");
  const benchmarkTerminal = recordOn(benchmarkThrough, terminalTradingDate, "benchmark");
  const sectorTerminal = recordOn(sectorThrough, terminalTradingDate, "sector benchmark");

  assertUnadjustedIssuerMeasurement(issuerBaseline, issuerThrough);
  const clearance = canonicalClearance(
    input.issuerCorporateActionClearanceHash,
    input.corporateActionClearancesByHash,
  );
  assertCorporateActionClearance({
    clearance,
    clearancesByHash: input.corporateActionClearancesByHash,
    issuerBaseline,
    terminalTradingDate,
    reviewedAt: input.reviewedAt,
  });

  const issuerBaselineClose = issuerBaseline.ohlcv!.close;
  const benchmarkBaselineClose = benchmarkBaseline.ohlcv!.close;
  const sectorBaselineClose = sectorBaseline.ohlcv!.close;
  const terminalReturn = closeReturn(issuerTerminal.ohlcv!.close, issuerBaselineClose);
  const benchmarkReturn = closeReturn(benchmarkTerminal.ohlcv!.close, benchmarkBaselineClose);
  const sectorBenchmarkReturn = closeReturn(sectorTerminal.ohlcv!.close, sectorBaselineClose);
  const target = targetAssessment(input.recommendation, issuerThrough);

  const base: Omit<QuantitativeOutcomeRecord, "contentHash"> = {
    schemaVersion: 1,
    outcomeId: input.outcomeId,
    recommendationId: input.recommendation.recommendationId,
    recommendationContentHash: input.recommendation.contentHash,
    reviewedAt: input.reviewedAt,
    measurementCutoff: input.reviewedAt,
    measurementMethod: "pit-close-common-date-v1",
    returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1",
    issuerCorporateActionClearanceHash: clearance.contentHash,
    baselineTradingDate: issuerBaseline.tradingDate,
    terminalTradingDate,
    issuerBaselineRecordHash: issuerBaseline.contentHash,
    benchmarkBaselineRecordHash: benchmarkBaseline.contentHash,
    sectorBenchmarkBaselineRecordHash: sectorBaseline.contentHash,
    issuerTerminalRecordHash: issuerTerminal.contentHash,
    benchmarkTerminalRecordHash: benchmarkTerminal.contentHash,
    sectorBenchmarkTerminalRecordHash: sectorTerminal.contentHash,
    issuerMeasurementRecordHashes: measurementHashes(issuerBaseline, issuerThrough),
    benchmarkMeasurementRecordHashes: measurementHashes(benchmarkBaseline, benchmarkThrough),
    sectorBenchmarkMeasurementRecordHashes: measurementHashes(sectorBaseline, sectorThrough),
    maxReturn: maxCloseReturn(issuerThrough, issuerBaselineClose),
    maxDrawdown: maxCloseDrawdown(issuerThrough, issuerBaselineClose),
    terminalReturn,
    benchmarkReturn,
    sectorBenchmarkReturn,
    benchmarkExcessReturn: terminalReturn - benchmarkReturn,
    sectorBenchmarkExcessReturn: terminalReturn - sectorBenchmarkReturn,
    targetAssessment: target.assessment,
    ...(target.reachedAt ? { targetReachedAt: target.reachedAt } : {}),
    reviewStage: "quantitative_measurement",
    invalidationAssessment: "not_assessed",
    verdict: "inconclusive",
    correctAssumptions: [],
    incorrectAssumptions: [],
    missingEvidence: [],
    unexpectedConfounders: [],
    lessons: [],
    nextRuleChanges: [],
    ...(input.supersedesOutcomeId ? { supersedesOutcomeId: input.supersedesOutcomeId } : {}),
    automaticTradingAuthorized: false,
  };
  return withQuantitativeOutcomeHash(base);
}

export function validateQuantitativeOutcomeRecord(
  value: unknown,
  schema: JsonSchema,
  context: QuantitativeOutcomeContext,
): QuantitativeOutcomeIssue[] {
  const schemaErrors = validate(value, schema);
  if (schemaErrors.length > 0) {
    return schemaErrors.map((error) => issue(
      "schema_violation",
      error.path || "QuantitativeOutcomeRecord",
      error.message,
    ));
  }

  const record = value as QuantitativeOutcomeRecord;
  const target = `outcome:${record.outcomeId}`;
  const issues: QuantitativeOutcomeIssue[] = [];
  if (record.contentHash !== computeQuantitativeOutcomeHash(record)) {
    issues.push(issue("invalid_content_hash", `${target}.contentHash`, "contentHashが一致しません"));
  }
  const recommendation = context.recommendationsById.get(record.recommendationId);
  if (!recommendation) {
    issues.push(issue("missing_recommendation", target, "参照RecommendationRecordが見つかりません"));
    return issues;
  }
  if (
    recommendation.contentHash !== record.recommendationContentHash
    || computeRecommendationHash(recommendation) !== recommendation.contentHash
  ) {
    issues.push(issue("recommendation_hash_mismatch", target, "RecommendationRecord hash lineageが一致しません"));
    return issues;
  }
  if (record.measurementCutoff !== record.reviewedAt) {
    issues.push(issue("measurement_cutoff_mismatch", target, "v1ではmeasurementCutoffとreviewedAtを一致させます"));
  }
  if (
    record.correctAssumptions.length
    || record.incorrectAssumptions.length
    || record.missingEvidence.length
    || record.unexpectedConfounders.length
    || record.lessons.length
    || record.nextRuleChanges.length
  ) {
    issues.push(issue("human_review_fields_not_empty", target, "quantitative stageでは人間の意味解釈フィールドを空にしてください"));
  }

  try {
    const expected = buildQuantitativeOutcomeRecord({
      outcomeId: record.outcomeId,
      recommendation,
      reviewedAt: record.reviewedAt,
      priceRecordsByHash: context.priceRecordsByHash,
      corporateActionClearancesByHash: context.corporateActionClearancesByHash,
      issuerCorporateActionClearanceHash: record.issuerCorporateActionClearanceHash,
      ...(record.supersedesOutcomeId ? { supersedesOutcomeId: record.supersedesOutcomeId } : {}),
    });
    if (stableStringify(withoutHash(expected)) !== stableStringify(withoutHash(record))) {
      issues.push(issue(
        "quantitative_measurement_mismatch",
        target,
        "保存値がPIT Price Storeから再計算した定量Outcomeと一致しません",
      ));
    }
  } catch (cause) {
    issues.push(issue(
      "quantitative_measurement_unreproducible",
      target,
      (cause as Error).message,
    ));
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function validateQuantitativeOutcomeRecords(
  records: QuantitativeOutcomeRecord[],
  schema: JsonSchema,
  context: QuantitativeOutcomeContext,
): QuantitativeOutcomeIssue[] {
  const issues = records.flatMap((record) => validateQuantitativeOutcomeRecord(record, schema, context));
  const byId = new Map<string, QuantitativeOutcomeRecord>();
  const rootsByRecommendation = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();

  for (const record of records) {
    if (byId.has(record.outcomeId)) {
      issues.push(issue("duplicate_outcome_id", record.outcomeId, "outcomeIdが重複しています"));
    } else {
      byId.set(record.outcomeId, record);
    }
    if (!record.supersedesOutcomeId) {
      const roots = rootsByRecommendation.get(record.recommendationId) ?? [];
      roots.push(record.outcomeId);
      rootsByRecommendation.set(record.recommendationId, roots);
    } else {
      const children = childrenByParent.get(record.supersedesOutcomeId) ?? [];
      children.push(record.outcomeId);
      childrenByParent.set(record.supersedesOutcomeId, children);
    }
  }

  for (const [recommendationId, roots] of rootsByRecommendation) {
    if (roots.length > 1) {
      issues.push(issue(
        "multiple_outcome_roots",
        recommendationId,
        `同一Recommendationに複数root Outcomeを作れません: ${roots.sort().join(", ")}`,
      ));
    }
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > 1) {
      issues.push(issue(
        "outcome_revision_fork",
        parentId,
        `Outcome revisionを分岐できません: ${children.sort().join(",")}`,
      ));
    }
  }

  for (const record of records) {
    if (!record.supersedesOutcomeId) continue;
    const prior = byId.get(record.supersedesOutcomeId);
    if (!prior) {
      issues.push(issue("missing_superseded_outcome", record.outcomeId, "supersedesOutcomeIdが見つかりません"));
      continue;
    }
    if (prior.recommendationId !== record.recommendationId
      || prior.recommendationContentHash !== record.recommendationContentHash) {
      issues.push(issue("outcome_revision_lineage_mismatch", record.outcomeId, "Outcome revisionでRecommendation lineageを変更できません"));
    }
    if (compareExplicitIso8601Instants(
      record.reviewedAt,
      prior.reviewedAt,
      `outcome:${record.outcomeId}.reviewedAt`,
      `outcome:${prior.outcomeId}.reviewedAt`,
    ) <= 0) {
      issues.push(issue("outcome_review_time_not_monotonic", record.outcomeId, "revision reviewedAtは直前Outcomeより後である必要があります"));
    }
    if (record.terminalTradingDate < prior.terminalTradingDate) {
      issues.push(issue("outcome_terminal_date_regressed", record.outcomeId, "revisionでterminalTradingDateを過去へ戻せません"));
    }
    if (prior.targetAssessment === "reached" && record.targetAssessment !== "reached") {
      issues.push(issue("target_assessment_regressed", record.outcomeId, "一度reachedになったtargetAssessmentを戻せません"));
    }
  }

  return issues.sort((left, right) =>
    `${left.code}|${left.target}|${left.message}`.localeCompare(`${right.code}|${right.target}|${right.message}`),
  );
}

export function parseQuantitativeOutcomeJsonl(
  content: string,
  path = "<memory>",
): QuantitativeOutcomeRecord[] {
  if (!content.trim()) return [];
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as QuantitativeOutcomeRecord;
      } catch (cause) {
        throw new Error(`${path}:${index + 1}: ${(cause as Error).message}`);
      }
    });
}

export function readQuantitativeOutcomeJsonl(path: string): QuantitativeOutcomeRecord[] {
  if (!existsSync(path)) return [];
  return parseQuantitativeOutcomeJsonl(readFileSync(path, "utf-8"), path);
}

export function appendQuantitativeOutcomeRecords(input: {
  path: string;
  incoming: QuantitativeOutcomeRecord[];
  schema: JsonSchema;
  context: QuantitativeOutcomeContext;
}): void {
  if (input.incoming.length === 0) return;
  const existing = readQuantitativeOutcomeJsonl(input.path);
  const errors = validateQuantitativeOutcomeRecords(
    [...existing, ...input.incoming],
    input.schema,
    input.context,
  ).filter((candidate) => candidate.severity === "error");
  if (errors.length > 0) {
    throw new Error(errors.map((candidate) => `${candidate.code} ${candidate.target}: ${candidate.message}`).join("\n"));
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