import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEventId } from "../src/market-events/contracts.js";
import { japanMarketDate, writeMarketEventArtifacts } from "../src/market-events/projection.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  auditMarketEventDatabase,
  getNextRevisionContext,
  listMarketEvents,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

const directory = mkdtempSync(join(tmpdir(), "alpha-pon-market-events-e2e-"));
const dbPath = join(directory, "market-events.db");
const jsonPath = join(directory, "alpha-pon-events.json");
const icsPath = join(directory, "alpha-pon-events.ics");

const firstInput: MarketEventRegistrationInput = {
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
  checksAfter: ["追加問題", "翌営業日の相対株価"],
  observedAt: "2026-08-03T06:00:00Z",
  publishedAt: "2026-08-01T06:00:00Z",
  firstExecutableAt: "2026-08-03T00:00:00Z",
  changeType: "CREATED",
  sources: [
    {
      authority: "SANRIO_IR",
      sourceType: "IR",
      url: "https://example.com/sanrio/fy2026-q1",
      title: "決算発表予定",
      publishedAt: "2026-08-01T06:00:00Z",
      retrievedAt: "2026-08-03T06:00:00Z",
      contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      storageClass: "METADATA_ONLY",
    },
  ],
  decision: {
    confidenceState: "PARTIAL",
    reasons: ["決算発表前のため業績影響は未確定"],
    invalidationConditions: ["追加の会計問題が確認された場合はBLOCK"],
  },
  deliveries: [
    {
      channel: "IN_APP",
      deliveryKey: "day-before",
      scheduledAt: "2026-08-09T06:00:00Z",
    },
  ],
};

const unknownDateInput: MarketEventRegistrationInput = {
  issuerCode: "9999",
  issuerName: "検証会社",
  eventType: "THIRD_PARTY_COMMITTEE_REPORT",
  occurrenceKey: "third-party-final-2026",
  title: "第三者委員会最終報告",
  status: "UNKNOWN_DATE",
  priority: "S1",
  time: {
    startAt: null,
    endAt: null,
    allDay: false,
    timezone: "Asia/Tokyo",
    precision: "UNKNOWN",
    windowStart: null,
    windowEnd: null,
  },
  currentDecisionState: "WAIT",
  whyItMatters: "追加不正と損失上限を確認する",
  observedAt: "2026-08-03T06:30:00Z",
  changeType: "CREATED",
  sources: [
    {
      authority: "TEST_IR",
      sourceType: "IR",
      url: "https://example.com/test/investigation",
      title: "調査開始のお知らせ",
      publishedAt: "2026-08-03T06:20:00Z",
      retrievedAt: "2026-08-03T06:30:00Z",
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      storageClass: "METADATA_ONLY",
    },
  ],
  decision: {
    confidenceState: "UNKNOWN",
    reasons: ["報告時期と調査範囲が未確定"],
  },
};

assert.equal(japanMarketDate("2026-08-11T14:59:59Z"), "2026-08-11");
assert.equal(japanMarketDate("2026-08-11T15:00:00Z"), "2026-08-12");
assert.equal(japanMarketDate("2026-08-12T00:00:00+09:00"), "2026-08-12");

const db = openMarketEventDatabase({ path: dbPath });
try {
  const eventId = buildEventId(firstInput);
  const first = buildMarketEventBundle(firstInput, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, first);
  registerMarketEventBundle(db, first);

  let audit = auditMarketEventDatabase(db, dbPath);
  assert.equal(audit.status, "ok");
  assert.equal(audit.counts.events, 1);
  assert.equal(audit.counts.revisions, 1);
  assert.equal(audit.counts.sources, 1);
  assert.equal(audit.counts.outbox, 1);

  const postponedInput: MarketEventRegistrationInput = {
    ...firstInput,
    status: "POSTPONED",
    time: {
      ...firstInput.time,
      startAt: "2026-08-11T15:00:00+09:00",
    },
    observedAt: "2026-08-03T07:00:00Z",
    publishedAt: "2026-08-03T06:55:00Z",
    changeType: "POSTPONED",
    sources: [
      {
        ...firstInput.sources[0],
        url: "https://example.com/sanrio/fy2026-q1-postponed",
        title: "決算発表日変更のお知らせ",
        publishedAt: "2026-08-03T06:55:00Z",
        retrievedAt: "2026-08-03T07:00:00Z",
        contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
    ],
    deliveries: [],
  };
  const postponed = buildMarketEventBundle(postponedInput, getNextRevisionContext(db, eventId));
  assert.equal(postponed.event.eventId, first.event.eventId, "postponement must keep event identity");
  registerMarketEventBundle(db, postponed);

  const unknownId = buildEventId(unknownDateInput);
  const unknown = buildMarketEventBundle(unknownDateInput, getNextRevisionContext(db, unknownId));
  registerMarketEventBundle(db, unknown);

  const events = listMarketEvents(db, { includeCancelled: true });
  assert.equal(events.length, 2);
  assert.equal(events.find(event => event.eventId === eventId)?.status, "POSTPONED");

  const generated = writeMarketEventArtifacts(db, {
    jsonPath,
    icsPath,
    generatedAt: "2026-08-03T07:30:00Z",
    databasePath: dbPath,
  });
  assert.equal(generated.summary.total, 2);
  assert.equal(generated.summary.calendarIncluded, 1);
  assert.equal(generated.summary.calendarExcludedUnknownDate, 1);

  const generatedAfterJstMidnight = writeMarketEventArtifacts(db, {
    jsonPath,
    icsPath,
    generatedAt: "2026-08-11T20:00:00Z",
    databasePath: dbPath,
  });
  assert.equal(
    generatedAfterJstMidnight.summary.nextEventAt,
    null,
    "prior-day Japan market events must not remain as nextEventAt after JST midnight",
  );

  const json = JSON.parse(readFileSync(jsonPath, "utf8")) as { events: Array<{ eventId: string }> };
  assert.equal(json.events.length, 2);
  const ics = readFileSync(icsPath, "utf8");
  assert.match(ics, new RegExp(`UID:${eventId}@alpha-pon`));
  assert.doesNotMatch(ics, new RegExp(`UID:${unknownId}@alpha-pon`));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);

  audit = auditMarketEventDatabase(db, dbPath);
  assert.equal(audit.status, "ok");
  assert.equal(audit.counts.revisions, 3);
  console.log("market-event-end-to-end: ok");
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
