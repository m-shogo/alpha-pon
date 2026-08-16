import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMorningLitePipelineInput } from "../src/morning-lite-pipeline-input.js";

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-morning-lite-"));
  try {
    const path = join(dir, "pipeline_status_latest.json");

    writeFileSync(path, "{broken", "utf-8");
    const parseBroken = readMorningLitePipelineInput(path);
    assert.equal(parseBroken.status, "unknown");
    assert.deepEqual(parseBroken.failedSteps, []);
    assert.equal(parseBroken.warning, `${path}: parse_error`);

    writeFileSync(path, JSON.stringify({ status: "partial", completeWrapperFailedSteps: {}, failedSteps: [] }), "utf-8");
    const invalidFields = readMorningLitePipelineInput(path);
    assert.equal(invalidFields.status, "partial");
    assert.deepEqual(invalidFields.failedSteps, []);
    assert.equal(invalidFields.warning, `${path}: invalid_failed_steps`);

    writeFileSync(path, JSON.stringify({ status: "partial", completeWrapperFailedSteps: ["step-a"], failedSteps: "step-b(1)" }), "utf-8");
    const valid = readMorningLitePipelineInput(path);
    assert.deepEqual(valid.failedSteps, ["step-a", "step-b(1)"]);
    assert.equal(valid.warning, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("morning-lite: pipeline status input isolation OK");
}

main();
