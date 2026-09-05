import assert from "node:assert/strict";
import { validateMarketEventBundle } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "PRESS_CONFERENCE",
  occurrenceKey: "press-conference-2026-09-05",
  title: "一次資料で確認した記者会見",
  status: "SCHEDULED",
  priority: "S1",
  time: {
    startAt: "2026-09-05T10:00:00+09:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT",
    windowStart: null,
    windowEnd: null,
  },
  currentDecisionState: "INFO",
  whyItMatters: "source retrieval chronology must be preserved before registration",
  observedAt: "2026-09-04T15:05:00+09:00",
  publishedAt: "2026-09-04T15:00:00+09:00",
  effectiveAt: null,
  firstExecutableAt: null,
  changeType: "CREATED",
  sources: [{
    authority: "TDNET",
    sourceType: "TDNET",
    url: "https://www.release.tdnet.info/inbs/example.pdf",
    title: "一次資料",
    publishedAt: "2026-09-04T15:00:00+09:00",
    retrievedAt: "2026-09-04T15:06:00+09:00",
    contentHash: "a".repeat(64),
    storageClass: "METADATA_ONLY",
    objectKey: null,
  }],
  decision: null,
  deliveries: [],
};

assert.throws(
  () => buildMarketEventBundle(input, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /source\.retrievedAt must be on or before observedAt/,
  "registration must not claim an observation before the source was retrieved",
);

const validInput: MarketEventRegistrationInput = {
  ...input,
  observedAt: "2026-09-04T15:06:00+09:00",
};

assert.throws(
  () => buildMarketEventBundle({
    ...validInput,
    sources: validInput.sources.map(source => ({
      ...source,
      contentHash: "A".repeat(64),
    })),
  }, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /canonical lowercase SHA-256 contentHash/,
  "registration must reject uppercase source hashes instead of silently normalizing provenance",
);

assert.throws(
  () => buildMarketEventBundle({
    ...validInput,
    sources: validInput.sources.map(source => ({
      ...source,
      contentHash: ` ${"a".repeat(64)} `,
    })),
  }, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /canonical lowercase SHA-256 contentHash/,
  "registration must reject whitespace-padded source hashes instead of silently trimming provenance",
);

assert.throws(
  () => buildMarketEventBundle({
    ...validInput,
    sources: validInput.sources.map(source => ({
      ...source,
      url: `${source.url}#page=1`,
    })),
  }, {
    revisionNumber: 1,
    previousRevisionId: null,
    existingCreatedAt: null,
  }),
  /source\.url must not contain a fragment because source identity ignores URL fragments/,
  "registration must reject URL fragments instead of allowing different persisted source URLs to collapse onto the same sourceId",
);

const valid = buildMarketEventBundle(validInput, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});
assert.equal(valid.sources[0]?.retrievedAt, "2026-09-04T15:06:00+09:00");
assert.equal(valid.sources[0]?.contentHash, "a".repeat(64), "registration must preserve canonical source hashes exactly");

assert.throws(
  () => validateMarketEventBundle({
    ...valid,
    sources: valid.sources.map(source => ({
      ...source,
      retrievedAt: "2026-09-04T15:06:01+09:00",
    })),
  }),
  /source\.retrievedAt must be on or before observedAt/,
  "generic bundle validation must not allow referenced evidence to be retrieved after the revision was observed",
);

assert.throws(
  () => validateMarketEventBundle({
    ...valid,
    sources: valid.sources.map(source => ({
      ...source,
      publishedAt: "2026-09-04T15:06:01+09:00",
    })),
  }),
  /source\.publishedAt must be on or before source\.retrievedAt/,
  "generic bundle validation must not allow evidence to claim publication after retrieval",
);

assert.throws(
  () => validateMarketEventBundle({
    ...valid,
    sources: valid.sources.map(source => ({
      ...source,
      contentHash: "not-a-sha256",
    })),
  }),
  /source contentHash must be a lowercase SHA-256 hash/,
  "generic bundle validation must reject source provenance without a canonical SHA-256 content hash",
);

assert.throws(
  () => validateMarketEventBundle({
    ...valid,
    deliveries: [{
      schemaVersion: 1,
      deliveryId: "dlv_delivery_chronology_regression",
      deliveryKey: "chronology-regression",
      eventId: valid.event.eventId,
      revisionId: valid.revision.revisionId,
      channel: "IN_APP",
      state: "PENDING",
      payload: {},
      scheduledAt: "2026-09-05T10:00:00+09:00",
      attemptCount: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      lastError: null,
      leaseExpiresAt: null,
      createdAt: "2026-09-04T15:06:00+09:00",
      updatedAt: "2026-09-04T15:05:59+09:00",
    }],
  }),
  /delivery updatedAt must be on or after delivery createdAt/,
  "generic bundle validation must reject delivery state that predates delivery creation",
);

console.log("market-event-source-observation-chronology: ok");
