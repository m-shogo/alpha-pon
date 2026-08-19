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
      items: [
        { source: "TDnet", title: "自己株式取得", category: "buyback", severity: "positive", publishedAt: "2026-08-18" },
        null,
        { source: "TDnet", title: 7, category: "buyback", severity: "positive", publishedAt: "2026-08-18" },
      ],
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
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.items, [
  { source: "TDnet", title: "自己株式取得", category: "buyback", severity: "positive", publishedAt: "2026-08-18" },
]);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.positives, ["official IR"]);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.warnings, []);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.blockers, []);
assert.deepEqual(normalized.rows[0].primaryDisclosureReview?.sourceCoverage?.scannedEdinetDates, []);
assert.ok(normalized.warnings.some(warning => warning.includes("items item 2: invalid_row")));
assert.ok(normalized.warnings.some(warning => warning.includes("items item 3: invalid_fields")));
assert.ok(normalized.warnings.some(warning => warning.includes("warnings: invalid_list")));
assert.ok(normalized.warnings.some(warning => warning.includes("blockers: invalid_list")));
assert.ok(normalized.warnings.some(warning => warning.includes("scannedEdinetDates: invalid_list")));
assert.ok(normalized.warnings.some(warning => warning.includes("row 2: invalid_row")));

const malformedItems = normalizePrimaryDisclosureLearningScoreInput([{
  code: "8136",
  name: "サンリオ",
  score: 80,
  alertLevel: "watch",
  createdAt: "2026-08-18",
  primaryDisclosureReview: { decision: "confirmed", items: {} },
}]);
assert.equal(malformedItems.rows.length, 1, "malformed items must not stop the whole score history");
assert.deepEqual(malformedItems.rows[0].primaryDisclosureReview?.items, []);
assert.ok(malformedItems.warnings.some(warning => warning.includes("items: invalid_list")));

const disclosureDates = normalizePrimaryDisclosureLearningScoreInput([{
  code: "8136",
  name: "サンリオ",
  score: 80,
  alertLevel: "watch",
  createdAt: "2026-08-18",
  primaryDisclosureReview: {
    decision: "confirmed",
    items: [
      { source: "TDnet", title: "決算", category: "earnings", severity: "positive", publishedAt: "2026-08-18" },
      { source: "TDnet", title: "不存在日", category: "earnings", severity: "positive", publishedAt: "2026-02-31" },
      { source: "EDINET", title: "year zero", category: "earnings", severity: "positive", publishedAt: "0000-01-01" },
    ],
  },
}]);
assert.deepEqual(
  disclosureDates.rows[0].primaryDisclosureReview?.items,
  [{ source: "TDnet", title: "決算", category: "earnings", severity: "positive", publishedAt: "2026-08-18" }],
  "disclosure learning must count only items with real Gregorian published dates",
);
assert.equal(
  disclosureDates.warnings.filter(warning => warning.includes("primaryDisclosureReview.items") && warning.includes("invalid_fields")).length,
  2,
  "each invalid disclosure published date must be surfaced as metadata warning",
);

const scanDates = normalizePrimaryDisclosureLearningScoreInput([{
  code: "8136",
  name: "サンリオ",
  score: 80,
  alertLevel: "watch",
  createdAt: "2026-08-18",
  primaryDisclosureReview: {
    decision: "confirmed",
    sourceCoverage: {
      scannedEdinetDates: ["2026-08-18", "2026-02-31", "0000-01-01"],
    },
  },
}]);
assert.deepEqual(
  scanDates.rows[0].primaryDisclosureReview?.sourceCoverage?.scannedEdinetDates,
  ["2026-08-18"],
  "only real Gregorian JST dates may be exposed as EDINET scan provenance",
);
assert.equal(
  scanDates.warnings.filter(warning => warning.includes("scannedEdinetDates: invalid_date")).length,
  2,
  "each invalid EDINET scan date must be surfaced as metadata warning",
);

const invalidRoot = normalizePrimaryDisclosureLearningScoreInput({ rows: [] }, "scores_2026-08-18.json");
assert.deepEqual(invalidRoot.rows, []);
assert.deepEqual(invalidRoot.warnings, ["scores_2026-08-18.json: invalid_root"]);

console.log("primary disclosure learning input tests passed");