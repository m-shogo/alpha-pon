import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPersonaCalibrationRecords,
  requiredMinimumSample,
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
  type PersonaVerdict,
  type StockProCouncilV2Catalog,
} from "../../src/research/stock-pro-council-v2-validation.js";

const catalog = loadCouncilYaml(
  "research/personas/stock-pro-council-v2.yml",
) as StockProCouncilV2Catalog;
const schema = loadCouncilSchema(
  "research/schemas/persona-calibration-record.schema.json",
);

function calibration(
  overrides: Partial<PersonaCalibrationRecordInput> = {},
): PersonaCalibrationRecord {
  return withPersonaCalibrationHash({
    schemaVersion: 1,
    calibrationId: "calibration-event-001",
    personaId: "jp_event_driven_pm",
    personaVersion: "2",
    jurisdiction: "event_state_transition",
    metric: "event_classification_accuracy",
    segment: {
      sector: "all",
      regime: "mixed",
      horizon: "D+1",
    },
    periodFrom: "2024-01-01",
    periodTo: "2026-07-31",
    outcomeCutoff: "2026-08-01T00:00:00+09:00",
    evaluatedAt: "2026-08-02T00:00:00+09:00",
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
    evidenceRefs: ["calibration-evidence:event:001"],
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
    runId: "council-run-calibration",
    issuedAt: "2026-08-06T00:30:00+09:00",
    informationCutoff: "2026-08-06T00:25:00+09:00",
    jurisdiction: "event_state_transition",
    stance: "support",
    decisionView: "WATCH",
    confidence: 0.7,
    calibrationRef: "calibration-event-001",
    evidenceRefs: ["evidence:event:calibration"],
    facts: ["event fact"],
    assumptions: ["event assumption"],
    forecasts: ["event forecast"],
    risks: ["event risk"],
    missingEvidence: [],
    vetoCodes: [],
    falsificationConditions: ["event falsification"],
    nextEvidenceActions: ["event next evidence"],
    modelVersion: "fixture-model-v1",
    ...overrides,
  };
}

{
  const valid = calibration();
  assert.deepEqual(
    validatePersonaCalibrationRecord(valid, schema, catalog)
      .filter((issue) => issue.severity === "error"),
    [],
  );
  assert.equal(requiredMinimumSample("calibration_error"), 50);
  assert.equal(requiredMinimumSample("out_of_sample_net_alpha"), 40);
  assert.equal(requiredMinimumSample("event_classification_accuracy"), 30);
  console.log("stock-pro-council-calibration: eligible record/minimum policy OK");
}

{
  const insufficient = calibration({ sampleSize: 20 });
  assert.ok(validatePersonaCalibrationRecord(insufficient, schema, catalog)
    .some((issue) => issue.code === "insufficient_calibration_sample"));

  const provisional = calibration({
    calibrationId: "calibration-event-provisional",
    sampleSize: 20,
    status: "provisional",
    eligibleForConfidence: false,
    confidenceCap: undefined,
    recommendedWeightMultiplier: 1,
  });
  assert.equal(validatePersonaCalibrationRecord(provisional, schema, catalog)
    .some((issue) => issue.severity === "error"), false);

  const unregistered = calibration({ metric: "made_up_metric" });
  assert.ok(validatePersonaCalibrationRecord(unregistered, schema, catalog)
    .some((issue) => issue.code === "unregistered_calibration_metric"));
  console.log("stock-pro-council-calibration: sample/metric gates OK");
}

{
  const excessiveWeight = calibration({ recommendedWeightMultiplier: 1.1 });
  assert.ok(validatePersonaCalibrationRecord(excessiveWeight, schema, catalog)
    .some((issue) => issue.code === "calibration_weight_step_exceeded"));

  const badInterval = calibration({ confidenceInterval: { low: 0.8, high: 0.9 } });
  assert.ok(validatePersonaCalibrationRecord(badInterval, schema, catalog)
    .some((issue) => issue.code === "invalid_confidence_interval"));

  const tampered = { ...calibration(), normalizedScore: 0.1 };
  assert.ok(validatePersonaCalibrationRecord(tampered, schema, catalog)
    .some((issue) => issue.code === "invalid_content_hash"));
  console.log("stock-pro-council-calibration: weight/interval/hash guards OK");
}

{
  const base = calibration();
  const revision = calibration({
    calibrationId: "calibration-event-002",
    evaluatedAt: "2026-08-04T00:00:00+09:00",
    outcomeCutoff: "2026-08-03T00:00:00+09:00",
    periodTo: "2026-08-02",
    sampleSize: 35,
    supersedesCalibrationId: base.calibrationId,
  });
  assert.deepEqual(
    validatePersonaCalibrationLedger([base, revision], schema, catalog)
      .filter((issue) => issue.severity === "error"),
    [],
  );

  const identityChange = calibration({
    calibrationId: "calibration-event-003",
    evaluatedAt: "2026-08-04T00:00:00+09:00",
    outcomeCutoff: "2026-08-03T00:00:00+09:00",
    periodTo: "2026-08-02",
    sampleSize: 35,
    segment: { sector: "technology", regime: "mixed", horizon: "D+1" },
    supersedesCalibrationId: base.calibrationId,
  });
  assert.ok(validatePersonaCalibrationLedger([base, identityChange], schema, catalog)
    .some((issue) => issue.code === "calibration_revision_identity_mismatch"));
  console.log("stock-pro-council-calibration: append-only revision guards OK");
}

{
  const eligible = calibration();
  assert.deepEqual(validateVerdictCalibrationReferences([verdict()], [eligible]), []);

  assert.ok(validateVerdictCalibrationReferences(
    [verdict({ calibrationRef: "missing-calibration" })],
    [eligible],
  ).some((issue) => issue.code === "missing_calibration_reference"));

  assert.ok(validateVerdictCalibrationReferences(
    [verdict({ confidence: 0.9 })],
    [eligible],
  ).some((issue) => issue.code === "confidence_exceeds_calibrated_cap"));

  const provisional = calibration({
    calibrationId: "calibration-event-provisional",
    sampleSize: 20,
    status: "provisional",
    eligibleForConfidence: false,
    confidenceCap: undefined,
    recommendedWeightMultiplier: 1,
  });
  assert.ok(validateVerdictCalibrationReferences(
    [verdict({ calibrationRef: provisional.calibrationId })],
    [provisional],
  ).some((issue) => issue.code === "ineligible_calibration_reference"));

  const future = calibration({
    calibrationId: "calibration-event-future",
    outcomeCutoff: "2026-08-05T00:00:00+09:00",
    evaluatedAt: "2026-08-07T00:00:00+09:00",
    periodTo: "2026-08-04",
  });
  assert.ok(validateVerdictCalibrationReferences(
    [verdict({ calibrationRef: future.calibrationId })],
    [future],
  ).some((issue) => issue.code === "future_calibration_reference"));
  console.log("stock-pro-council-calibration: confidence reference/PIT guards OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "persona-calibration-"));
  const path = join(dir, "calibrations.jsonl");
  try {
    appendPersonaCalibrationRecords(path, [calibration()], "calibration-owner", schema, catalog);
    assert.equal(readFileSync(path, "utf-8").trim().split("\n").length, 1);
    assert.throws(
      () => appendPersonaCalibrationRecords(
        path,
        [{ ...calibration({ calibrationId: "bad-calibration" }), contentHash: "0".repeat(64) }],
        "bad-owner",
        schema,
        catalog,
      ),
      /invalid_content_hash/,
    );
    assert.equal(existsSync(`${path}.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-calibration: single-writer append/fsync guards OK");
}

console.log("stock-pro-council-calibration: 全テスト成功");
