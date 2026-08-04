'use strict'

import assert from "node:assert/strict";
import { buildD1BootstrapExport } from "../src/market-events/d1-bootstrap-export.js";
import { buildEventId } from "../src/market-events/contracts.js";
import { buildMarketEventBundle, type MarketEventRegistrationInput } from "../src/market-events/registration.js";
import {
  auditMarketEventDatabase,
  getNextRevisionContext,
  openMarketEventDatabase,
  registerMarketEventBundle,
} from "../src/market-events/sqlite-store.js";

const first: MarketEventRegistrationInput = {
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
    url: "https://example.com/sanrio/first",
    title: "決算予定",
    publishedAt: "2026-08-01T06:00:00Z",
    retrievedAt: "2026-08-03T06:00:00Z",
    contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storageClass: "METADATA_ONLY",
  }],
  decision: {
    confidenceState: "PARTIAL",
    reasons: ["決算前"],
  },
  deliveries: [{
    channel: "IN_APP",
    deliveryKey: "day-before",
    scheduledAt: "2026-08-09T06:00:00Z",
  }],
};

const source = openMarketEventDatabase({ path: ":memory:" });
const target = openMarketEventDatabase({ path: ":memory:", migrationDirectory: "migrations/d1" });
try {
  const eventId = buildEventId(first);
  const firstBundle = buildMarketEventBundle(first, getNextRevisionContext(source, eventId));
  registerMarketEventBundle(source, firstBundle);

  const second = buildMarketEventBundle({
    ...first,
    status: "POSTPONED",
    observedAt: "2026-08-03T07:00:00Z",
    changeType: "POSTPONED",
    time: { ...first.time, startAt: "2026-08-11T15:00:00+09:00" },
    sources: [{
      ...first.sources[0],
      url: "https://example.com/sanrio/second",
      title: "決算予定変更",
      retrievedAt: "2026-08-03T07:00:00Z",
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }],
    deliveries: [],
  }, getNextRevisionContext(source, eventId));
  registerMarketEventBundle(source, second);

  const options = {
    generatedAt: "2026-08-03T08:00:00Z",
    sourceDatabase: "verification",
  };
  const firstExport = buildD1BootstrapExport(source, options);
  const secondExport = buildD1BootstrapExport(source, options);
  assert.equal(firstExport.sha256, secondExport.sha256, "fixed-input exports must be byte deterministic");
  assert.equal(firstExport.sql, secondExport.sql);
  assert.doesNotMatch(
    firstExport.sql,
    /^\s*(?:BEGIN\s+TRANSACTION|SAVEPOINT|COMMIT|ROLLBACK)\b/im,
    "D1 bootstrap SQL must not contain explicit transaction statements",
  );

  const revisionInsertLines = firstExport.sql
    .split("\n")
    .filter(line => line.startsWith('INSERT OR IGNORE INTO "event_revisions"'));
  assert.equal(revisionInsertLines.length, 2);
  assert(revisionInsertLines[0]?.includes(firstBundle.revision.revisionId), "first revision row must be emitted first");
  assert(revisionInsertLines[1]?.includes(second.revision.revisionId), "second revision row must be emitted second");
  assert(revisionInsertLines[1]?.includes(firstBundle.revision.revisionId), "child row must reference the parent revision");

  target.exec(firstExport.sql);
  target.exec(firstExport.sql);
  const audit = auditMarketEventDatabase(target, ":memory:target");
  assert.equal(audit.status, "ok");
  assert.equal(audit.counts.events, 1);
  assert.equal(audit.counts.revisions, 2);
  assert.equal(audit.counts.sources, 2);
  assert.equal(audit.counts.decisions, 2);
  assert.equal(audit.counts.outbox, 1);
  assert.equal((target.prepare("PRAGMA foreign_key_check").all() as unknown[]).length, 0);
  const current = target.prepare(
    "SELECT current_revision_id AS currentRevisionId FROM market_events WHERE event_id = ?",
  ).get(eventId) as { currentRevisionId: string } | undefined;
  assert.equal(current?.currentRevisionId, second.revision.revisionId, "D1 bootstrap must preserve the latest revision pointer");

  console.log("d1-bootstrap-export: ok");
} finally {
  source.close();
  target.close();
}
