import assert from "node:assert/strict";
import { normalizePrimaryDisclosureLearningScoreInput } from "../src/primary-disclosure-learning-input.js";

const normalized = normalizePrimaryDisclosureLearningScoreInput([
  {
    code: "8136",
    name: "サンリオ",
    score: 80,
    alertLevel: "watch",
    createdAt: "2026-08-18",
    primaryDisclosureReview: {
      decision: "confirmed",
      positives: ["official IR"],
      warnings: {},
      blockers: "broken",
      sourceCoverage: {
        scannedEdinetDates: { broken: true },
      },
    },
  },
  null,
]);

assert.equal(normalized.rows.length, 1, "malformed nested fields must not drop a usable score row");
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.positives, ["official IR"]);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.warnings, []);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.blockers, []);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.sourceCoverage?.scannedEdinetDates, []);
assert.ok(normalized.warnings.some(warning => warning.includes("warnings: invalid_list")));
assert.ok(normalized.warnings.some(warning => warning.includes("blockers: invalid_list")));
assert.ok(normalized.warnings.some(warning => warning.includes("scannedEdinetDates: invalid_list")));
assert.ok(normalized.warnings.some(warning => warning.includes("row 2: invalid_row")));

const invalidRoot = normalizePrimaryDisclosureLearningScoreInput({ rows: [] }, "scores_2026-08-18.json");
assert.deepEqual(invalidRoot.rows, []);
assert.deepEqual(invalidRoot.warnings, ["scores_2026-08-18.json: invalid_root"]);

console.log("primary disclosure learning input tests passed");
