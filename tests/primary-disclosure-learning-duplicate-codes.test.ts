import assert from "node:assert/strict";
import { normalizePrimaryDisclosureLearningScoreInput } from "../src/primary-disclosure-learning-input.js";

const normalized = normalizePrimaryDisclosureLearningScoreInput([
  {
    code: "8136",
    name: "サンリオ",
    score: 80,
    alertLevel: "watch",
    createdAt: "2026-08-19",
    primaryDisclosureReview: { decision: "confirmed" },
  },
  {
    code: "8136",
    name: "サンリオ duplicate",
    score: 10,
    alertLevel: "watch",
    createdAt: "2026-08-19",
    primaryDisclosureReview: { decision: "block" },
  },
  {
    code: "9984",
    name: "ソフトバンクグループ",
    score: 70,
    alertLevel: "watch",
    createdAt: "2026-08-19",
    primaryDisclosureReview: { decision: "caution" },
  },
], "scores_2026-08-19.json", "2026-08-19");

assert.deepEqual(
  normalized.rows.map(row => row.code),
  ["9984"],
  "all rows participating in a duplicate score identity must fail closed instead of becoming last-write-wins learning evidence",
);
assert.equal(
  normalized.warnings.filter(warning => warning.endsWith("duplicate_code")).length,
  2,
  "each duplicated score row must be surfaced as metadata warning",
);

console.log("primary disclosure learning duplicate code tests passed");
