import "./verify-tdnet-registration-preview.js";
import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import {
  assessTdnetPrimaryReview,
  type TdnetPrimaryReviewDecision,
} from "../src/market-events/tdnet-primary-review.js";

const candidate = classifyTdnetDisclosureCandidate({
  code: "8136",
  sourceCode: "81360",
  companyName: "サンリオ",
  title: "定時株主総会招集ご通知",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: "https://www.release.tdnet.info/inbs/140120260904000001.pdf",
});
if (!candidate) throw new Error("shareholder meeting disclosure must classify as a TDnet candidate");
const candidateId = candidate.candidateId;

function decision(overrides: Partial<TdnetPrimaryReviewDecision> = {}): TdnetPrimaryReviewDecision {
  return {
    candidateId,
    reviewedAt: "2026-09-04T16:00:00+09:00",
    outcome: "FUTURE_EVENT_CONFIRMED",
    eventType: null,
    occurrenceKey: null,
    time: null,
    sourceContentHash: null,
    sourceRetrievedAt: null,
    notes: [],
    ...overrides,
  };
}

const incomplete = assessTdnetPrimaryReview(candidate, decision());
assert.equal(incomplete.registrationPreviewReady, false);
assert.deepEqual(incomplete.blockers, [
  "event_type_missing",
  "stable_occurrence_key_missing",
  "future_event_time_missing",
  "source_content_hash_missing",
  "source_retrieved_at_missing",
]);

const unknownTime = assessTdnetPrimaryReview(candidate, decision({
  eventType: "SHAREHOLDER_MEETING",
  occurrenceKey: "annual-general-meeting-2026",
  time: {
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "UNKNOWN",
    windowStart: null,
    windowEnd: null,
  },
  sourceContentHash: "A".repeat(64),
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
  notes: [" primary document reviewed ", "primary document reviewed"],
}));
assert.equal(unknownTime.registrationPreviewReady, false);
assert.deepEqual(unknownTime.blockers, ["future_event_time_missing"]);
assert.equal(unknownTime.normalized.sourceContentHash, "a".repeat(64));
assert.deepEqual(unknownTime.normalized.notes, ["primary document reviewed"]);

const ready = assessTdnetPrimaryReview(candidate, decision({
  eventType: "SHAREHOLDER_MEETING",
  occurrenceKey: " annual-general-meeting-2026 ",
  time: {
    startAt: "2026-10-20",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  sourceContentHash: "b".repeat(64),
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
  notes: ["meeting date explicitly stated in primary document"],
}));
assert.equal(ready.registrationPreviewReady, true);
assert.deepEqual(ready.blockers, []);
assert.deepEqual(ready.warnings, []);
assert.equal(ready.normalized.occurrenceKey, "annual-general-meeting-2026");

const exactReady = assessTdnetPrimaryReview(candidate, decision({
  eventType: "PRESS_CONFERENCE",
  occurrenceKey: "press-conference-2026-09-05",
  time: {
    startAt: "2026-09-05T10:00:00+09:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT",
    windowStart: null,
    windowEnd: null,
  },
  sourceContentHash: "d".repeat(64),
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
}));
assert.equal(exactReady.registrationPreviewReady, true);

const mismatch = assessTdnetPrimaryReview(candidate, decision({
  eventType: "CONTINUED_SHAREHOLDER_MEETING",
  occurrenceKey: "continued-meeting-2026",
  time: {
    startAt: "2026-10-21",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  sourceContentHash: "c".repeat(64),
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
  notes: ["primary document overrides title hint"],
}));
assert.equal(mismatch.registrationPreviewReady, true);
assert.equal(mismatch.warnings.length, 1, "title hint disagreement must be visible but not authoritative");

for (const outcome of ["NOT_A_FUTURE_EVENT", "INSUFFICIENT_EVIDENCE"] as const) {
  const result = assessTdnetPrimaryReview(candidate, decision({
    outcome,
    eventType: null,
    occurrenceKey: null,
    time: null,
    sourceContentHash: null,
    sourceRetrievedAt: null,
  }));
  assert.equal(result.registrationPreviewReady, false);
  assert.deepEqual(result.blockers, ["primary_review_not_confirmed"]);
}

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    outcome: "NOT_A_FUTURE_EVENT",
    eventType: "SHAREHOLDER_MEETING",
  })),
  /must not carry registration facts/,
);

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    sourceContentHash: "not-a-sha256",
  })),
  /sourceContentHash must be a 64-character lowercase hex SHA-256/,
);

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    candidateId: "tdc_wrong",
  })),
  /candidateId mismatch/,
);

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    reviewedAt: "2026-09-04T14:59:59+09:00",
  })),
  /reviewedAt must be on or after disclosurePublishedAt/,
);

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    sourceRetrievedAt: "2026-09-04T14:59:59+09:00",
  })),
  /sourceRetrievedAt must be on or after disclosurePublishedAt/,
);

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    sourceRetrievedAt: "2026-09-04T16:01:00+09:00",
  })),
  /reviewedAt must be on or after sourceRetrievedAt/,
);

for (const startAt of [
  "2026-09-04T15:59:59+09:00",
  "2026-09-04T16:00:00+09:00",
]) {
  assert.throws(
    () => assessTdnetPrimaryReview(candidate, decision({
      eventType: "PRESS_CONFERENCE",
      occurrenceKey: "press-conference-2026-09-04",
      time: {
        startAt,
        endAt: null,
        allDay: false,
        timezone: "Asia/Tokyo",
        precision: "EXACT",
        windowStart: null,
        windowEnd: null,
      },
      sourceContentHash: "e".repeat(64),
      sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
    })),
    /exact EventTime must be after reviewedAt/,
  );
}

assert.throws(
  () => assessTdnetPrimaryReview(candidate, decision({
    reviewedAt: "2026-09-04T16:00:00",
  })),
  /explicit timezone offset or Z/,
);

console.log("tdnet-primary-review: ok");
