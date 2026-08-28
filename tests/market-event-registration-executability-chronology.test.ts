import assert from "node:assert/strict";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import { validateLedgerRecord } from "../src/market-events/local-ledger.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "Sanrio",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2026-Q1",
  title: "Fixture event",
  status: "SCHEDULED",
  priority: "S1",
  time: {
    startAt: "2026-08-30T15:00:00+09:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT",
    windowStart: null,
    windowEnd: null,
  },
  whyItMatters: "PIT chronology fixture",
  observedAt: "2026-08-28T10:00:00Z",
  firstExecutableAt: "2026-08-28T09:59:59Z",
  changeType: "CREATED",
  sources: [{
    authority: "FIXTURE",
    sourceType: "IR",
    url: "https://example.com/fixture",
    title: "Fixture source",
    publishedAt: "2026-08-28T09:00:00Z",
    retrievedAt: "2026-08-28T09:30:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY",
  }],
};

assert.throws(
  () => buildMarketEventBundle(input, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /firstExecutableAt must be on or after observedAt/,
  "registration must fail closed when executability predates observation",
);

const validBundle = buildMarketEventBundle({
  ...input,
  firstExecutableAt: "2026-08-28T10:00:00Z",
}, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});

assert.throws(
  () => validateLedgerRecord({
    recordType: "EVENT_SOURCE",
    recordedAt: "2026-08-28T09:29:59Z",
    payload: validBundle.sources[0]!,
  }),
  /recordedAt must be on or after retrievedAt/,
  "source ledger metadata must not claim persistence before retrieval",
);

validateLedgerRecord({
  recordType: "EVENT_SOURCE",
  recordedAt: "2026-08-28T09:30:00Z",
  payload: validBundle.sources[0]!,
});

assert.throws(
  () => validateLedgerRecord({
    recordType: "EVENT_REVISION",
    recordedAt: "2026-08-28T09:59:59Z",
    payload: validBundle.revision,
  }),
  /recordedAt must be on or after observedAt/,
  "revision ledger metadata must not claim persistence before observation",
);

validateLedgerRecord({
  recordType: "EVENT_REVISION",
  recordedAt: "2026-08-28T10:00:00Z",
  payload: validBundle.revision,
});

const decisionSnapshot = {
  schemaVersion: validBundle.event.schemaVersion,
  decisionSnapshotId: "dec_fixture",
  eventId: validBundle.event.eventId,
  revisionId: validBundle.revision.revisionId,
  decisionState: "INFO" as const,
  confidenceState: "CONFIRMED" as const,
  reasons: ["fixture"],
  invalidationConditions: [],
  createdAt: "2026-08-28T10:00:00Z",
};

assert.throws(
  () => validateLedgerRecord({
    recordType: "DECISION_SNAPSHOT",
    recordedAt: "2026-08-28T09:59:59Z",
    payload: decisionSnapshot,
  }),
  /recordedAt must be on or after decision createdAt/,
  "decision ledger metadata must not claim persistence before decision creation",
);

validateLedgerRecord({
  recordType: "DECISION_SNAPSHOT",
  recordedAt: "2026-08-28T10:00:00Z",
  payload: decisionSnapshot,
});

const deliveryOutbox = {
  schemaVersion: validBundle.event.schemaVersion,
  deliveryId: "dlv_fixture",
  deliveryKey: "fixture",
  eventId: validBundle.event.eventId,
  revisionId: validBundle.revision.revisionId,
  channel: "LINE" as const,
  state: "PENDING" as const,
  payload: { fixture: true },
  scheduledAt: "2026-08-28T10:00:00Z",
  attemptCount: 0,
  lastAttemptAt: null,
  deliveredAt: null,
  lastError: null,
  leaseExpiresAt: null,
  createdAt: "2026-08-28T10:00:00Z",
  updatedAt: "2026-08-28T10:00:00Z",
};

assert.throws(
  () => validateLedgerRecord({
    recordType: "DELIVERY_OUTBOX",
    recordedAt: "2026-08-28T09:59:59Z",
    payload: deliveryOutbox,
  }),
  /recordedAt must be on or after delivery createdAt/,
  "delivery ledger metadata must not claim persistence before delivery creation",
);

validateLedgerRecord({
  recordType: "DELIVERY_OUTBOX",
  recordedAt: "2026-08-28T10:00:00Z",
  payload: deliveryOutbox,
});

assert.throws(
  () => validateLedgerRecord({
    recordType: "DELIVERY_OUTBOX",
    recordedAt: "2026-08-28T10:00:00Z",
    payload: {
      ...deliveryOutbox,
      updatedAt: "2026-08-28T09:59:59Z",
    },
  }),
  /delivery updatedAt must be on or after delivery createdAt/,
  "delivery ledger must not accept an update timestamp before creation",
);

for (const fieldName of ["lastAttemptAt", "deliveredAt", "leaseExpiresAt"] as const) {
  assert.throws(
    () => validateLedgerRecord({
      recordType: "DELIVERY_OUTBOX",
      recordedAt: "2026-08-28T10:00:00Z",
      payload: {
        ...deliveryOutbox,
        [fieldName]: "not-a-time",
      },
    }),
    /must be a strict ISO timestamp with an explicit timezone offset or Z/,
    `delivery ledger must reject malformed ${fieldName}`,
  );
}

console.log("market event registration executability chronology: fail-closed OK");