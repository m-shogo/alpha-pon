import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validatePersonaCalibrationRepository,
} from "../../src/research/stock-pro-council-calibration-repository.js";
import {
  withPersonaCalibrationHash,
  type PersonaCalibrationRecordInput,
} from "../../src/research/stock-pro-council-calibration.js";

function calibration(overrides: Partial<PersonaCalibrationRecordInput> = {}) {
  return withPersonaCalibrationHash({
    schemaVersion: 1,
    calibrationId: "calibration-repository-001",
    personaId: "jp_event_driven_pm",
    personaVersion: "2",
    jurisdiction: "event_state_transition",
    metric: "event_classification_accuracy",
    segment: { sector: "all", regime: "mixed", horizon: "D+1" },
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
    evidenceRefs: ["calibration-evidence:repository:001"],
    modelVersion: "fixture-model-v1",
    ruleVersion: "calibration-rule-v1",
    ...overrides,
  });
}

{
  const dir = mkdtempSync(join(tmpdir(), "persona-calibration-empty-"));
  try {
    const result = validatePersonaCalibrationRepository({ dir: join(dir, "missing") });
    assert.equal(result.calibrationCount, 0);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-calibration-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "persona-calibration-partial-"));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "partial.jsonl"), JSON.stringify(calibration()), "utf-8");
    const result = validatePersonaCalibrationRepository({ dir });
    assert.ok(result.issues.some((issue) => issue.code === "partial_calibration_tail"));
    assert.equal(result.calibrationCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-calibration-repository: partial tail block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "persona-calibration-valid-"));
  try {
    const valid = calibration();
    writeFileSync(join(dir, "valid.jsonl"), `${JSON.stringify(valid)}\n`, "utf-8");
    const result = validatePersonaCalibrationRepository({ dir });
    assert.equal(result.calibrationCount, 1);
    assert.equal(result.activeHeadCount, 1);
    assert.equal(result.eligibleHeadCount, 1);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-calibration-repository: valid record OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "persona-calibration-heads-"));
  try {
    const first = calibration();
    const second = calibration({ calibrationId: "calibration-repository-002" });
    writeFileSync(
      join(dir, "multiple-heads.jsonl"),
      `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`,
      "utf-8",
    );
    const result = validatePersonaCalibrationRepository({ dir });
    assert.ok(result.issues.some((issue) => issue.code === "multiple_calibration_heads"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("stock-pro-council-calibration-repository: multiple head block OK");
}

console.log("stock-pro-council-calibration-repository: 全テスト成功");
