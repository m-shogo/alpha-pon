import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorldThemeCandidateStatsInput } from "../src/world-theme-candidate-stats-input.js";

const tmp = mkdtempSync(join(tmpdir(), "world-theme-stats-input-"));
try {
  const path = join(tmp, "world_theme_candidate_review_results.jsonl");
  const valid = JSON.stringify({
    theme: "space",
    result: "hit",
    candidateCode: "8136",
    candidateCompany: "Company 8136",
    reviewedAt: "2026-08-16",
    afterDays: 30,
    memo: "reviewed",
  });
  writeFileSync(path, `${valid}\n{broken\n{}\n{"theme":"space"}\n`, "utf-8");

  const input = readWorldThemeCandidateStatsInput(path);
  assert.deepEqual(input.rows.map(row => row.candidateCode), ["8136"]);
  assert(input.warning?.includes("lines 2"), "malformed JSONL must surface line-number metadata");
  assert(input.warning?.includes("invalid_rows 2"), "JSON-valid unsafe rows must be isolated");
  assert(!input.warning?.includes("{broken"), "warnings must not echo raw malformed JSONL content");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log("world-theme-candidate-stats-input.test.ts passed");
