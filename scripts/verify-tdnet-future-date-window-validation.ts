import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import { assessTdnetPrimaryReview, type TdnetPrimaryReviewDecision } from "../src/market-events/tdnet-primary-review.js";

const candidate = classifyTdnetDisclosureCandidate({
  code: "8136",
  sourceCode: "81360",
  companyName: "サンリオ",
  title: "定時株主総会招集ご通知",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: "https://www.release.tdnet.info/inbs/140120260904000001.pdf",
});
if (!candidate) throw new Error("TDnet future-horizon fixture must classify");

function review(time: TdnetPrimaryReviewDecision["time"]): TdnetPrimaryReviewDecision {
  return {
    candidateId: candidate.candidateId,
    reviewedAt: "2026-09-04T16:00:00+09:00",
    outcome: "FUTURE_EVENT_CONFIRMED",
    eventType: "SHAREHOLDER_MEETING",
    occurrenceKey: "annual-general-meeting-2026",
    time,
    sourceContentHash: "f".repeat(64),
    sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
    notes: [],
  };
}

assert.throws(
  () => assessTdnetPrimaryReview(candidate, review({
    startAt: "2026-09-03",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  })),
  /DATE_ONLY EventTime must not end before reviewedAt date/,
  "a fully past DATE_ONLY event must never be registration-preview ready",
);

assert.throws(
  () => assessTdnetPrimaryReview(candidate, review({
    startAt: null,
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "WINDOW",
    windowStart: "2026-09-01",
    windowEnd: "2026-09-03",
  })),
  /WINDOW EventTime must not end before reviewedAt date/,
  "a fully past WINDOW event must never be registration-preview ready",
);

const sameDayDateOnly = assessTdnetPrimaryReview(candidate, review({
  startAt: "2026-09-04",
  endAt: null,
  allDay: true,
  timezone: "Asia/Tokyo",
  precision: "DATE_ONLY",
  windowStart: null,
  windowEnd: null,
}));
assert.equal(
  sameDayDateOnly.registrationPreviewReady,
  true,
  "DATE_ONLY on the review date remains valid because the unknown intraday time may still be future",
);

console.log("tdnet-future-date-window-validation: ok");
