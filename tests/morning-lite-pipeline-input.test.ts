import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readMorningLiteDedupeCount,
  readMorningLitePipelineInput,
} from "../src/morning-lite-pipeline-input.js";

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-morning-lite-"));
  try {
    const pipelinePath = join(dir, "pipeline_status_latest.json");

    writeFileSync(pipelinePath, "{broken", "utf-8");
    const parseBroken = readMorningLitePipelineInput(pipelinePath);
    assert.equal(parseBroken.status, "unknown");
    assert.deepEqual(parseBroken.failedSteps, []);
    assert.equal(parseBroken.warning, `${pipelinePath}: parse_error`);

    writeFileSync(pipelinePath, JSON.stringify({ status: "partial", completeWrapperFailedSteps: {}, failedSteps: [] }), "utf-8");
    const invalidFields = readMorningLitePipelineInput(pipelinePath);
    assert.equal(invalidFields.status, "partial");
    assert.deepEqual(invalidFields.failedSteps, []);
    assert.equal(invalidFields.warning, `${pipelinePath}: invalid_failed_steps`);

    writeFileSync(pipelinePath, JSON.stringify({ status: "partial", completeWrapperFailedSteps: ["step-a"], failedSteps: "step-b(1)" }), "utf-8");
    const valid = readMorningLitePipelineInput(pipelinePath);
    assert.deepEqual(valid.failedSteps, ["step-a", "step-b(1)"]);
    assert.equal(valid.warning, null);

    const dedupePath = join(dir, "2026-08-16.json");
    writeFileSync(dedupePath, "{broken", "utf-8");
    assert.deepEqual(readMorningLiteDedupeCount(dedupePath), { count: 0, warning: `${dedupePath}: parse_error` });

    writeFileSync(dedupePath, JSON.stringify({ key: "not-an-array" }), "utf-8");
    assert.deepEqual(readMorningLiteDedupeCount(dedupePath), { count: 0, warning: `${dedupePath}: invalid_root` });

    writeFileSync(
      dedupePath,
      JSON.stringify([
        { key: "a", sentAt: "2026-08-16T00:00:00.000Z", preview: "ok" },
        {},
      ]),
      "utf-8",
    );
    assert.deepEqual(readMorningLiteDedupeCount(dedupePath), { count: 1, warning: `${dedupePath}: invalid_rows 1` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("morning-lite: pipeline and dedupe input isolation OK");
}

main();
