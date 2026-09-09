import assert from "node:assert/strict";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  buildLatestEventProjection,
  buildLatestRevisionProjection,
  recordsFromBundle,
  validateLedgerRecord,
} from "../src/market-events/local-ledger.js";

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
  decision: {
    confidenceState: "PARTIAL",
    reasons: ["ledger stable-id regression"],
  },
  deliveries: [{
    channel: "IN_APP",
    deliveryKey: "day-before",
    scheduledAt: "2026-08-09T06:00:00Z",
  }],
};

const bundle = buildMarketEventBundle(input, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});
const records = recordsFromBundle(bundle, "2026-08-03T05:00:00Z");
const eventRecord = records.find(record => record.recordType === "MARKET_EVENT");
const revisionRecord = records.find(record => record.recordType === "EVENT_REVISION");
const sourceRecord = records.find(record => record.recordType === "EVENT_SOURCE");
const decisionRecord = records.find(record => record.recordType === "DECISION_SNAPSHOT");
const deliveryRecord = records.find(record => record.recordType === "DELIVERY_OUTBOX");
assert(eventRecord);
assert(revisionRecord);
assert(sourceRecord);
assert(decisionRecord);
assert(deliveryRecord);

assert.throws(
  () => validateLedgerRecord({
    ...eventRecord,
    payload: { ...eventRecord.payload, eventId: "evt_000000000000000000000000" },
  }),
  /does not match canonical event identity/,
  "standalone ledger validation must reject forged event IDs",
);
assert.throws(
  () => validateLedgerRecord({
    ...revisionRecord,
    payload: { ...revisionRecord.payload, revisionId: "rev_000000000000000000000000" },
  }),
  /does not match canonical revision identity/,
  "standalone ledger validation must reject forged revision IDs",
);
assert.throws(
  () => validateLedgerRecord({
    ...sourceRecord,
    payload: { ...sourceRecord.payload, sourceId: "src_000000000000000000000000" },
  }),
  /does not match canonical source identity/,
  "standalone ledger validation must reject forged source IDs",
);
assert.throws(
  () => validateLedgerRecord({
    ...sourceRecord,
    payload: { ...sourceRecord.payload, authority: " sanrio_ir " },
  }),
  /Source authority must be canonical uppercase text/,
  "standalone ledger validation must reject source authority aliases that canonicalize to the same stable identity",
);
assert.throws(
  () => validateLedgerRecord({
    ...sourceRecord,
    payload: { ...sourceRecord.payload, url: `${sourceRecord.payload.url}#page=1` },
  }),
  /Source URL must not contain a fragment/,
  "standalone ledger validation must reject URL fragments that source identity intentionally ignores",
);
assert.throws(
  () => validateLedgerRecord({
    ...sourceRecord,
    payload: { ...sourceRecord.payload, url: "https://EXAMPLE.com/sanrio/fy2026-q1" },
  }),
  /Source URL must use the canonical URL serialization/,
  "standalone ledger validation must reject source URL aliases that canonicalize to the same stable identity",
);
assert.throws(
  () => validateLedgerRecord({
    ...decisionRecord,
    payload: { ...decisionRecord.payload, decisionSnapshotId: "dec_000000000000000000000000" },
  }),
  /does not match canonical decision identity/,
  "standalone ledger validation must reject forged decision snapshot IDs",
);
assert.throws(
  () => validateLedgerRecord({
    ...deliveryRecord,
    payload: { ...deliveryRecord.payload, deliveryId: "dlv_000000000000000000000000" },
  }),
  /does not match canonical delivery identity/,
  "standalone ledger validation must reject forged delivery IDs",
);
assert.throws(
  () => validateLedgerRecord({
    ...deliveryRecord,
    payload: { ...deliveryRecord.payload, deliveryKey: " Day Before " },
  }),
  /deliveryKey must be canonical/,
  "standalone ledger validation must reject delivery-key aliases that canonicalize to the same stable identity",
);

const exactEventReplay = [...records, eventRecord];
assert.equal(
  buildLatestEventProjection(exactEventReplay).get(bundle.event.eventId)?.title,
  bundle.event.title,
  "an exact market-event replay must remain idempotent",
);

const conflictingEventRecord = {
  ...eventRecord,
  payload: {
    ...eventRecord.payload,
    title: "Conflicting same-timestamp title",
  },
};
assert.throws(
  () => buildLatestEventProjection([...records, conflictingEventRecord]),
  /Conflicting market event replay/,
  "the same event/updatedAt must not resolve differently by ledger order",
);
assert.throws(
  () => buildLatestEventProjection([conflictingEventRecord, ...records]),
  /Conflicting market event replay/,
  "same-timestamp market-event conflict detection must be independent of ledger order",
);

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

const gapRevisionRecord = {
  ...revisionRecord,
  payload: {
    ...revisionRecord.payload,
    revisionId: "rev_gap_replay",
    revisionNumber: 3,
    previousRevisionId: revisionRecord.payload.revisionId,
  },
};
assert.throws(
  () => buildLatestRevisionProjection([...records, gapRevisionRecord]),
  /Revision continuity/,
  "local replay must reject a revision-number gap that D1 sync would reject",
);

const wrongPreviousRevisionRecord = {
  ...newerRevisionRecord,
  payload: {
    ...newerRevisionRecord.payload,
    previousRevisionId: "rev_wrong_previous",
  },
};
assert.throws(
  () => buildLatestRevisionProjection([...records, wrongPreviousRevisionRecord]),
  /previousRevisionId mismatch/,
  "local replay must reject broken append-only revision lineage",
);

console.log("market-event-ledger-replay: ok");