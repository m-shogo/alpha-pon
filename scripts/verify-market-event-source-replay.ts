import assert from "node:assert/strict";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import { getNextRevisionContext, openMarketEventDatabase, registerMarketEventBundle } from "../src/market-events/sqlite-store.js";

const input: MarketEventRegistrationInput = {
  issuerCode: "8136",
  issuerName: "サンリオ",
  eventType: "EARNINGS_RELEASE",
  occurrenceKey: "fy2026-q1",
  title: "FY2026 Q1 決算発表",
  status: "SCHEDULED",
  priority: "S1",
  time: { startAt: "2026-08-10T15:00:00+09:00", endAt: null, allDay: false, timezone: "Asia/Tokyo", precision: "EXACT", windowStart: null, windowEnd: null },
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
  const eventId = buildEventId(input);
  const bundle = buildMarketEventBundle(input, getNextRevisionContext(db, eventId));
  registerMarketEventBundle(db, bundle);
  registerMarketEventBundle(db, bundle);

  const changedSourceReplay = {
    ...bundle,
    sources: bundle.sources.map((source, index) => index === 0 ? { ...source, title: "mutated immutable source title" } : source),
  };
  assert.throws(
    () => registerMarketEventBundle(db, changedSourceReplay),
    /event source replay payload mismatch/,
    "SQLite must reject a reused sourceId whose immutable source payload changed",
  );

  const persistedTitle = db.prepare("SELECT title FROM event_sources WHERE source_id = ?").get(bundle.sources[0].sourceId) as { title: string };
  assert.equal(persistedTitle.title, bundle.sources[0].title, "failed replay must leave the original source payload intact");
} finally {
  db.close();
}

console.log("market-event-source-replay: ok");
