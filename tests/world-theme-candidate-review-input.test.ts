import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorldThemeCandidateReviewInput } from "../src/world-theme-candidate-review-input.js";

const tmp = mkdtempSync(join(tmpdir(), "world-theme-review-input-"));
try {
  const path = join(tmp, "world_theme_candidate_hypotheses.jsonl");
  const base = {
    hypothesisId: "world-theme-1",
    detectedAt: "2026-08-01",
    sourceEventTitle: "Space launch",
    theme: "space",
    candidateCode: "8136",
    candidateCompany: "Company 8136",
    nextPrimaryCheck: "official IR",
  };
  const valid = {
    ...base,
    reviewDueDates: [
      { afterDays: 30, dueAt: "2026-08-31", status: "open" },
      { afterDays: 90, dueAt: "2026-10-30", status: "reviewed" },
    ],
  };
  const duplicateHorizon = {
    ...base,
    hypothesisId: "world-theme-duplicate-horizon",
    reviewDueDates: [
      { afterDays: 30, dueAt: "2026-08-31", status: "open" },
      { afterDays: 30, dueAt: "2026-09-01", status: "open" },
    ],
  };
  const duplicateHypothesisId = {
    ...valid,
    sourceEventTitle: "Duplicate lineage",
  };

  writeFileSync(
    path,
    `${JSON.stringify(valid)}\n${JSON.stringify(duplicateHorizon)}\n${JSON.stringify(duplicateHypothesisId)}\n`,
    "utf-8",
  );
  const input = readWorldThemeCandidateReviewInput(path);

  assert.deepEqual(input.rows.map(row => row.hypothesisId), ["world-theme-1"]);
  assert.equal(input.warning, `${path}: invalid_rows 2`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("world-theme-candidate-review-input.test.ts passed");
