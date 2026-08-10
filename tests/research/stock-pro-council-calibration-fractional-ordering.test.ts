import assert from "node:assert/strict";
import {
  validatePersonaCalibrationLedger,
  validatePersonaCalibrationRecord,
  validateVerdictCalibrationReferences,
  withPersonaCalibrationHash,
  type PersonaCalibrationRecord,
  type PersonaCalibrationRecordInput,
} from "../../src/research/stock-pro-council-calibration.js";
import {
  loadCouncilSchema,
  loadCouncilYaml,
  STOCK_PRO_COUNCIL_V2_PATHS,
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "../../src/research/stock-pro-council-v2-validation.js";

const catalog = loadCouncilYaml(
  STOCK_PRO_COUNCIL_V2_PATHS.catalog,
) as StockProCouncilV2Catalog;
const schema = loadCouncilSchema(
  "research/schemas/persona-calibration-record.schema.json",
);

function calibration(
  overrides: Partial<PersonaCalibrationRecordInput> = {},
): PersonaCalibrationRecord {
  return withPersonaCalibrationHash({
    schemaVersion: 1,
    calibrationId: "calibration:fractional:001",
    personaId: "jp_event_driven_pm",
    personaVersion: "2",
    jurisdiction: "event_state_transition",
    metric: "event_classification_accuracy",
    segment: { sector: "all", regime: "mixed", horizon: "D+1" },
    periodFrom: "2024-01-01",
    periodTo: "2026-07-31",
    outcomeCutoff: "2026-08-01T00:00:00.000000001+09:00",
    evaluatedAt: "2026-08-02T00:00:00.000000001+09:00",
    sampleSize: 30,
    minimumSampleSize: 30,
    normalizedScore: 0.7,
    confidenceInterval: { low: 0.55, high: 0.82 },
    status: "eligible",
    eligibleForConfidence: true,
    confidenceCap: 0.75,
    previousWeightMultiplier: 1,
    recommendedWeightMultiplier: 1.05,
    maxWeightStep: 0.05,
    humanApprovalRequired: true,
    automaticWeightApplicationAuthorized: false,
    evidenceRefs: ["calibration-evidence:fractional:001"],
    modelVersion: "fixture-model-v1",
    ruleVersion: "calibration-rule-v1",
    ...overrides,
  });
}

function verdict(overrides: Partial<PersonaVerdict> = {}): PersonaVerdict {
  return {
    schemaVersion: 1,
    personaId: "jp_event_driven_pm",
    personaVersion: "2",
    runId: "council-run:fractional",
    issuedAt: "2026-08-06T00:30:00.000000001+09:00",
    informationCutoff: "2026-08-06T00:25:00.000000001+09:00",
    jurisdiction: "event_state_transition",
    stance: "support",
    decisionView: "WATCH",
    confidence: 0.7,
    calibrationRef: "calibration:fractional:future",
    evidenceRefs: ["evidence:fractional:001"],
    facts: ["synthetic fact"],
    assumptions: ["synthetic assumption"],
    forecasts: ["synthetic forecast"],
    risks: ["synthetic risk"],
    missingEvidence: [],
    vetoCodes: [],
    falsificationConditions: ["synthetic falsification"],
    nextEvidenceActions: ["synthetic next action"],
    modelVersion: "fixture-model-v1",
    ...overrides,
  };
}

const evaluatedTooEarly = calibration({
  calibrationId: "calibration:fractional:record",
  outcomeCutoff: "2026-08-02T00:00:00.000000002+09:00",
  evaluatedAt: "2026-08-02T00:00:00.000000001+09:00",
});
assert.ok(
  validatePersonaCalibrationRecord(evaluatedTooEarly, schema, catalog)
    .some((candidate) => candidate.code === "evaluated_before_outcome_cutoff"),
  "同一millisecond内でもoutcomeCutoffより1ns早いevaluatedAtをfail-closedにする",
);

const base = calibration({
  calibrationId: "calibration:fractional:base",
  evaluatedAt: "2026-08-02T00:00:00.000000002+09:00",
});
const revision = calibration({
  calibrationId: "calibration:fractional:revision",
  evaluatedAt: "2026-08-02T00:00:00.000000001+09:00",
  supersedesCalibrationId: base.calibrationId,
});
assert.ok(
  validatePersonaCalibrationLedger([base, revision], schema, catalog)
    .some((candidate) => candidate.code === "calibration_revision_time_not_monotonic"),
  "同一millisecond内の1ns revision逆行をfail-closedにする",
);

const future = calibration({
  calibrationId: "calibration:fractional:future",
  periodTo: "2026-08-05",
  outcomeCutoff: "2026-08-06T00:25:00.000000002+09:00",
  evaluatedAt: "2026-08-06T00:30:00.000000002+09:00",
});
const referenceIssues = validateVerdictCalibrationReferences([verdict()], [future]);
assert.ok(
  referenceIssues.some((candidate) => candidate.code === "future_calibration_reference"),
  "Verdict issuedAtより1ns未来のcalibrationをfail-closedにする",
);
assert.ok(
  referenceIssues.some((candidate) => candidate.code === "calibration_outcome_after_verdict_cutoff"),
  "Verdict informationCutoffより1ns未来のoutcomeをfail-closedにする",
);

console.log("stock-pro-council-calibration: fractional PIT ordering OK");
