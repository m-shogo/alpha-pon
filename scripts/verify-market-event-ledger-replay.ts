import assert from "node:assert/strict";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import { buildLatestRevisionProjection, recordsFromBundle } from "../src/market-events/local-ledger.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2026-Q1",
  title: "FY2026 Q1 決算発表",
  status: "SCHEDULED",
  priority: "S1",
  time: {
    startAt: "2026-08-10T15:00:00+09:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT",
    windowStart: null,
    windowEnd: null,
  },
  edgeTypes: [],
  currentDecisionState: "WAIT",
  whyItMatters: "replay regression fixture",
  checksBefore: [],
  checksAfter: [],
  observedAt: "2026-08-03T05:00:00Z",
  changeType: "CREATED",
  sources: [{
    authority: "SANRIO_IR",
    sourceType: "IR",
    url: "https://example.com/sanrio/fy2026-q1",
    title: "決算発表予定",
    publishedAt: "2026-08-01T06:00:00Z",
    retrievedAt: "2026-08-03T05:00:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY",
  }],
  decision: null,
  deliveries: [],
};

const bundle = buildMarketEventBundle(input, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});
const records = recordsFromBundle(bundle, "2026-08-03T05:00:00Z");
const revisionRecord = records.find(record => record.recordType === "EVENT_REVISION");
assert(revisionRecord);

const exactReplay = [...records, revisionRecord];
assert.equal(
  buildLatestRevisionProjection(exactReplay).get(bundle.event.eventId)?.revisionId,
  bundle.revision.revisionId,
  "an exact append-only replay must remain idempotent",
);

const mutatedSameIdReplay = {
  ...revisionRecord,
  payload: {
    ...revisionRecord.payload,
    changeType: "UPDATED" as const,
  },
};
assert.throws(
  () => buildLatestRevisionProjection([...records, mutatedSameIdReplay]),
  /Conflicting revision replay/,
  "a replay with the same revisionId but different revision metadata must fail closed",
);

const conflictingRevisionRecord = {
  ...revisionRecord,
  payload: {
    ...revisionRecord.payload,
    revisionId: "rev_conflicting_replay",
  },
};
const conflictingReplay = [...records, conflictingRevisionRecord];
assert.throws(
  () => buildLatestRevisionProjection(conflictingReplay),
  /Conflicting revision replay/,
  "the same event/revisionNumber must never resolve differently by ledger order",
);

assert.throws(
  () => buildLatestRevisionProjection([...conflictingReplay].reverse()),
  /Conflicting revision replay/,
  "conflicting replay detection must be independent of ledger order",
);

const newerRevisionRecord = {
  ...revisionRecord,
  payload: {
    ...revisionRecord.payload,
    revisionId: "rev_newer_replay",
    revisionNumber: 2,
    previousRevisionId: revisionRecord.payload.revisionId,
  },
};
assert.throws(
  () => buildLatestRevisionProjection([...records, newerRevisionRecord, conflictingRevisionRecord]),
  /Conflicting revision replay/,
  "an older conflicting revision must not be hidden after a newer revision becomes the projection",
);

console.log("market-event-ledger-replay: ok");
