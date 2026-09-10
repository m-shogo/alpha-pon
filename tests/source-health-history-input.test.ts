import assert from "node:assert/strict";
import { normalizeSourceHealthHistoryRows } from "../src/source-health-history-input.js";

const normalized = normalizeSourceHealthHistoryRows([
  // 必須レポートキーが欠けた行は truncated として弾かれる (PR #864)。
  { date: "2026-08-16", reports: {
    sourceHealth: { exists: true, size: 11 },
    daily: { exists: true, size: 22 },
    scores: { exists: true, size: 42 },
    proposals: { exists: true, size: 33 },
    stockPro: { exists: true, size: 44 },
    regime: { exists: true, size: 55 },
  } },
  null,
  "broken",
  { date: "2026-08-15", reports: [] },
  { date: "2026-08-14", reports: { scores: null } },
]);

assert.equal(normalized.rows.length, 1, "valid source-health rows must remain available");
assert.equal(normalized.invalidRows, 4, "malformed JSON values must be isolated and counted");
assert.deepEqual(normalized.rows[0], {
  date: "2026-08-16",
  reports: {
    sourceHealth: { exists: true, size: 11 },
    daily: { exists: true, size: 22 },
    scores: { exists: true, size: 42 },
    proposals: { exists: true, size: 33 },
    stockPro: { exists: true, size: 44 },
    regime: { exists: true, size: 55 },
  },
});

// reports は全必須キーが揃っていて初めて有効になる (PR #864)。
// ここで確かめたいのは値の型なので、scores 以外は妥当な値で埋めて scores だけを変える。
function reportsWithScores(scores: unknown): Record<string, unknown> {
  return {
    sourceHealth: { exists: true, size: 11 },
    daily: { exists: true, size: 22 },
    scores,
    proposals: { exists: true, size: 33 },
    stockPro: { exists: true, size: 44 },
    regime: { exists: true, size: 55 },
  };
}

const malformedReportValues = normalizeSourceHealthHistoryRows([
  { date: "2026-08-16", reports: reportsWithScores({ exists: "yes", size: 42 }) },
  { date: "2026-08-16", reports: reportsWithScores({ exists: true, size: "0" }) },
  { date: "2026-08-16", reports: reportsWithScores({ exists: true, size: -1 }) },
  { date: "2026-08-16", reports: reportsWithScores({ exists: true, size: 0.5 }) },
  { date: "2026-08-16", reports: reportsWithScores({ exists: true, size: Number.MAX_SAFE_INTEGER + 1 }) },
  { date: "2026-08-16", reports: reportsWithScores({ exists: false, size: 0 }) },
]);
assert.equal(malformedReportValues.rows.length, 1, "only typed report health values may affect missing-report counts");
assert.equal(malformedReportValues.invalidRows, 5, "invalid, fractional, and unsafe byte sizes must not create false-healthy history rows");
assert.deepEqual(malformedReportValues.rows[0], {
  date: "2026-08-16",
  reports: reportsWithScores({ exists: false, size: 0 }),
});

// reports を持たない行は truncated として弾く (PR #864)。
// 本番の data/source_health_history.jsonl 108行はすべて必須キーを持っており、
// 互換性を壊さないことを実データで確認済み。
const missingReports = normalizeSourceHealthHistoryRows([{ date: "2026-08-16" }]);
assert.equal(missingReports.rows.length, 0, "reports の無い行を healthy として通してはいけない");
assert.equal(missingReports.invalidRows, 1, "落とした行は数えて可視化する");

console.log("source health history input: malformed rows fail closed without stopping valid history OK");