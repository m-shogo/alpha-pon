import assert from "node:assert/strict";
import type { ShockCalibrationObservation } from "../src/idiosyncratic-shock-calibration.js";
import type { ValidatedLocalShockThreshold } from "../src/idiosyncratic-shock-calibration-config.js";
import { auditValidatedLocalThresholdEvidence } from "../src/idiosyncratic-shock-calibration-registry-evidence.js";

const entry: ValidatedLocalShockThreshold = {
  id: "us-country-proof-v1",
  modelLevel: "country",
  country: "US",
  market: "US",
  scoreMethod: "global_structural",
  threshold: 13,
  trainFrom: "2018-01-01",
  trainThrough: "2023-12-31",
  validationFrom: "2024-01-01",
  validationThrough: "2025-12-31",
  trainCases: 22,
  validationCases: 8,
  validationDesign: "prospective_pre_outcome",
  benchmarkMetric: "calibrationSignalBenchmarkRelative3m",
  evidenceNote: "fixture",
};

function observation(input: {
  caseId: string;
  checkpoint: string;
  prospective?: boolean;
}): ShockCalibrationObservation {
  return {
    caseId: input.caseId,
    company: input.caseId,
    checkpoint: input.checkpoint,
    signalDate: input.checkpoint,
    market: "US",
    country: "US",
    jurisdictionGroup: "US",
    category: "executive_relationship",
    score: 11,
    benchmarkRelative1m: 1,
    benchmarkRelative3m: 3,
    benchmarkRelative1y: 5,
    selectionMode: input.prospective ? "prospective_pre_outcome" : "retrospective_research",
    validationHoldoutEligible: input.prospective ?? false,
  };
}

const research = Array.from({ length: 30 }, (_, index) => observation({
  caseId: `research-${index}`,
  checkpoint: `${2018 + Math.floor(index / 6)}-${String((index % 6) + 1).padStart(2, "0")}-15`,
}));
const prospective = Array.from({ length: 8 }, (_, index) => observation({
  caseId: `prospective-${index}`,
  checkpoint: `2024-${String(index + 1).padStart(2, "0")}-15`,
  prospective: true,
}));

const valid = auditValidatedLocalThresholdEvidence(entry, [...research, ...prospective]);
assert.deepEqual(valid.issues, []);
assert.equal(valid.researchObservationsInTrainWindow, 30);
assert.equal(valid.prospectiveObservationsInValidationWindow, 8);
assert.equal(valid.readinessStatus, "validated");

const futureProspective = prospective.map((row, index) => ({
  ...row,
  caseId: `future-${index}`,
  checkpoint: `2030-${String(index + 1).padStart(2, "0")}-15`,
  signalDate: `2030-${String(index + 1).padStart(2, "0")}-15`,
}));
const wrongWindow = auditValidatedLocalThresholdEvidence(entry, [...research, ...futureProspective]);
assert.equal(wrongWindow.prospectiveObservationsInValidationWindow, 0, "future prospective outcomes cannot validate an older registry window");
assert(wrongWindow.issues.some(value => value.includes("validation-window prospective outcomes 0")));
assert(wrongWindow.issues.some(value => value.includes("expected validated")));

const overstatedCases = auditValidatedLocalThresholdEvidence({ ...entry, validationCases: 10 }, [...research, ...prospective]);
assert.equal(overstatedCases.readinessStatus, "validated", "core minimum is 8, but registry may claim a larger evidence set");
assert(overstatedCases.issues.some(value => value.includes("< registry validationCases 10")), "registry cannot claim more validation evidence than exists");

const lateResearch = research.map((row, index) => ({
  ...row,
  caseId: `late-research-${index}`,
  checkpoint: `2030-${String((index % 12) + 1).padStart(2, "0")}-15`,
  signalDate: `2030-${String((index % 12) + 1).padStart(2, "0")}-15`,
}));
const wrongTrainWindow = auditValidatedLocalThresholdEvidence(entry, [...lateResearch, ...prospective]);
assert.equal(wrongTrainWindow.researchObservationsInTrainWindow, 0, "later retrospective cases cannot silently backfill an older train claim");
assert(wrongTrainWindow.issues.some(value => value.includes("train-window research outcomes 0")));

console.log("idiosyncratic-shock calibration registry evidence tests: declared windows/counts verified");
