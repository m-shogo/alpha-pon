import assert from "node:assert/strict";
import { selectSourceHealthScoreFile } from "../src/source-health-score-file.js";

assert.equal(
  selectSourceHealthScoreFile([
    "scores_2026-08-14.json",
    "scores_2026-08-16.json",
    "scores_2026-08-17.json",
    "scores_9999-99-99.json",
    "notes.txt",
  ], "2026-08-16"),
  "scores_2026-08-16.json",
  "future or nonexistent score snapshots must not contaminate current source health",
);

assert.equal(
  selectSourceHealthScoreFile([
    "scores_2026-08-14.json",
    "scores_2026-08-15.json",
  ], "2026-08-16"),
  "scores_2026-08-15.json",
  "latest historical score remains available when today's snapshot is absent",
);

assert.equal(
  selectSourceHealthScoreFile(["scores_2026-08-17.json", "scores_2026-02-31.json"], "2026-08-16"),
  null,
  "only future or invalid snapshots must fail closed as missing",
);

assert.equal(selectSourceHealthScoreFile(["scores_2026-08-16.json"], "2026-02-31"), null);

console.log("source health score file: PIT cutoff and Gregorian date validation OK");
