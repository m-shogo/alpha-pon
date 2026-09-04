import assert from "node:assert/strict";
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

const valid = buildMarketEventBundle({
  ...input,
  observedAt: "2026-09-04T15:06:00+09:00",
}, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});
assert.equal(valid.sources[0]?.retrievedAt, "2026-09-04T15:06:00+09:00");

console.log("market-event-source-observation-chronology: ok");
