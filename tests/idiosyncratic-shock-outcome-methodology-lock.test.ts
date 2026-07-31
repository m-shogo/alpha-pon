import assert from "node:assert/strict";
import {
  SHOCK_OUTCOME_METHODOLOGY,
  assertShockOutcomeDatasetContract,
  type ShockOutcomeDatasetEnvelope,
} from "../src/idiosyncratic-shock-outcome-contract.js";
import type { ShockHistoricalOutcomeRecord } from "../src/idiosyncratic-shock-outcomes.js";

const record: ShockHistoricalOutcomeRecord = {
  caseId: "method-lock",
  company: "Method Lock",
  code: "TEST",
  market: "US",
  benchmark: "S&P 500",
  eventDate: "2025-01-02",
  reactionStartDate: "2025-01-02",
  reactionAnchorStatus: "verified",
  reactionAnchorTradingDayObserved: true,
  checkpoint: "2025-01-02",
  score: 12,
  label: "watch",
  strategyEligibilityAtCheckpoint: "confirmed_block",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_block",
  baseDate: "2025-01-02",
  basePrice: 100,
  preEventDate: "2024-12-31",
  preEventPrice: 110,
  shockLowDate: "2025-01-02",
  shockLowPrice: 100,
  shockDrawdownPct: -9.0909,
  return1w: null,
  return1m: null,
  return3m: null,
  return1y: null,
  benchmarkRelative1w: null,
  benchmarkRelative1m: null,
  benchmarkRelative3m: null,
  benchmarkRelative1y: null,
  firstEligibleSignalDate: null,
  firstEligibleSignalPrice: null,
  signalShockDrawdownPct: null,
  signalRelativeShockDrawdownPct: null,
  signalReturn1w: null,
  signalReturn1m: null,
  signalReturn3m: null,
  signalReturn1y: null,
  signalBenchmarkRelative1w: null,
  signalBenchmarkRelative1m: null,
  signalBenchmarkRelative3m: null,
  signalBenchmarkRelative1y: null,
  calibrationFirstEligibleSignalDate: null,
  calibrationFirstEligibleSignalPrice: null,
  calibrationSignalShockDrawdownPct: null,
  calibrationSignalRelativeShockDrawdownPct: null,
  calibrationSignalReturn1w: null,
  calibrationSignalReturn1m: null,
  calibrationSignalReturn3m: null,
  calibrationSignalReturn1y: null,
  calibrationSignalBenchmarkRelative1w: null,
  calibrationSignalBenchmarkRelative1m: null,
  calibrationSignalBenchmarkRelative3m: null,
  calibrationSignalBenchmarkRelative1y: null,
  topixRelative1w: null,
  topixRelative1m: null,
  topixRelative3m: null,
  topixRelative1y: null,
  generatedAt: "2026-07-31",
};

const envelope: ShockOutcomeDatasetEnvelope = {
  version: 1,
  generatedAt: "2026-07-31",
  researchSnapshotSha256: "a".repeat(64),
  methodology: SHOCK_OUTCOME_METHODOLOGY,
  providers: [],
  records: [record],
  calibration: {},
  calibrationByMarket: {},
  failures: [],
};
assert.doesNotThrow(() => assertShockOutcomeDatasetContract(envelope));

const changedMethodology = {
  ...envelope,
  methodology: {
    ...SHOCK_OUTCOME_METHODOLOGY,
    horizonRule: "exact_calendar_day_close",
  },
} as unknown as ShockOutcomeDatasetEnvelope;
assert.throws(
  () => assertShockOutcomeDatasetContract(changedMethodology),
  /methodology must exactly match/,
  "same methodVersion cannot hide a changed horizon rule",
);

const mixedGenerationDate = {
  ...envelope,
  records: [{ ...record, generatedAt: "2026-07-30" }],
};
assert.throws(
  () => assertShockOutcomeDatasetContract(mixedGenerationDate),
  /must match dataset generatedAt/,
  "one dataset cannot silently mix records generated under different runs",
);

const badFailures = { ...envelope, failures: [123] } as unknown as ShockOutcomeDatasetEnvelope;
assert.throws(() => assertShockOutcomeDatasetContract(badFailures), /failures must be a string array/);

console.log("idiosyncratic-shock outcome methodology lock tests: exact runtime methodology + single-run generation enforced");
