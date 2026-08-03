import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertValidEventTime,
  buildDeliveryId,
  buildEventId,
  buildRevisionId,
} from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  appendLedgerBundle,
  buildLatestEventProjection,
  buildLatestRevisionProjection,
  readLedger,
} from "../src/market-events/local-ledger.js";

const eventId = buildEventId({
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2026-Q1",
});

assert.equal(
  eventId,
  buildEventId({
    issuerCode: "8136",
    issuerName: "株式会社サンリオ（表示名変更後）",
    eventType: "EARNINGS_RELEASE",
    occurrenceKey: "fy2026-q1",
  }),
  "issuer display-name and occurrence-key casing changes must not change identity when a code exists",
);

assert.notEqual(
  eventId,
  buildEventId({
    issuerCode: "8136",
    issuerName: "サンリオ",
    eventType: "EARNINGS_RELEASE",
    occurrenceKey: "FY2026-Q2",
  }),
  "different occurrence must receive a different event identity",
);

const revisionId = buildRevisionId({
  eventId,
  revisionNumber: 1,
  facts: { status: "SCHEDULED", startAt: "2026-08-10T15:00:00+09:00" },
  sourceIds: ["src_b", "src_a"],
});
assert.equal(
  revisionId,
  buildRevisionId({
    eventId,
    revisionNumber: 1,
    facts: { startAt: "2026-08-10T15:00:00+09:00", status: "SCHEDULED" },
    sourceIds: ["src_a", "src_b", "src_a"],
  }),
  "revision identity must be canonical across object/source ordering and duplicate source IDs",
);

assert.throws(
  () => buildRevisionId({ eventId, revisionNumber: 2, facts: { unsupported: undefined }, sourceIds: [] }),
  /must not contain undefined/,
  "unsupported non-JSON values must fail closed",
);

const deliveryId = buildDeliveryId({
  eventId,
  revisionId,
  channel: "IN_APP",
  deliveryKey: "day-before",
  scheduledAt: "2026-08-09T06:00:00Z",
});
assert.equal(
  deliveryId,
  buildDeliveryId({
    eventId,
    revisionId,
    channel: "IN_APP",
    deliveryKey: "DAY-BEFORE",
    scheduledAt: "2026-08-09T06:00:00Z",
  }),
  "delivery identity must be idempotent",
);

assert.throws(
  () => assertValidEventTime({
    startAt: "2026-08-10T15:00:00+09:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "UNKNOWN",
    windowStart: null,
    windowEnd: null,
  }),
  /must not contain invented dates/,
);

assert.throws(
  () => assertValidEventTime({
    startAt: "2026-08-10T15:00:00",
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "EXACT",
    windowStart: null,
    windowEnd: null,
  }),
  /explicit timezone/,
);

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
  edgeTypes: ["PERSONAL_EXECUTIVE_SHOCK"],
  currentDecisionState: "WAIT",
  whyItMatters: "不祥事後の業績影響と追加事実を確認する",
  checksBefore: ["会社予想", "不祥事関連費用"],
  checksAfter: ["追加問題", "翌営業日株価反応"],
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
    reasons: ["決算前のため影響未確定"],
  },
  deliveries: [{
    channel: "IN_APP",
    deliveryKey: "day-before",
    scheduledAt: "2026-08-09T06:00:00Z",
  }],
};

const firstBundle = buildMarketEventBundle(input, {
  revisionNumber: 1,
  previousRevisionId: null,
  existingCreatedAt: null,
});
const secondBundle = buildMarketEventBundle({
  ...input,
  status: "POSTPONED",
  observedAt: "2026-08-03T05:10:00Z",
  changeType: "POSTPONED",
  time: { ...input.time, startAt: "2026-08-11T15:00:00+09:00" },
  sources: [{
    ...input.sources[0],
    url: "https://example.com/sanrio/fy2026-q1-postponed",
    contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    retrievedAt: "2026-08-03T05:10:00Z",
  }],
  deliveries: [],
}, {
  revisionNumber: 2,
  previousRevisionId: firstBundle.revision.revisionId,
  existingCreatedAt: firstBundle.event.createdAt,
});

const directory = mkdtempSync(join(tmpdir(), "alpha-pon-market-event-"));
const ledgerPath = join(directory, "market-events.jsonl");
try {
  appendLedgerBundle(ledgerPath, firstBundle, "2026-08-03T05:00:00Z");
  appendLedgerBundle(ledgerPath, secondBundle, "2026-08-03T05:10:00Z");
  const result = readLedger(ledgerPath);
  assert.equal(result.parseErrors.length, 0);
  assert.equal(result.records.length, 9);
  assert.equal(buildLatestEventProjection(result.records).get(eventId)?.status, "POSTPONED");
  assert.equal(buildLatestRevisionProjection(result.records).get(eventId)?.revisionNumber, 2);

  writeFileSync(ledgerPath, `${JSON.stringify(result.records[0])}\n{broken-json}\n`, "utf8");
  const corrupted = readLedger(ledgerPath);
  assert.equal(corrupted.records.length, 1);
  assert.equal(corrupted.parseErrors.length, 1);
  assert.equal(corrupted.parseErrors[0]?.lineNumber, 2);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("market-event-foundation: ok");
