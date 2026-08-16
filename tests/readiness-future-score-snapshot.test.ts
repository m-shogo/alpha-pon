import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReadinessDataQualityFallbackInput,
  assertReadinessScoreSnapshotFilenameInput,
} from "../src/readiness-company-memory-input.js";

const dir = mkdtempSync(join(tmpdir(), "readiness-future-score-"));
try {
  const reportsDir = join(dir, "reports");
  const generatedPath = join(dir, "alpha-pon-data.json");
  mkdirSync(reportsDir);
  writeFileSync(
    generatedPath,
    JSON.stringify({ dataQualityByCode: { "8136": { warnings: { count: 1 } } } }),
  );

  writeFileSync(join(reportsDir, "scores_2026-08-17.json"), JSON.stringify([]));
  assert.throws(
    () => assertReadinessScoreSnapshotFilenameInput(reportsDir, "2026-08-16"),
    /must not be later than readiness as-of date 2026-08-16/,
    "future score snapshots must fail closed instead of becoming current readiness evidence",
  );
  assert.throws(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir, "2026-08-16"),
    /warnings must be a string array/,
    "future score snapshots must not suppress validation of the current generated fallback",
  );

  rmSync(join(reportsDir, "scores_2026-08-17.json"));
  writeFileSync(join(reportsDir, "scores_2026-08-16.json"), JSON.stringify([]));
  assert.doesNotThrow(
    () => assertReadinessScoreSnapshotFilenameInput(reportsDir, "2026-08-16"),
    "same-day score snapshots remain valid PIT evidence",
  );
  assert.doesNotThrow(
    () => assertReadinessDataQualityFallbackInput(generatedPath, reportsDir, "2026-08-16"),
    "same-day usable score snapshots continue to supersede the generated fallback",
  );

  console.log("readiness-future-score-snapshot.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
