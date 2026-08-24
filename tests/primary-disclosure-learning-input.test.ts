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

const canonicalCategoryIdentity = normalizePrimaryDisclosureLearningScoreInput([{
  code: "8136",
  name: "サンリオ",
  score: 80,
  alertLevel: "watch",
  createdAt: "2026-08-18",
  primaryDisclosureReview: {
    decision: "confirmed",
    items: [
      { source: "TDnet", title: "決算", category: "earnings", severity: "positive", publishedAt: "2026-08-18" },
      { source: "TDnet", title: "padded category", category: " earnings", severity: "positive", publishedAt: "2026-08-18" },
      { source: "TDnet", title: "padded severity", category: "earnings", severity: "positive ", publishedAt: "2026-08-18" },
    ],
  },
}], "scores_2026-08-18.json", "2026-08-18");
assert.deepEqual(
  canonicalCategoryIdentity.rows[0].primaryDisclosureReview?.items,
  [{ source: "TDnet", title: "決算", category: "earnings", severity: "positive", publishedAt: "2026-08-18" }],
  "padded category/severity identities must not split learning aggregates",
);
assert.equal(
  canonicalCategoryIdentity.warnings.filter(warning => warning.includes("primaryDisclosureReview.items") && warning.includes("invalid_fields")).length,
  2,
  "each padded category/severity identity must be surfaced as metadata warning",
);

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
      { source: "TDnet", title: "未来開示", category: "earnings", severity: "positive", publishedAt: "2026-08-20" },
    ],
  },
}], "scores_2026-08-18.json", "2026-08-19");
assert.deepEqual(
  disclosureDates.rows[0].primaryDisclosureReview?.items,
  [{ source: "TDnet", title: "決算", category: "earnings", severity: "positive", publishedAt: "2026-08-18" }],
  "disclosure learning must count only items published on or before the learning cutoff",
);
assert.equal(
  disclosureDates.warnings.filter(warning => warning.includes("primaryDisclosureReview.items") && warning.includes("invalid_fields")).length,
  3,
  "each impossible, year-zero, or future disclosure date must be surfaced as metadata warning",
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
      scannedEdinetDates: ["2026-08-18", "2026-02-31", "0000-01-01", "2026-08-20"],
    },
  },
}], "scores_2026-08-18.json", "2026-08-19");
assert.deepEqual(
  scanDates.rows[0].primaryDisclosureReview?.sourceCoverage?.scannedEdinetDates,
  ["2026-08-18"],
  "only real Gregorian EDINET scan dates on or before the learning cutoff may be exposed as provenance",
);
assert.equal(
  scanDates.warnings.filter(warning => warning.includes("scannedEdinetDates: invalid_date")).length,
  3,
  "each impossible, year-zero, or future EDINET scan date must be surfaced as metadata warning",
);

const validScoreRow = [{ code: "8136", name: "サンリオ", score: 80, alertLevel: "watch", createdAt: "2026-08-19" }];
const currentSnapshot = normalizePrimaryDisclosureLearningScoreInput(validScoreRow, "scores_2026-08-19.json", "2026-08-19");
assert.equal(currentSnapshot.rows.length, 1, "current-day score snapshot must remain usable for learning");

const futureSnapshot = normalizePrimaryDisclosureLearningScoreInput(validScoreRow, "scores_2026-08-20.json", "2026-08-19");
assert.deepEqual(futureSnapshot.rows, [], "future score snapshot must not enter current learning evidence");
assert.deepEqual(futureSnapshot.warnings, ["scores_2026-08-20.json: invalid_source_date"]);

const impossibleSnapshot = normalizePrimaryDisclosureLearningScoreInput(validScoreRow, "scores_2026-02-31.json", "2026-08-19");
assert.deepEqual(impossibleSnapshot.rows, [], "impossible score snapshot date must fail closed");
assert.deepEqual(impossibleSnapshot.warnings, ["scores_2026-02-31.json: invalid_source_date"]);

const invalidCreatedAt = normalizePrimaryDisclosureLearningScoreInput([
  { ...validScoreRow[0], createdAt: "2026-02-31" },
  { ...validScoreRow[0], code: "9984", name: "ソフトバンクグループ", createdAt: "2026-08-20" },
], "scores_2026-08-19.json", "2026-08-19");
assert.deepEqual(invalidCreatedAt.rows, [], "impossible or future score-row createdAt must not enter current learning evidence");
assert.equal(
  invalidCreatedAt.warnings.filter(warning => warning.includes("invalid_metadata")).length,
  2,
  "each invalid score-row createdAt must be surfaced as metadata warning",
);

const mismatchedSnapshotDate = normalizePrimaryDisclosureLearningScoreInput([
  { ...validScoreRow[0], createdAt: "2026-08-18" },
], "scores_2026-08-19.json", "2026-08-19");
assert.deepEqual(
  mismatchedSnapshotDate.rows,
  [],
  "a later score snapshot must not inject a row into an earlier learning-date key",
);
assert.deepEqual(
  mismatchedSnapshotDate.warnings,
  ["scores_2026-08-19.json row 1: invalid_metadata"],
  "snapshot-date provenance mismatch must be surfaced as metadata warning",
);

const invalidRoot = normalizePrimaryDisclosureLearningScoreInput({ rows: [] }, "scores_2026-08-18.json", "2026-08-19");
assert.deepEqual(invalidRoot.rows, []);
assert.deepEqual(invalidRoot.warnings, ["scores_2026-08-18.json: invalid_root"]);

console.log("primary disclosure learning input tests passed");
