import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertReadinessDataQualityFallbackInput,
  assertReadinessHypothesisOutcomeInput,
  assertReadinessHypothesisPredictionInput,
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

  const outcome = {
    code: "8136",
    hypothesis: { detectedAt: "2026-08-16" },
    evaluatedAt: "2026-08-16",
    reviewHorizon: "1m",
    dataSource: "jquants",
    dataAvailability: "ok",
  };
  writeFileSync(generatedPath, JSON.stringify({ hypothesisOutcomes: [outcome] }));
  assert.doesNotThrow(
    () => assertReadinessHypothesisOutcomeInput(generatedPath, "2026-08-16"),
    "same-day evaluated outcomes remain valid current readiness evidence",
  );

  writeFileSync(
    generatedPath,
    JSON.stringify({ hypothesisOutcomes: [{ ...outcome, hypothesis: { detectedAt: "2026-08-17" } }] }),
  );
  assert.throws(
    () => assertReadinessHypothesisOutcomeInput(generatedPath, "2026-08-16"),
    /must not be later than readiness as-of date 2026-08-16/,
    "future hypothesis detection dates must not inflate current outcome readiness",
  );

  writeFileSync(
    generatedPath,
    JSON.stringify({ hypothesisOutcomes: [{ ...outcome, evaluatedAt: "2026-08-17" }] }),
  );
  assert.throws(
    () => assertReadinessHypothesisOutcomeInput(generatedPath, "2026-08-16"),
    /evaluatedAt must not be later than readiness as-of date 2026-08-16/,
    "future outcome evaluation dates must not inflate current outcome readiness",
  );

  const prediction = {
    code: "8136",
    name: "Sanrio",
    detectedAt: "2026-08-16",
  };
  writeFileSync(generatedPath, JSON.stringify({ hypothesisPredictions: [prediction] }));
  assert.doesNotThrow(
    () => assertReadinessHypothesisPredictionInput(generatedPath, "2026-08-16"),
    "same-day hypothesis predictions remain valid current readiness evidence",
  );

  writeFileSync(
    generatedPath,
    JSON.stringify({ hypothesisPredictions: [{ ...prediction, detectedAt: "2026-08-17" }] }),
  );
  assert.throws(
    () => assertReadinessHypothesisPredictionInput(generatedPath, "2026-08-16"),
    /detectedAt must be a real date not later than readiness as-of date 2026-08-16/,
    "future hypothesis predictions must not inflate current readiness hypothesis counts",
  );

  console.log("readiness-future-score-snapshot.test.ts passed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
