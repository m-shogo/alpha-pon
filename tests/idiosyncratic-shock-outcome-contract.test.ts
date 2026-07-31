import assert from "node:assert/strict";
import {
  SHOCK_OUTCOME_DATASET_VERSION,
  SHOCK_OUTCOME_METHODOLOGY,
  assertShockOutcomeDatasetContract,
  assertShockOutcomeRecordContract,
} from "../src/idiosyncratic-shock-outcome-contract.js";
import type { ShockHistoricalOutcomeRecord } from "../src/idiosyncratic-shock-outcomes.js";

const valid: ShockHistoricalOutcomeRecord = {
  caseId: "fixture-contract",
  company: "Fixture",
  code: "9999",
  market: "JP",
  benchmark: "TOPIX",
  eventDate: "2020-01-01",
  reactionStartDate: "2020-01-02",
  reactionAnchorStatus: "verified",
  reactionAnchorTradingDayObserved: true,
  checkpoint: "2020-01-02",
  score: 13,
  label: "watch",
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
  baseDate: "2020-01-02",
  basePrice: 90,
  preEventDate: "2019-12-31",
  preEventPrice: 100,
  shockLowDate: "2020-01-02",
  shockLowPrice: 90,
  shockDrawdownPct: -10,
  return1w: null,
  return1m: null,
  return3m: null,
  return1y: null,
  benchmarkRelative1w: null,
  benchmarkRelative1m: null,
  benchmarkRelative3m: null,
  benchmarkRelative1y: null,
  firstEligibleSignalDate: "2020-01-03",
  firstEligibleSignalPrice: 91,
  signalShockDrawdownPct: -9,
  signalRelativeShockDrawdownPct: -5,
  signalReturn1w: null,
  signalReturn1m: null,
  signalReturn3m: null,
  signalReturn1y: null,
  signalBenchmarkRelative1w: null,
  signalBenchmarkRelative1m: null,
  signalBenchmarkRelative3m: null,
  signalBenchmarkRelative1y: null,
  calibrationFirstEligibleSignalDate: "2020-01-03",
  calibrationFirstEligibleSignalPrice: 91,
  calibrationSignalShockDrawdownPct: -9,
  calibrationSignalRelativeShockDrawdownPct: -5,
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

assert.doesNotThrow(() => assertShockOutcomeRecordContract(valid));
assert.doesNotThrow(() => assertShockOutcomeDatasetContract({
  version: SHOCK_OUTCOME_DATASET_VERSION,
  generatedAt: "2026-07-31",
  researchSnapshotSha256: "a".repeat(64),
  methodology: SHOCK_OUTCOME_METHODOLOGY,
  providers: [],
  records: [valid],
  calibration: [],
  calibrationByMarket: {},
  failures: [],
}));

assert.throws(
  () => assertShockOutcomeRecordContract({ ...valid, score: 11 }),
  /production confirmed_pass below threshold/,
  "production PASS cannot drift below threshold while threshold=12 is active",
);

assert.throws(
  () => assertShockOutcomeRecordContract({ ...valid, reactionAnchorTradingDayObserved: false }),
  /verified reaction anchor requires/,
  "evidence-only anchor verification is insufficient",
);

assert.throws(
  () => assertShockOutcomeRecordContract({
    ...valid,
    firstEligibleSignalDate: null,
    firstEligibleSignalPrice: null,
    signalShockDrawdownPct: null,
    signalRelativeShockDrawdownPct: null,
    signalReturn1w: null,
    signalReturn1m: null,
    signalReturn3m: 0,
    signalReturn1y: null,
    signalBenchmarkRelative1w: null,
    signalBenchmarkRelative1m: null,
    signalBenchmarkRelative3m: null,
    signalBenchmarkRelative1y: null,
  }),
  /production signal absent but signalReturn3m is populated/,
  "no-signal must never be encoded as a zero return",
);

assert.throws(
  () => assertShockOutcomeRecordContract({
    ...valid,
    thresholdCalibrationEligibilityAtCheckpoint: "confirmed_block",
  }),
  /calibration signal requires confirmed_pass/,
);

console.log("idiosyncratic-shock outcome contract tests: OK");
