import assert from "node:assert/strict";
import { labelShockScore, type HistoricalShockCase } from "../src/idiosyncratic-shock.js";
import {
  resolveHistoricalStrategyEligibilityDetailed,
  resolveHistoricalThresholdCalibrationEligibilityDetailed,
  type HistoricalShockCaseContext,
} from "../src/idiosyncratic-shock-case-context.js";

const lowScoreCase: HistoricalShockCase = {
  id: "fixture-low-score-calibration",
  company: "Fixture Low Score",
  ticker: "9999",
  country: "JP",
  eventDate: "2026-01-05",
  decisionCheckpoint: "2026-01-06",
  category: "personal_behavior",
  actorType: "executive",
  eventSummary: "fixture",
  macroPrimaryCause: false,
  evidenceStatus: "confirmed",
  priceStateAtCheckpoint: "stabilizing",
  scores: {
    businessImpactContainment: 1,
    accountingIntegrity: 2,
    actorSeparability: 1,
    organizationalContainment: 1,
    regulatoryContainment: 1,
    brandResilience: 1,
    managementContinuity: 1,
    fundamentalResilience: 1,
    discountMagnitude: 1,
    priceStabilization: 1,
  },
  score: 11,
  label: labelShockScore(11),
  scoringNotes: {},
  sources: [{ title: "fixture issuer", url: "https://example.com/ir/shock", sourceType: "company" }],
  researchConfidence: "high",
};

const calibrationPassContext: HistoricalShockCaseContext = {
  strategyEligibilityAtCheckpoint: "confirmed_block",
  calibrationEligibilityAtCheckpoint: "confirmed_pass",
  calibrationEligibilityNotes: "score thresholdだけを外したshadow研究では他hard gateを通過",
  strategyInvestigationStatusAtCheckpoint: "substantially_complete",
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
  confounderStatus: "clear",
};

const production = resolveHistoricalStrategyEligibilityDetailed(lowScoreCase, calibrationPassContext);
assert.equal(production.status, "confirmed_block", "production must keep score>=12 gate");
assert(production.blockers.includes("score=11<12"));

const shadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(lowScoreCase, calibrationPassContext);
assert.equal(shadow.status, "confirmed_pass", "threshold calibration may replay score<12 after explicit structured review");
assert.equal(shadow.blockers.length, 0);
assert.equal(shadow.missingEvidence.length, 0);

const noCalibrationAnnotation: HistoricalShockCaseContext = {
  strategyEligibilityAtCheckpoint: "confirmed_block",
  strategyInvestigationStatusAtCheckpoint: "substantially_complete",
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
  confounderStatus: "clear",
};
const unknownShadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(lowScoreCase, noCalibrationAnnotation);
assert.equal(unknownShadow.status, "unknown", "low-score production block must not be guessed as shadow pass/block");
assert(unknownShadow.missingEvidence.includes("calibration eligibility pass/block not verified"));

const inheritedPassContext: HistoricalShockCaseContext = {
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  strategyInvestigationStatusAtCheckpoint: "substantially_complete",
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
  confounderStatus: "clear",
};
assert.equal(
  resolveHistoricalThresholdCalibrationEligibilityDetailed(lowScoreCase, inheritedPassContext).status,
  "confirmed_pass",
  "an explicitly reviewed production pass may be reused by threshold calibration once score gate is removed",
);

const accountingCase: HistoricalShockCase = {
  ...lowScoreCase,
  id: "fixture-accounting-shadow-block",
  scores: { ...lowScoreCase.scores, accountingIntegrity: 0 },
};
const accountingShadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(accountingCase, calibrationPassContext);
assert.equal(accountingShadow.status, "confirmed_block");
assert(accountingShadow.blockers.includes("accountingIntegrity=0"), "accounting hard gate must remain in shadow calibration");

const macroCase: HistoricalShockCase = {
  ...lowScoreCase,
  id: "fixture-macro-shadow-block",
  macroPrimaryCause: true,
};
const macroShadow = resolveHistoricalThresholdCalibrationEligibilityDetailed(macroCase, calibrationPassContext);
assert.equal(macroShadow.status, "confirmed_block");
assert(macroShadow.blockers.includes("macroPrimaryCause=true"));

const openInvestigation = resolveHistoricalThresholdCalibrationEligibilityDetailed(lowScoreCase, {
  ...calibrationPassContext,
  strategyInvestigationStatusAtCheckpoint: "open",
});
assert.equal(openInvestigation.status, "confirmed_block");
assert(openInvestigation.blockers.includes("investigationStatus=open"));

const highScoreBlocked: HistoricalShockCase = {
  ...lowScoreCase,
  id: "fixture-high-score-explicit-block",
  score: 16,
  label: labelShockScore(16),
};
const highScoreBlockedContext: HistoricalShockCaseContext = {
  ...inheritedPassContext,
  strategyEligibilityAtCheckpoint: "confirmed_block",
};
assert.equal(
  resolveHistoricalThresholdCalibrationEligibilityDetailed(highScoreBlocked, highScoreBlockedContext).status,
  "confirmed_block",
  "score>=12 explicit production block is not threshold-derived and must carry into calibration",
);

console.log("idiosyncratic-shock threshold-calibration eligibility tests: OK");
