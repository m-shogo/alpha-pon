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
const confirmedCandidate = candidate;

function review(time: TdnetPrimaryReviewDecision["time"]): TdnetPrimaryReviewDecision {
  return {
    candidateId: confirmedCandidate.candidateId,
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

for (const startAt of ["2026-09-03", "2026-09-04"]) {
  assert.throws(
    () => assessTdnetPrimaryReview(confirmedCandidate, review({
      startAt,
      endAt: null,
      allDay: true,
      timezone: "Asia/Tokyo",
      precision: "DATE_ONLY",
      windowStart: null,
      windowEnd: null,
    })),
    /DATE_ONLY EventTime must start after reviewedAt date/,
    "DATE_ONLY must be unambiguously after the review date before FUTURE_EVENT_CONFIRMED is allowed",
  );
}

for (const windowStart of ["2026-09-01", "2026-09-04"]) {
  assert.throws(
    () => assessTdnetPrimaryReview(confirmedCandidate, review({
      startAt: null,
      endAt: null,
      allDay: true,
      timezone: "Asia/Tokyo",
      precision: "WINDOW",
      windowStart,
      windowEnd: "2026-09-06",
    })),
    /WINDOW EventTime must start after reviewedAt date/,
    "WINDOW must be wholly future before FUTURE_EVENT_CONFIRMED is allowed",
  );
}

const futureDateOnly = assessTdnetPrimaryReview(confirmedCandidate, review({
  startAt: "2026-09-05",
  endAt: null,
  allDay: true,
  timezone: "Asia/Tokyo",
  precision: "DATE_ONLY",
  windowStart: null,
  windowEnd: null,
}));
assert.equal(futureDateOnly.registrationPreviewReady, true);

const futureWindow = assessTdnetPrimaryReview(confirmedCandidate, review({
  startAt: null,
  endAt: null,
  allDay: true,
  timezone: "Asia/Tokyo",
  precision: "WINDOW",
  windowStart: "2026-09-05",
  windowEnd: "2026-09-06",
}));
assert.equal(futureWindow.registrationPreviewReady, true);

console.log("tdnet-future-date-window-validation: ok");
