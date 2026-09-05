import assert from "node:assert/strict";
import { classifyTdnetDisclosureCandidate } from "../src/market-events/tdnet-event-candidates.js";
import type { TdnetPrimaryDocumentEvidence } from "../src/market-events/tdnet-primary-document-evidence.js";
import { assessTdnetPrimaryReview } from "../src/market-events/tdnet-primary-review.js";
import { prepareTdnetRegistrationPreview } from "../src/market-events/tdnet-registration-preview.js";
import {
  auditMarketEventDatabase,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

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
  checksBefore: ["一次資料の日付を再確認"],
  checksAfter: ["決算内容と仮説差分を確認"],
};

const first = prepareTdnetRegistrationPreview(candidate, assessment, metadata, evidence);
const second = prepareTdnetRegistrationPreview(candidate, assessment, metadata, evidence);
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
assert.equal(first.bundle.sources[0]!.retrievedAt, evidence.retrievedAt);
assert.equal(first.bundle.sources[0]!.contentHash, evidence.contentHash);
assert.equal(first.bundle.sources[0]!.storageClass, "METADATA_ONLY");
assert.equal(first.input.facts?.sourcePublicationIsEventTime, false);
assert.equal(first.input.facts?.tdnetSourceCode, "46610", "raw five-digit TDnet source code must survive into preview provenance");
assert.equal(first.bundle.revision.facts.tdnetSourceCode, "46610");
assert.deepEqual(first.input.deliveries, []);

const replayDb = openMarketEventDatabase({ path: ":memory:" });
try {
  registerMarketEventBundle(replayDb, first.bundle);
  registerMarketEventBundle(replayDb, second.bundle);
  const replayAudit = auditMarketEventDatabase(replayDb, ":memory:");
  assert.equal(replayAudit.status, "ok", "TDnet preview replay must preserve SQLite integrity");
  assert.deepEqual(
    replayAudit.counts,
    {
      events: 1,
      revisions: 1,
      sources: 1,
      decisions: 0,
      outbox: 0,
      pendingDeliveries: 0,
      reviewTasks: 0,
    },
    "replaying identical reviewed TDnet evidence must be idempotent and must not create delivery/decision rows",
  );
} finally {
  replayDb.close();
}

assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, metadata),
  /requires bound primary document evidence/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, metadata, {
    ...evidence,
    candidateId: "tdc_other",
  }),
  /evidence candidateId mismatch/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, metadata, {
    ...evidence,
    sourceUrl: "https://www.release.tdnet.info/inbs/140120260904999999.pdf",
  }),
  /evidence sourceUrl mismatch/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, metadata, {
    ...evidence,
    contentHash: "e".repeat(64),
  }),
  /contentHash does not match reviewed evidence/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, metadata, {
    ...evidence,
    retrievedAt: "2026-09-04T15:06:00+09:00",
  }),
  /retrievedAt does not match reviewed evidence/,
);

for (const nonCanonicalUrl of [
  "https://www.release.tdnet.info/inbs/140120260904000010.pdf?download=1",
  "https://www.release.tdnet.info/inbs/140120260904000010.pdf#page=1",
]) {
  assert.throws(
    () => prepareTdnetRegistrationPreview(
      { ...candidate, sourceUrl: nonCanonicalUrl },
      assessment,
      metadata,
      evidence,
    ),
    /official TDnet source URL/,
  );
}
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "https://example.com/inbs/140120260904000010.pdf" },
    assessment,
    metadata,
    evidence,
  ),
  /official TDnet source URL/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "http://www.release.tdnet.info/inbs/140120260904000010.pdf" },
    assessment,
    metadata,
    evidence,
  ),
  /official TDnet source URL/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "https://www.release.tdnet.info:444/inbs/140120260904000010.pdf" },
    assessment,
    metadata,
    evidence,
  ),
  /official TDnet source URL/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "https://user:secret@www.release.tdnet.info/inbs/140120260904000010.pdf" },
    assessment,
    metadata,
    evidence,
  ),
  /official TDnet source URL/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceUrl: "https://www.release.tdnet.info/inbs/140120260904000010.html" },
    assessment,
    metadata,
    evidence,
  ),
  /official TDnet source URL/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(
    { ...candidate, sourceCode: "99990" },
    assessment,
    metadata,
    evidence,
  ),
  /sourceCode does not match issuerCode/,
);
for (const nonCanonicalSourceCode of ["4661", "4661-", "4661a", " 46610"] ) {
  assert.throws(
    () => prepareTdnetRegistrationPreview(
      { ...candidate, sourceCode: nonCanonicalSourceCode },
      assessment,
      metadata,
      evidence,
    ),
    /invalid sourceCode provenance/,
    "non-null TDnet sourceCode must preserve the raw canonical five-character viewer code",
  );
}
for (const normalizedIssuerCode of ["4661 ", " 4661", "04661"]) {
  assert.throws(
    () => prepareTdnetRegistrationPreview(
      { ...candidate, issuerCode: normalizedIssuerCode },
      assessment,
      metadata,
      evidence,
    ),
    /sourceCode does not match issuerCode/,
    "registration preview must not normalize issuerCode when binding raw TDnet sourceCode provenance",
  );
}

const legacyWithoutSourceCode = prepareTdnetRegistrationPreview(
  { ...candidate, sourceCode: null },
  assessment,
  metadata,
  evidence,
);
assert.equal(legacyWithoutSourceCode.input.facts?.tdnetSourceCode, null, "missing legacy sourceCode must remain null, not be inferred");

const forgedPastAssessment = {
  ...assessment,
  normalized: {
    ...assessment.normalized,
    time: {
      ...assessment.normalized.time!,
      startAt: "2026-09-03",
    },
  },
};
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, forgedPastAssessment, metadata, evidence),
  /FUTURE_EVENT_CONFIRMED DATE_ONLY EventTime must start after reviewedAt date/,
  "registration preview must revalidate the normalized primary review instead of trusting ready flags",
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
  () => prepareTdnetRegistrationPreview(candidate, assessment, { ...metadata, eventTitle: " " }, evidence),
  /eventTitle is required/,
);
assert.throws(
  () => prepareTdnetRegistrationPreview(candidate, assessment, { ...metadata, whyItMatters: " " }, evidence),
  /whyItMatters is required/,
);

console.log("tdnet-registration-preview: ok");
