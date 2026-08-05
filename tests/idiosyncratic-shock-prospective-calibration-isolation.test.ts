import assert from "node:assert/strict";
import { calibrateShockThresholds, type ShockHistoricalOutcomeRecord } from "../src/idiosyncratic-shock-outcomes.js";
import type { ShockCaseSelectionRecord } from "../src/idiosyncratic-shock-case-selection.js";

const record: ShockHistoricalOutcomeRecord = {
  caseId: "future-holdout",
  company: "Future Holdout",
  code: "TEST",
  market: "US",
  benchmark: "S&P 500",
  eventDate: "2030-01-01",
  reactionStartDate: "2030-01-02",
  reactionAnchorStatus: "verified",
  reactionAnchorTradingDayObserved: true,
  checkpoint: "2030-01-02",
  score: 11,
  label: "caution",
  strategyEligibilityAtCheckpoint: "confirmed_block",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
  baseDate: "2030-01-02",
  basePrice: 80,
  preEventDate: "2029-12-31",
  preEventPrice: 100,
  shockLowDate: "2030-01-02",
  shockLowPrice: 80,
  shockDrawdownPct: -20,
  return1w: 2,
  return1m: 3,
  return3m: 9,
  return1y: 15,
  benchmarkRelative1w: 1,
  benchmarkRelative1m: 2,
  benchmarkRelative3m: 7,
  benchmarkRelative1y: 10,
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
  calibrationFirstEligibleSignalDate: "2030-01-03",
  calibrationFirstEligibleSignalPrice: 81,
  calibrationSignalShockDrawdownPct: -19,
  calibrationSignalRelativeShockDrawdownPct: -12,
  calibrationSignalReturn1w: 4,
  calibrationSignalReturn1m: 5,
  calibrationSignalReturn3m: 12,
  calibrationSignalReturn1y: 18,
  calibrationSignalBenchmarkRelative1w: 2,
  calibrationSignalBenchmarkRelative1m: 3,
  calibrationSignalBenchmarkRelative3m: 10,
  calibrationSignalBenchmarkRelative1y: 12,
  topixRelative1w: null,
  topixRelative1m: null,
  topixRelative3m: null,
  topixRelative1y: null,
  generatedAt: "2031-01-10",
};

const selection: ShockCaseSelectionRecord = {
  registeredAt: "2030-01-02",
  decisionCheckpointAtRegistration: "2030-01-02",
  selectionMode: "prospective_pre_outcome",
  outcomeVisibilityAtSelection: "not_observed",
  selectionReason: "registered before the future three-month outcome was observed",
  notes: null,
};
const selections = new Map([[record.caseId, selection]]);

const research = calibrateShockThresholds([record], { selections });
assert.equal(research.find(row => row.bucket === "score_lt_12")?.eligibleCases, 0, "prospective holdout cannot leak into default research calibration");
assert.equal(research.find(row => row.bucket === "score_lt_12")?.cases, 0);

const prospective = calibrateShockThresholds([record], { scope: "prospective", selections });
assert.equal(prospective.find(row => row.bucket === "score_lt_12")?.eligibleCases, 1, "holdout can be evaluated explicitly without becoming fitting data");
assert.equal(prospective.find(row => row.bucket === "score_lt_12")?.cases, 1);
assert.equal(prospective.find(row => row.bucket === "score_lt_12")?.avgBenchmarkRelative3m, 10);

const all = calibrateShockThresholds([record], { scope: "all", selections });
assert.equal(all.find(row => row.bucket === "score_lt_12")?.eligibleCases, 1, "all scope is descriptive only and must be explicit");

const lateSelection: ShockCaseSelectionRecord = {
  ...selection,
  registeredAt: "2030-01-03",
  decisionCheckpointAtRegistration: "2030-01-03",
};
const lateResearch = calibrateShockThresholds([record], { selections: new Map([[record.caseId, lateSelection]]) });
assert.equal(lateResearch.find(row => row.bucket === "score_lt_12")?.eligibleCases, 0, "late/frozen-mismatch selection must fail closed into research scope until case-selection audit rejects it");

console.log("idiosyncratic-shock prospective calibration isolation tests: holdout excluded by default");
