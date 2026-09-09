import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  auditMarketEventDatabase,
  getNextRevisionContext,
  listEventSources,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "4661",
  issuerName: "検証会社",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "FY2027-Q2",
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
  whyItMatters: "source provenance audit regression",
  observedAt: "2026-09-04T07:00:00Z",
  publishedAt: "2026-09-04T06:00:00Z",
  firstExecutableAt: null,
  changeType: "CREATED",
  sources: [{
    authority: "TDNET",
    sourceType: "TDNET",
    url: "https://www.release.tdnet.info/inbs/140120260904000010.pdf",
    title: "決算発表予定日に関するお知らせ",
    publishedAt: "2026-09-04T06:00:00Z",
    retrievedAt: "2026-09-04T06:05:00Z",
    contentHash: "a".repeat(64),
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
  const sourceId = bundle.sources[0].sourceId;
  assert.equal(auditMarketEventDatabase(db, ":memory:").status, "ok");

  db.exec("DROP TRIGGER trg_event_sources_no_update");
  db.prepare("UPDATE event_sources SET content_hash = ? WHERE source_id = ?").run("A".repeat(64), sourceId);
  assert.throws(
    () => listEventSources(db, eventId),
    /content_hash must be a lowercase SHA-256 hash/,
    "read path must reject non-canonical persisted source hashes",
  );
  let audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject non-canonical persisted source hashes");
  assert.ok(
    audit.invalidSourceRows.some(row => row.sourceId === sourceId && /content_hash/.test(row.message)),
    "central audit must identify the source row with invalid hash provenance",
  );

  db.prepare("UPDATE event_sources SET content_hash = ?, authority = ? WHERE source_id = ?").run(
    bundle.sources[0].contentHash,
    " tdnet ",
    sourceId,
  );
  assert.throws(
    () => listEventSources(db, eventId),
    /authority must be canonical uppercase text without surrounding or repeated whitespace/,
    "read path must reject persisted source authority aliases that registration forbids",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject non-canonical persisted source authority");
  assert.ok(
    audit.invalidSourceRows.some(row => row.sourceId === sourceId && /authority must be canonical uppercase text/.test(row.message)),
    "central audit must identify the source row with non-canonical authority provenance",
  );

  db.prepare("UPDATE event_sources SET authority = ?, url = ? WHERE source_id = ?").run(
    bundle.sources[0].authority,
    `${bundle.sources[0].url}#page=1`,
    sourceId,
  );
  assert.throws(
    () => listEventSources(db, eventId),
    /url must not contain a fragment/,
    "read path must reject persisted source URL fragments that registration forbids",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject persisted source URL fragments");
  assert.ok(
    audit.invalidSourceRows.some(row => row.sourceId === sourceId && /url must not contain a fragment/.test(row.message)),
    "central audit must identify the source row with fragment-bearing URL provenance",
  );

  db.prepare("UPDATE event_sources SET url = ? WHERE source_id = ?").run("https://RELEASE.TDNET.INFO/inbs/140120260904000010.pdf", sourceId);
  assert.throws(
    () => listEventSources(db, eventId),
    /url must use canonical URL serialization/,
    "read path must reject persisted source URL aliases that registration forbids",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject non-canonical persisted source URLs");
  assert.ok(
    audit.invalidSourceRows.some(row => row.sourceId === sourceId && /url must use canonical URL serialization/.test(row.message)),
    "central audit must identify the source row with non-canonical URL provenance",
  );

  db.prepare("UPDATE event_sources SET url = ? WHERE source_id = ?").run("https://%", sourceId);
  assert.throws(
    () => listEventSources(db, eventId),
    /url must be a valid absolute URL/,
    "read path must reject malformed persisted source URLs even when they start with https",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject malformed persisted source URLs");
  assert.ok(
    audit.invalidSourceRows.some(row => row.sourceId === sourceId && /valid absolute URL/.test(row.message)),
    "central audit must identify the source row with malformed URL provenance",
  );

  db.prepare("UPDATE event_sources SET url = ?, published_at = ?, retrieved_at = ? WHERE source_id = ?").run(
    bundle.sources[0].url,
    "2026-09-04T06:05:01Z",
    "2026-09-04T06:05:00Z",
    sourceId,
  );
  assert.throws(
    () => listEventSources(db, eventId),
    /published_at must be on or before retrieved_at/,
    "read path must reject impossible persisted source chronology",
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject impossible source chronology");
  assert.ok(
    audit.invalidSourceRows.some(row => row.sourceId === sourceId && /published_at must be on or before retrieved_at/.test(row.message)),
    "central audit must identify the source row with impossible chronology",
  );
} finally {
  db.close();
}

console.log("market-event-audit-source-provenance: ok");
