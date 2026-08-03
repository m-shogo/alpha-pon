import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MARKET_EVENT_SCHEMA_VERSION,
  assertValidEventTime,
  buildDeliveryId,
  buildEventId,
  buildRevisionId,
  type MarketEvent,
} from "../src/market-events/contracts.js";
import {
  appendLedgerRecord,
  buildLatestEventProjection,
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
    occurrenceKey: "FY2026-Q1",
  }),
  "issuer display-name changes must not change identity when a code exists",
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
    sourceIds: ["src_a", "src_b"],
  }),
  "revision identity must be canonical across object/source ordering",
);

assert.throws(
  () =>
    buildRevisionId({
      eventId,
      revisionNumber: 2,
      facts: { unsupported: undefined },
      sourceIds: [],
    }),
  /must not contain undefined/,
  "unsupported non-JSON values must fail closed",
);

const deliveryId = buildDeliveryId({
  eventId,
  revisionId,
  channel: "GOOGLE_CALENDAR",
  scheduledAt: "2026-08-03T06:00:00Z",
});
assert.equal(
  deliveryId,
  buildDeliveryId({
    eventId,
    revisionId,
    channel: "GOOGLE_CALENDAR",
    scheduledAt: "2026-08-03T06:00:00Z",
  }),
  "delivery identity must be idempotent",
);

assert.throws(
  () =>
    assertValidEventTime({
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

const baseEvent: MarketEvent = {
  schemaVersion: MARKET_EVENT_SCHEMA_VERSION,
  eventId,
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "EARNINGS_RELEASE",
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
  createdAt: "2026-08-03T05:00:00Z",
  updatedAt: "2026-08-03T05:00:00Z",
};

const directory = mkdtempSync(join(tmpdir(), "alpha-pon-market-event-"));
const ledgerPath = join(directory, "market-events.jsonl");

try {
  appendLedgerRecord(ledgerPath, {
    recordType: "MARKET_EVENT",
    recordedAt: "2026-08-03T05:00:00Z",
    payload: baseEvent,
  });
  appendLedgerRecord(ledgerPath, {
    recordType: "MARKET_EVENT",
    recordedAt: "2026-08-03T05:10:00Z",
    payload: {
      ...baseEvent,
      status: "POSTPONED",
      time: {
        ...baseEvent.time,
        startAt: "2026-08-11T15:00:00+09:00",
      },
      updatedAt: "2026-08-03T05:10:00Z",
    },
  });

  const result = readLedger(ledgerPath);
  assert.equal(result.parseErrors.length, 0);
  assert.equal(result.records.length, 2);
  assert.equal(buildLatestEventProjection(result.records).get(eventId)?.status, "POSTPONED");

  writeFileSync(ledgerPath, `${JSON.stringify(result.records[0])}\n{broken-json}\n`, "utf8");
  const corrupted = readLedger(ledgerPath);
  assert.equal(corrupted.records.length, 1);
  assert.equal(corrupted.parseErrors.length, 1);
  assert.equal(corrupted.parseErrors[0]?.lineNumber, 2);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("market-event-foundation: ok");
