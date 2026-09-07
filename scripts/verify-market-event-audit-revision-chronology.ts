import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import { validateMarketEventRevisionChronology } from "../src/market-events/revision-chronology.js";
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

const otherInput: MarketEventRegistrationInput = {
  ...input,
  issuerCode: "8136",
  issuerName: "別検証会社",
  occurrenceKey: "FY2027-Q2-revision-audit-other",
  title: "別会社 FY2027 Q2 決算発表",
  sources: [{
    ...input.sources[0]!,
    url: "https://www.release.tdnet.info/inbs/140120260904000013.pdf",
    contentHash: "d".repeat(64),
  }],
};

assert.throws(
  () => validateMarketEventRevisionChronology({
    observedAt: "2026-09-04T07:00:00",
    publishedAt: null,
    firstExecutableAt: null,
  }),
  /observedAt must be an ISO-8601 timestamp with explicit timezone/,
  "revision chronology must validate observedAt even when optional bounds are absent",
);

const db = openMarketEventDatabase({ path: ":memory:" });
try {
  const eventId = buildEventId(input);
  const bundle = buildMarketEventBundle(input, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, bundle);

  const otherEventId = buildEventId(otherInput);
  const otherBundle = buildMarketEventBundle(otherInput, getNextRevisionContext(db, otherEventId));
  registerMarketEventBundle(db, otherBundle);

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

  db.prepare("UPDATE event_revisions SET first_executable_at = ?, source_ids_json = ? WHERE revision_id = ?").run(
    bundle.revision.firstExecutableAt,
    JSON.stringify([otherBundle.sources[0]!.sourceId]),
    revisionId,
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject cross-event revision source references");
  assert.ok(
    audit.invalidRevisionRows.some(
      row => row.revisionId === revisionId && /references invalid source/.test(row.message),
    ),
    "central audit must identify a revision source that belongs to another event",
  );

  db.prepare("UPDATE event_revisions SET source_ids_json = ? WHERE revision_id = ?").run(
    JSON.stringify(["src_missing_revision_audit"]),
    revisionId,
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject missing revision source references");
  assert.ok(
    audit.invalidRevisionRows.some(
      row => row.revisionId === revisionId && /references invalid source src_missing_revision_audit/.test(row.message),
    ),
    "central audit must identify a revision source ID that does not exist",
  );

  db.prepare("UPDATE event_revisions SET source_ids_json = ? WHERE revision_id = ?").run(
    JSON.stringify(bundle.revision.sourceIds),
    revisionId,
  );
  db.exec("DROP TRIGGER trg_event_sources_no_update");
  db.prepare("UPDATE event_sources SET retrieved_at = ? WHERE source_id = ?").run(
    "2026-09-04T07:00:01Z",
    bundle.sources[0]!.sourceId,
  );
  audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject source retrieval after revision observation");
  assert.ok(
    audit.invalidRevisionRows.some(
      row => row.revisionId === revisionId && /retrieved after observed_at/.test(row.message),
    ),
    "central audit must identify source evidence that was not yet retrieved when the revision was observed",
  );
} finally {
  db.close();
}

console.log("market-event-audit-revision-chronology: ok");
