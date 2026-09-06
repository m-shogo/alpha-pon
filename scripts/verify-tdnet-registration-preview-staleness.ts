import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import type { TdnetPrimaryDocumentEvidence } from "../src/market-events/tdnet-primary-document-evidence.js";
import { assessTdnetPrimaryReview } from "../src/market-events/tdnet-primary-review.js";
import { prepareTdnetRegistrationPreview } from "../src/market-events/tdnet-registration-preview.js";

const candidate = classifyTdnetDisclosureCandidate({
  code: "4661",
  sourceCode: "46610",
  companyName: "オリエンタルランド",
  title: "決算発表予定日に関するお知らせ",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: "https://www.release.tdnet.info/inbs/140120260904000010.pdf",
});
if (!candidate) throw new Error("expected TDnet candidate");

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
  notes: [],
});

const evidence: TdnetPrimaryDocumentEvidence = {
  candidateId: candidate.candidateId,
  sourceUrl: candidate.sourceUrl,
  retrievedAt: "2026-09-04T15:05:00+09:00",
  contentHash: "d".repeat(64),
  byteLength: 1234,
  contentType: "application/pdf",
};

const metadata = {
  eventTitle: "FY2027 Q2 決算発表",
  status: "SCHEDULED" as const,
  priority: "S1" as const,
  whyItMatters: "決算発表後に仮説を更新するため",
};

assert.throws(
  () => prepareTdnetRegistrationPreview(
    candidate,
    assessment,
    { ...metadata, staleAfter: "2026-09-04T15:59:59+09:00" },
    evidence,
  ),
  /staleAfter must be on or after reviewedAt/,
  "a freshly reviewed TDnet registration preview must not be born already stale",
);

const equalBoundary = prepareTdnetRegistrationPreview(
  candidate,
  assessment,
  { ...metadata, staleAfter: assessment.normalized.reviewedAt },
  evidence,
);
assert.equal(equalBoundary.bundle.event.staleAfter, assessment.normalized.reviewedAt);

const futureBoundary = prepareTdnetRegistrationPreview(
  candidate,
  assessment,
  { ...metadata, staleAfter: "2026-09-05T16:00:00+09:00" },
  evidence,
);
assert.equal(futureBoundary.bundle.event.staleAfter, "2026-09-05T16:00:00+09:00");

console.log("tdnet-registration-preview-staleness: ok");
