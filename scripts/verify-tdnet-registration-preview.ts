import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import { assessTdnetPrimaryReview } from "../src/market-events/tdnet-primary-review.js";
import { prepareTdnetRegistrationPreview } from "../src/market-events/tdnet-registration-preview.js";

const maybeCandidate = classifyTdnetDisclosureCandidate({
  code: "4661",
  sourceCode: "46610",
  companyName: "オリエンタルランド",
  title: "決算発表予定日に関するお知らせ",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: "https://www.release.tdnet.info/inbs/140120260904000010.pdf",
});
if (!maybeCandidate) throw new Error("earnings disclosure must classify as a TDnet candidate");
const candidate = maybeCandidate;

const assessment = assessTdnetPrimaryReview(candidate, {
  candidateId: candidate.candidateId,
  reviewedAt: "2026-09-04T16:00:00+09:00",
  outcome: "FUTURE_EVENT_CONFIRMED",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2027-Q2",
  time: {
    startAt: "2026-10-30",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  sourceContentHash: "d".repeat(64),
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
  notes: ["primary document explicitly states the earnings release date"],
});
assert.equal(assessment.registrationPreviewReady, true);

const metadata = {
  eventTitle: "FY2027 Q2 決算発表",
  status: "SCHEDULED" as const,
  priority: "S1" as const,
  whyItMatters: "決算発表後に仮説を更新するため",
  checksBefore: ["一次資料の日付を再確認"],
  checksAfter: ["決算内容と仮説差分を確認"],
};

const first = prepareTdnetRegistrationPreview(candidate, assessment, metadata);
const second = prepareTdnetRegistrationPreview(candidate, assessment, metadata);
assert.deepEqual(first, second, "same reviewed evidence must produce a deterministic preview");

assert.match(first.bundle.event.eventId, /^evt_[0-9a-f]{24}$/);
assert.match(first.bundle.revision.revisionId, /^rev_[0-9a-f]{24}$/);
assert.equal(first.bundle.sources.length, 1);
assert.match(first.bundle.sources[0]!.sourceId, /^src_[0-9a-f]{24}$/);
assert.equal(first.bundle.deliveries.length, 0);
assert.equal(first.bundle.decisionSnapshot, null);
assert.equal(first.bundle.event.currentDecisionState, "INFO");
assert.equal(first.bundle.event.time.startAt, "2026-10-30");
assert.equal(first.bundle.revision.publishedAt, candidate.disclosurePublishedAt);
assert.equal(first.bundle.revision.firstExecutableAt, null);
assert.equal(first.bundle.sources[0]!.publishedAt, candidate.disclosurePublishedAt);
assert.equal(first.bundle.sources[0]!.retrievedAt, "2026-09-04T15:05:00+09:00");
assert.equal(first.bundle.sources[0]!.contentHash, "d".repeat(64));
assert.equal(first.bundle.sources[0]!.storageClass, "METADATA_ONLY");
assert.equal(first.input.facts?.sourcePublicationIsEventTime, false);
assert.deepEqual(first.input.deliveries, []);

assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "https://example.com/inbs/140120260904000010.pdf" },
    assessment,
    metadata,
  ),
  /official TDnet source URL/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "http://www.release.tdnet.info/inbs/140120260904000010.pdf" },
    assessment,
    metadata,
  ),
  /official TDnet source URL/,
);

const incompleteAssessment = assessTdnetPrimaryReview(candidate, {
  candidateId: candidate.candidateId,
  reviewedAt: "2026-09-04T16:00:00+09:00",
  outcome: "FUTURE_EVENT_CONFIRMED",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: null,
  time: null,
  sourceContentHash: null,
  sourceRetrievedAt: null,
  notes: [],
});
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, incompleteAssessment, metadata),
  /registration preview is blocked/,
);

const rejectedAssessment = assessTdnetPrimaryReview(candidate, {
  candidateId: candidate.candidateId,
  reviewedAt: "2026-09-04T16:00:00+09:00",
  outcome: "NOT_A_FUTURE_EVENT",
  eventType: null,
  occurrenceKey: null,
  time: null,
  sourceContentHash: null,
  sourceRetrievedAt: null,
  notes: ["document contains no future scheduled event"],
});
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, rejectedAssessment, metadata),
  /requires FUTURE_EVENT_CONFIRMED/,
);

assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, { ...metadata, eventTitle: " " }),
  /eventTitle is required/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, { ...metadata, whyItMatters: " " }),
  /whyItMatters is required/,
);

console.log("tdnet-registration-preview: ok");
