import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  auditMarketEventDatabase,
  getNextRevisionContext,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "4661",
  issuerName: "検証会社",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2027-Q2-revision-audit",
  title: "FY2027 Q2 決算発表",
  status: "SCHEDULED",
  priority: "S1",
  time: {
    startAt: "2026-10-30",
    endAt: null,
    allDay: true,
    timezone: "Asia/Tokyo",
    precision: "DATE_ONLY",
    windowStart: null,
    windowEnd: null,
  },
  currentDecisionState: "INFO",
  whyItMatters: "revision chronology audit regression",
  observedAt: "2026-09-04T07:00:00Z",
  publishedAt: "2026-09-04T06:00:00Z",
  firstExecutableAt: "2026-09-04T07:01:00Z",
  changeType: "CREATED",
  sources: [{
    authority: "TDNET",
    sourceType: "TDNET",
    url: "https://www.release.tdnet.info/inbs/140120260904000012.pdf",
    title: "決算発表予定日に関するお知らせ",
    publishedAt: "2026-09-04T06:00:00Z",
    retrievedAt: "2026-09-04T06:05:00Z",
    contentHash: "c".repeat(64),
    storageClass: "METADATA_ONLY",
  }],
  decision: null,
  deliveries: [],
};

const db = openMarketEventDatabase({ path: ":memory:" });
try {
  const eventId = buildEventId(input);
  const bundle = buildMarketEventBundle(input, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, bundle);
  assert.equal(auditMarketEventDatabase(db, ":memory:").status, "ok");

  const revisionId = bundle.revision.revisionId;
  db.exec("DROP TRIGGER trg_event_revisions_no_update");
  db.prepare("UPDATE event_revisions SET published_at = ? WHERE revision_id = ?").run(
    "2026-09-04T07:00:01Z",
    revisionId,
  );
  let audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject publication after observation");
  assert.ok(
    audit.invalidRevisionRows.some(
      row => row.revisionId === revisionId && /publishedAt must be on or before observedAt/.test(row.message),
    ),
    "central audit must identify revision publication/observation chronology corruption",
  );

  db.prepare("UPDATE event_revisions SET published_at = ?, first_executable_at = ? WHERE revision_id = ?").run(
    bundle.revision.publishedAt,
    "2026-09-04T06:59:59Z",
    revisionId,
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject execution before observation");
  assert.ok(
    audit.invalidRevisionRows.some(
      row => row.revisionId === revisionId && /firstExecutableAt must be on or after observedAt/.test(row.message),
    ),
    "central audit must identify revision observation/execution chronology corruption",
  );
} finally {
  db.close();
}

console.log("market-event-audit-revision-chronology: ok");
