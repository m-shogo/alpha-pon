import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  getNextRevisionContext,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

const base: MarketEventRegistrationInput = {
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
  currentDecisionState: "WAIT",
  whyItMatters: "決算で追加影響を確認する",
  observedAt: "2026-08-03T06:00:00Z",
  changeType: "CREATED",
  sources: [{
    authority: "SANRIO_IR",
    sourceType: "IR",
    url: "https://example.com/sanrio/rev1",
    title: "決算予定",
    publishedAt: "2026-08-01T06:00:00Z",
    retrievedAt: "2026-08-03T06:00:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY",
  }],
};

const db = openMarketEventDatabase({ path: ":memory:" });
try {
  const eventId = buildEventId(base);
  const revisionOne = buildMarketEventBundle(base, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, revisionOne);
  registerMarketEventBundle(db, revisionOne);

  assert.throws(
    () => db.prepare(`
      INSERT INTO event_revisions (
        revision_id, event_id, schema_version, revision_number, observed_at,
        change_type, facts_json, source_ids_json, previous_revision_id
      ) VALUES (?, ?, 1, 3, ?, 'UPDATED', '{}', '[]', ?)
    `).run(
      "rev_333333333333333333333333",
      eventId,
      "2026-08-03T07:00:00Z",
      revisionOne.revision.revisionId,
    ),
    /extend the latest revision by one/,
  );

  assert.throws(
    () => db.prepare(`
      INSERT INTO event_revisions (
        revision_id, event_id, schema_version, revision_number, observed_at,
        change_type, facts_json, source_ids_json, previous_revision_id
      ) VALUES (?, ?, 1, 2, ?, 'UPDATED', '{}', '[]', ?)
    `).run(
      "rev_222222222222222222222222",
      eventId,
      "2026-08-03T05:59:00Z",
      revisionOne.revision.revisionId,
    ),
    /observed_at must not move backwards|older than the current event projection/,
  );

  const revisionTwoInput: MarketEventRegistrationInput = {
    ...base,
    status: "POSTPONED",
    observedAt: "2026-08-03T07:00:00Z",
    changeType: "POSTPONED",
    time: { ...base.time, startAt: "2026-08-11T15:00:00+09:00" },
    sources: [{
      ...base.sources[0],
      url: "https://example.com/sanrio/rev2",
      title: "決算予定変更",
      retrievedAt: "2026-08-03T07:00:00Z",
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }],
  };
  const revisionTwo = buildMarketEventBundle(revisionTwoInput, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, revisionTwo);

  const pointer = db.prepare(`
    SELECT current_revision_id AS currentRevisionId
    FROM market_events
    WHERE event_id = ?
  `).get(eventId) as { currentRevisionId: string };
  assert.equal(pointer.currentRevisionId, revisionTwo.revision.revisionId);

  assert.throws(
    () => db.prepare("UPDATE event_revisions SET facts_json = '{}' WHERE revision_id = ?")
      .run(revisionTwo.revision.revisionId),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM event_revisions WHERE revision_id = ?")
      .run(revisionTwo.revision.revisionId),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("UPDATE event_sources SET title = 'changed' WHERE source_id = ?")
      .run(revisionOne.sources[0].sourceId),
    /append-only/,
  );

  const migrationVersions = (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: string }>)
    .map(row => row.version);
  assert.deepEqual(migrationVersions, [
    "0001_market_event_foundation",
    "0002_market_event_revision_guards",
  ]);

  console.log("market-event-revision-guards: ok");
} finally {
  db.close();
}
