import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import { assessTdnetPrimaryReview } from "../src/market-events/tdnet-primary-review.js";
import { prepareTdnetRegistrationPreview } from "../src/market-events/tdnet-registration-preview.js";
import { replayTdnetRegistrationPreviewIsolated } from "../src/market-events/tdnet-registration-replay.js";

const maybeCandidate = classifyTdnetDisclosureCandidate({
  code: "8136",
  sourceCode: "81360",
  companyName: "サンリオ",
  title: "定時株主総会招集ご通知",
  publishedAt: "2026-09-04T15:00:00+09:00",
  url: "https://www.release.tdnet.info/inbs/140120260904000101.pdf",
});
if (!maybeCandidate) throw new Error("fixture must classify as TDnet candidate");
const candidate = maybeCandidate;

const assessment = assessTdnetPrimaryReview(candidate, {
  candidateId: candidate.candidateId,
  reviewedAt: "2026-09-04T16:00:00+09:00",
  outcome: "FUTURE_EVENT_CONFIRMED",
  eventType: "SHAREHOLDER_MEETING",
  occurrenceKey: "agm-2026",
  time: {
    startAt: "2026-10-20",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  sourceContentHash: "e".repeat(64),
  sourceRetrievedAt: "2026-09-04T15:05:00+09:00",
  notes: ["primary document explicitly states meeting date"],
});
assert.equal(assessment.registrationPreviewReady, true);

const preview = prepareTdnetRegistrationPreview(candidate, assessment, {
  eventTitle: "2026年定時株主総会",
  status: "SCHEDULED",
  priority: "S1",
  whyItMatters: "総会後に仮説と開示内容を更新するため",
});

const report = replayTdnetRegistrationPreviewIsolated(preview.bundle);
assert.equal(report.status, "ok");
assert.equal(report.auditStatus, "ok");
assert.deepEqual(report.firstPass, {
  events: 1,
  revisions: 1,
  sources: 1,
  decisions: 0,
  outbox: 0,
  reviewTasks: 0,
});
assert.deepEqual(report.secondPass, report.firstPass);
assert.deepEqual(report.duplicateDelta, {
  events: 0,
  revisions: 0,
  sources: 0,
  decisions: 0,
  outbox: 0,
  reviewTasks: 0,
});
assert.equal(report.eventId, preview.bundle.event.eventId);
assert.equal(report.revisionId, preview.bundle.revision.revisionId);
assert.deepEqual(report.sourceIds, preview.bundle.sources.map(source => source.sourceId));

assert.throws(
  () => replayTdnetRegistrationPreviewIsolated({
    ...preview.bundle,
    deliveries: [{
      schemaVersion: 1,
      deliveryId: "dlv_0123456789abcdef01234567",
      deliveryKey: "forbidden",
      eventId: preview.bundle.event.eventId,
      revisionId: preview.bundle.revision.revisionId,
      channel: "IN_APP",
      state: "PENDING",
      payload: {},
      scheduledAt: "2026-10-19T00:00:00+09:00",
      attemptCount: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      lastError: null,
      leaseExpiresAt: null,
      createdAt: "2026-09-04T16:00:00+09:00",
      updatedAt: "2026-09-04T16:00:00+09:00",
    }],
  }),
  /rejects bundles with deliveries/,
);

console.log("tdnet-registration-replay: ok");
