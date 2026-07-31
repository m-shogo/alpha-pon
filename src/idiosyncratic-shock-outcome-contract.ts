// Quantitative outcome datasetの意味を固定する契約。
// 数字を見た後にentry basis / horizon / benchmark-relative定義を差し替える研究者自由度を減らす。

import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

export const SHOCK_OUTCOME_DATASET_VERSION = 1 as const;
export const SHOCK_OUTCOME_METHOD_VERSION = "shock-outcome-v1" as const;
export const SHOCK_PRODUCTION_THRESHOLD = 12 as const;

export const SHOCK_OUTCOME_METHODOLOGY = {
  methodVersion: SHOCK_OUTCOME_METHOD_VERSION,
  priceField: "adjusted_close",
  signalEntryPrice: "adjusted_close_on_signal_session",
  horizonRule: "first_trading_session_on_or_after_calendar_day_horizon",
  horizonsCalendarDays: [7, 30, 90, 365],
  benchmarkRelativeFormula: "stock_return_pct_minus_benchmark_return_pct",
  reactionAnchorRule: "evidence_verified_and_stock_and_benchmark_quote_on_exact_reaction_date",
  productionThreshold: SHOCK_PRODUCTION_THRESHOLD,
  thresholdCalibrationRule: "remove_score_gate_only_preserve_all_other_fail_closed_gates",
  noSignalRule: "include_in_signal_rate_denominator_exclude_from_return_statistics",
  prospectiveHoldoutRule: "exclude_from_default_calibration_and_threshold_fitting_evaluate_only_explicit_prospective_scope",
} as const;

export type ShockOutcomeDatasetEnvelope = {
  version: typeof SHOCK_OUTCOME_DATASET_VERSION;
  generatedAt: string;
  researchSnapshotSha256: string;
  methodology: typeof SHOCK_OUTCOME_METHODOLOGY;
  providers: unknown[];
  records: ShockHistoricalOutcomeRecord[];
  calibration: unknown;
  calibrationByMarket: unknown;
  failures: string[];
};

const PRODUCTION_SIGNAL_FIELDS: Array<keyof ShockHistoricalOutcomeRecord> = [
  "firstEligibleSignalPrice",
  "signalShockDrawdownPct",
  "signalRelativeShockDrawdownPct",
  "signalReturn1w",
  "signalReturn1m",
  "signalReturn3m",
  "signalReturn1y",
  "signalBenchmarkRelative1w",
  "signalBenchmarkRelative1m",
  "signalBenchmarkRelative3m",
  "signalBenchmarkRelative1y",
];

const CALIBRATION_SIGNAL_FIELDS: Array<keyof ShockHistoricalOutcomeRecord> = [
  "calibrationFirstEligibleSignalPrice",
  "calibrationSignalShockDrawdownPct",
  "calibrationSignalRelativeShockDrawdownPct",
  "calibrationSignalReturn1w",
  "calibrationSignalReturn1m",
  "calibrationSignalReturn3m",
  "calibrationSignalReturn1y",
  "calibrationSignalBenchmarkRelative1w",
  "calibrationSignalBenchmarkRelative1m",
  "calibrationSignalBenchmarkRelative3m",
  "calibrationSignalBenchmarkRelative1y",
];

function assertDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be YYYY-MM-DD`);
}

function assertNullishSignalFields(record: ShockHistoricalOutcomeRecord, fields: Array<keyof ShockHistoricalOutcomeRecord>, label: string): void {
  for (const field of fields) {
    if (record[field] != null) throw new Error(`${record.caseId}: ${label} absent but ${String(field)} is populated`);
  }
}

export function assertShockOutcomeRecordContract(record: ShockHistoricalOutcomeRecord): void {
  assertDate(record.eventDate, `${record.caseId}.eventDate`);
  assertDate(record.reactionStartDate, `${record.caseId}.reactionStartDate`);
  assertDate(record.checkpoint, `${record.caseId}.checkpoint`);
  assertDate(record.generatedAt, `${record.caseId}.generatedAt`);

  if (record.reactionAnchorStatus === "verified" && !record.reactionAnchorTradingDayObserved) {
    throw new Error(`${record.caseId}: verified reaction anchor requires stock+benchmark quote on exact date`);
  }
  if (!record.reactionAnchorTradingDayObserved && record.reactionAnchorStatus !== "unverified") {
    throw new Error(`${record.caseId}: missing reaction trading session must be unverified`);
  }
  if (record.strategyEligibilityAtCheckpoint === "confirmed_pass" && record.score < SHOCK_PRODUCTION_THRESHOLD) {
    throw new Error(`${record.caseId}: production confirmed_pass below threshold=${SHOCK_PRODUCTION_THRESHOLD}`);
  }

  if (record.firstEligibleSignalDate) {
    assertDate(record.firstEligibleSignalDate, `${record.caseId}.firstEligibleSignalDate`);
    if (record.strategyEligibilityAtCheckpoint !== "confirmed_pass") throw new Error(`${record.caseId}: production signal requires confirmed_pass`);
    if (record.reactionAnchorStatus !== "verified") throw new Error(`${record.caseId}: production signal requires verified reaction anchor`);
    if (record.firstEligibleSignalDate < record.checkpoint || record.firstEligibleSignalDate < record.reactionStartDate) {
      throw new Error(`${record.caseId}: production signal precedes checkpoint/reaction date`);
    }
    if (record.firstEligibleSignalPrice == null || !Number.isFinite(record.firstEligibleSignalPrice) || record.firstEligibleSignalPrice <= 0) {
      throw new Error(`${record.caseId}: production signal price must be positive`);
    }
  } else {
    assertNullishSignalFields(record, PRODUCTION_SIGNAL_FIELDS, "production signal");
  }

  if (record.calibrationFirstEligibleSignalDate) {
    assertDate(record.calibrationFirstEligibleSignalDate, `${record.caseId}.calibrationFirstEligibleSignalDate`);
    if (record.thresholdCalibrationEligibilityAtCheckpoint !== "confirmed_pass") throw new Error(`${record.caseId}: calibration signal requires confirmed_pass`);
    if (record.reactionAnchorStatus !== "verified") throw new Error(`${record.caseId}: calibration signal requires verified reaction anchor`);
    if (record.calibrationFirstEligibleSignalDate < record.checkpoint || record.calibrationFirstEligibleSignalDate < record.reactionStartDate) {
      throw new Error(`${record.caseId}: calibration signal precedes checkpoint/reaction date`);
    }
    if (record.calibrationFirstEligibleSignalPrice == null || !Number.isFinite(record.calibrationFirstEligibleSignalPrice) || record.calibrationFirstEligibleSignalPrice <= 0) {
      throw new Error(`${record.caseId}: calibration signal price must be positive`);
    }
  } else {
    assertNullishSignalFields(record, CALIBRATION_SIGNAL_FIELDS, "calibration signal");
  }
}

export function assertShockOutcomeDatasetContract(payload: ShockOutcomeDatasetEnvelope): void {
  if (payload.version !== SHOCK_OUTCOME_DATASET_VERSION) throw new Error(`shock outcome dataset version must be ${SHOCK_OUTCOME_DATASET_VERSION}`);
  assertDate(payload.generatedAt, "shock outcome generatedAt");
  if (!/^[a-f0-9]{64}$/.test(payload.researchSnapshotSha256)) throw new Error("shock outcome researchSnapshotSha256 must be sha256 hex");
  if (payload.methodology.methodVersion !== SHOCK_OUTCOME_METHOD_VERSION) throw new Error("shock outcome methodology version mismatch");
  if (payload.methodology.productionThreshold !== SHOCK_PRODUCTION_THRESHOLD) throw new Error("shock outcome production threshold mismatch");
  if (payload.methodology.prospectiveHoldoutRule !== "exclude_from_default_calibration_and_threshold_fitting_evaluate_only_explicit_prospective_scope") {
    throw new Error("shock outcome prospective holdout rule mismatch");
  }
  const ids = new Set<string>();
  for (const record of payload.records) {
    if (ids.has(record.caseId)) throw new Error(`duplicate shock outcome caseId: ${record.caseId}`);
    ids.add(record.caseId);
    assertShockOutcomeRecordContract(record);
  }
}
