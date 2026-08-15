import assert from "node:assert/strict";
import { normalizeWorldImpactReview } from "../src/world-impact.js";
import { resolveWorldImpactReportInput } from "../src/world-impact-report-input.js";

const base = {
  reviewKey: "event__5803",
  eventId: "event",
  eventDate: "2026-06-10",
  createdAt: "2026-06-10",
  updatedAt: "2026-06-12",
  outcomes: [{
    dueAt: "2026-06-11",
    evaluatedAt: "2026-06-12",
    evaluationAsOf: "2026-06-12",
    priceStartDate: "2026-06-10",
    priceEndDate: "2026-06-11",
  }],
};

const valid = resolveWorldImpactReportInput({ present: true, parsed: [base] }, [], "2026-06-12");
assert.equal(valid.latestSnapshotError, false, "real nested outcome dates remain readable");
assert.equal(valid.jsonlFallbackError, false, "valid latest does not report a JSONL fallback error");

for (const [field, invalid] of [
  ["evaluatedAt", "2026-02-31"],
  ["evaluationAsOf", "0000-01-01"],
  ["priceStartDate", "20260610"],
  ["priceEndDate", "2026-02-31"],
] as const) {
  const parsed = [{
    ...base,
    outcomes: [{ ...base.outcomes[0], [field]: invalid }],
  }];
  const result = resolveWorldImpactReportInput({ present: true, parsed }, [], "2026-06-12");
  assert.equal(result.latestSnapshotError, true, `${field}の不正日付をread-only latestへ通さない`);
  assert.deepEqual(result.reviews, [], "invalid latest must fail closed instead of normalizing malformed dates");
}

const invalidFallback = normalizeWorldImpactReview({
  ...base,
  outcomes: [{ ...base.outcomes[0], evaluatedAt: "2026-02-31" }],
}, "2026-06-12");
const fallback = resolveWorldImpactReportInput({ present: false }, [invalidFallback], "2026-06-12");
assert.equal(fallback.jsonlFallbackError, true, "latest欠落時も不正JSONL日付をread-only fallbackへ通さない");
assert.deepEqual(fallback.reviews, [], "invalid JSONL fallback must fail closed instead of becoming report/calibration input");

const validFallback = resolveWorldImpactReportInput(
  { present: false },
  [normalizeWorldImpactReview(base, "2026-06-12")],
  "2026-06-12",
);
assert.equal(validFallback.jsonlFallbackError, false, "valid JSONL fallback remains available when latest is absent");
assert.equal(validFallback.reviews.length, 1, "valid fallback review remains readable");

console.log("world-impact report input: latest and JSONL fallback dates require real Gregorian JST dates");
