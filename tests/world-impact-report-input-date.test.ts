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

for (const [label, outcome] of [
  ["price start after price end", { ...base.outcomes[0], priceStartDate: "2026-06-12", priceEndDate: "2026-06-11" }],
  ["price end after evaluation cutoff", { ...base.outcomes[0], priceEndDate: "2026-06-13", evaluationAsOf: "2026-06-12" }],
  ["evaluation cutoff after evaluated date", { ...base.outcomes[0], evaluationAsOf: "2026-06-13", evaluatedAt: "2026-06-12" }],
] as const) {
  const parsed = [{ ...base, outcomes: [outcome] }];
  const result = resolveWorldImpactReportInput({ present: true, parsed }, [], "2026-06-13");
  assert.equal(result.latestSnapshotError, true, `${label} must fail closed in read-only latest`);
  assert.deepEqual(result.reviews, [], "reversed evaluation chronology must not reach report/calibration inputs");
}

for (const [field, futureDate] of [
  ["createdAt", "2026-06-13"],
  ["updatedAt", "2026-06-13"],
] as const) {
  const parsed = [{ ...base, [field]: futureDate }];
  const result = resolveWorldImpactReportInput({ present: true, parsed }, [], "2026-06-12");
  assert.equal(result.latestSnapshotError, true, `${field} in the future must not become current read-only provenance`);
  assert.deepEqual(result.reviews, [], "future provenance must fail closed");
}

for (const field of ["evaluatedAt", "evaluationAsOf", "priceEndDate"] as const) {
  const parsed = [{
    ...base,
    outcomes: [{ ...base.outcomes[0], [field]: "2026-06-13" }],
  }];
  const result = resolveWorldImpactReportInput({ present: true, parsed }, [], "2026-06-12");
  assert.equal(result.latestSnapshotError, true, `future ${field} must not become current outcome evidence`);
  assert.deepEqual(result.reviews, [], "future outcome evidence must fail closed");
}

for (const [field, value] of [
  ["reviewKey", " event__5803"],
  ["eventId", "event "],
] as const) {
  const result = resolveWorldImpactReportInput({ present: true, parsed: [{ ...base, [field]: value }] }, [], "2026-06-12");
  assert.equal(result.latestSnapshotError, true, `padded ${field} must not create an ambiguous provenance identity`);
  assert.deepEqual(result.reviews, [], "non-canonical identities must fail closed");
}

const duplicateLatest = resolveWorldImpactReportInput(
  { present: true, parsed: [base, { ...base, topic: "duplicate identity" }] },
  [],
  "2026-06-12",
);
assert.equal(duplicateLatest.latestSnapshotError, true, "duplicate reviewKey must not be counted twice in canonical latest");
assert.deepEqual(duplicateLatest.reviews, [], "ambiguous duplicate latest identities must fail closed");

const invalidFallback = normalizeWorldImpactReview({
  ...base,
  outcomes: [{ ...base.outcomes[0], evaluatedAt: "2026-02-31" }],
}, "2026-06-12");
const fallback = resolveWorldImpactReportInput({ present: false }, [invalidFallback], "2026-06-12");
assert.equal(fallback.jsonlFallbackError, true, "latest欠落時も不正JSONL日付をread-only fallbackへ通さない");
assert.deepEqual(fallback.reviews, [], "invalid JSONL fallback must fail closed instead of becoming report/calibration input");

const reversedFallback = normalizeWorldImpactReview({
  ...base,
  outcomes: [{ ...base.outcomes[0], priceStartDate: "2026-06-12", priceEndDate: "2026-06-11" }],
}, "2026-06-12");
const reversedFallbackResult = resolveWorldImpactReportInput({ present: false }, [reversedFallback], "2026-06-12");
assert.equal(reversedFallbackResult.jsonlFallbackError, true, "JSONL fallbackでも逆行した評価日付を通さない");
assert.deepEqual(reversedFallbackResult.reviews, [], "reversed fallback chronology must fail closed");

const futureFallback = normalizeWorldImpactReview({ ...base, updatedAt: "2026-06-13" }, "2026-06-12");
const futureFallbackResult = resolveWorldImpactReportInput({ present: false }, [futureFallback], "2026-06-12");
assert.equal(futureFallbackResult.jsonlFallbackError, true, "future JSONL provenance must not become current read-only fallback evidence");
assert.deepEqual(futureFallbackResult.reviews, [], "future fallback provenance must fail closed");

const futureOutcomeFallback = normalizeWorldImpactReview({
  ...base,
  outcomes: [{ ...base.outcomes[0], evaluatedAt: "2026-06-13", evaluationAsOf: "2026-06-13", priceEndDate: "2026-06-13" }],
}, "2026-06-12");
const futureOutcomeFallbackResult = resolveWorldImpactReportInput({ present: false }, [futureOutcomeFallback], "2026-06-12");
assert.equal(futureOutcomeFallbackResult.jsonlFallbackError, true, "future JSONL outcome evidence must not become current fallback evidence");
assert.deepEqual(futureOutcomeFallbackResult.reviews, [], "future fallback outcome evidence must fail closed");

const duplicateFallbackReview = normalizeWorldImpactReview(base, "2026-06-12");
const duplicateFallbackResult = resolveWorldImpactReportInput(
  { present: false },
  [duplicateFallbackReview, { ...duplicateFallbackReview, topic: "duplicate identity" }],
  "2026-06-12",
);
assert.equal(duplicateFallbackResult.jsonlFallbackError, true, "duplicate fallback reviewKey must not become double-counted evidence");
assert.deepEqual(duplicateFallbackResult.reviews, [], "ambiguous JSONL fallback identities must fail closed");

const validFallback = resolveWorldImpactReportInput(
  { present: false },
  [normalizeWorldImpactReview(base, "2026-06-12")],
  "2026-06-12",
);
assert.equal(validFallback.jsonlFallbackError, false, "valid JSONL fallback remains available when latest is absent");
assert.equal(validFallback.reviews.length, 1, "valid fallback review remains readable");

console.log("world-impact report input: latest and JSONL fallback require canonical unique identities, real Gregorian JST dates, current provenance/outcome evidence, and monotonic evaluation chronology");
