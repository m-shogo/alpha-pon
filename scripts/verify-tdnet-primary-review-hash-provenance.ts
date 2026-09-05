import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import { assessTdnetPrimaryReview } from "../src/market-events/tdnet-primary-review.js";

const candidate = classifyTdnetDisclosureCandidate({
  code: "8136",
  sourceCode: "81360",
  companyName: "サンリオ",
  title: "定時株主総会招集ご通知",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: "https://www.release.tdnet.info/inbs/140120260904000001.pdf",
});
if (!candidate) throw new Error("shareholder meeting disclosure must classify as a TDnet candidate");

const base = {
  candidateId: candidate.candidateId,
  reviewedAt: "2026-09-04T16:00:00+09:00",
  outcome: "FUTURE_EVENT_CONFIRMED" as const,
  eventType: "SHAREHOLDER_MEETING" as const,
  occurrenceKey: "annual-general-meeting-2026",
  time: {
    startAt: "2026-10-20",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY" as const,
    windowStart: null,
    windowEnd: null,
  },
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
  notes: ["primary document reviewed"],
};

for (const sourceContentHash of [
  ` ${"a".repeat(64)}`,
  `${"a".repeat(64)} `,
  `\t${"a".repeat(64)}`,
]) {
  assert.throws(
    () => assessTdnetPrimaryReview(candidate, { ...base, sourceContentHash }),
    /sourceContentHash must be a 64-character lowercase hex SHA-256/,
    "primary review must reject non-canonical hash whitespace instead of rewriting provenance",
  );
}

const canonical = assessTdnetPrimaryReview(candidate, {
  ...base,
  sourceContentHash: "a".repeat(64),
});
assert.equal(canonical.registrationPreviewReady, true);
assert.equal(canonical.normalized.sourceContentHash, "a".repeat(64));

console.log("tdnet-primary-review-hash-provenance: ok");
