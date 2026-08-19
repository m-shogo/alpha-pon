import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseMorningLiteDedupeFileDate,
  readMorningLiteDedupeCount,
  readMorningLitePipelineInput,
} from "../src/morning-lite-pipeline-input.js";

const AS_OF = "2026-08-16";

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), "alpha-pon-morning-lite-"));
  try {
    const pipelinePath = join(dir, "pipeline_status_latest.json");

    writeFileSync(pipelinePath, "{broken", "utf-8");
    const parseBroken = readMorningLitePipelineInput(pipelinePath, AS_OF);
    assert.equal(parseBroken.status, "unknown");
    assert.deepEqual(parseBroken.failedSteps, []);
    assert.equal(parseBroken.warning, `${pipelinePath}: parse_error`);

    writeFileSync(pipelinePath, JSON.stringify({ date: "2026-02-31", status: "ok", failedSteps: [] }), "utf-8");
    assert.deepEqual(readMorningLitePipelineInput(pipelinePath, AS_OF), {
      status: "unknown",
      failedSteps: [],
      warning: `${pipelinePath}: invalid_date`,
    });

    writeFileSync(pipelinePath, JSON.stringify({ date: "2026-08-15", status: "ok", failedSteps: [] }), "utf-8");
    assert.deepEqual(readMorningLitePipelineInput(pipelinePath, AS_OF), {
      status: "unknown",
      failedSteps: [],
      warning: `${pipelinePath}: not_current_date`,
    });

    writeFileSync(pipelinePath, JSON.stringify({ date: AS_OF, status: "partial_failed", completeWrapperFailedSteps: {}, failedSteps: [] }), "utf-8");
    const invalidFields = readMorningLitePipelineInput(pipelinePath, AS_OF);
    assert.equal(invalidFields.status, "partial_failed");
    assert.deepEqual(invalidFields.failedSteps, []);
    assert.equal(invalidFields.warning, `${pipelinePath}: invalid_failed_steps`);

    writeFileSync(pipelinePath, JSON.stringify({ date: AS_OF, status: "partial_failed", completeWrapperFailedSteps: ["step-a"], failedSteps: ["step-b", "step-a"] }), "utf-8");
    const valid = readMorningLitePipelineInput(pipelinePath, AS_OF);
    assert.deepEqual(valid.failedSteps, ["step-a", "step-b"]);
    assert.equal(valid.warning, null);

    writeFileSync(pipelinePath, JSON.stringify({ date: AS_OF, status: "partial_failed", failedSteps: "step-b(1)" }), "utf-8");
    const legacyWrongShape = readMorningLitePipelineInput(pipelinePath, AS_OF);
    assert.deepEqual(legacyWrongShape.failedSteps, []);
    assert.equal(legacyWrongShape.warning, `${pipelinePath}: invalid_failed_steps`);

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

    assert.deepEqual(parseMorningLiteDedupeFileDate("2026-08-16.json", "2026-08-16"), { date: "2026-08-16", warning: null });
    assert.deepEqual(parseMorningLiteDedupeFileDate("2026-02-31.json", "2026-08-16"), { date: null, warning: "2026-02-31.json: invalid_date_filename" });
    assert.deepEqual(parseMorningLiteDedupeFileDate("0000-01-01.json", "2026-08-16"), { date: null, warning: "0000-01-01.json: invalid_date_filename" });
    assert.deepEqual(parseMorningLiteDedupeFileDate("2026-08-17.json", "2026-08-16"), { date: null, warning: "2026-08-17.json: future_date_filename" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("morning-lite: pipeline and dedupe input isolation OK");
}

main();
