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
  decision: {
    confidenceState: "PARTIAL",
    reasons: ["一次資料の予定時刻を確認済み"],
    invalidationConditions: ["公式日程変更"],
  },
};

const db = openMarketEventDatabase({ path: ":memory:" });
try {
  const eventId = buildEventId(input);
  const bundle = buildMarketEventBundle(input, getNextRevisionContext(db, eventId));
  assert.ok(bundle.decisionSnapshot, "fixture must contain a decision snapshot");
  registerMarketEventBundle(db, bundle);
  registerMarketEventBundle(db, bundle);
  assert.equal(auditMarketEventDatabase(db, ":memory:").status, "ok");

  const changedDecisionReplay = {
    ...bundle,
    decisionSnapshot: {
      ...bundle.decisionSnapshot,
      reasons: ["mutated immutable decision reason"],
    },
  };
  assert.throws(
    () => registerMarketEventBundle(db, changedDecisionReplay),
    /decision snapshot replay payload mismatch/,
    "SQLite must reject a reused decisionSnapshotId whose immutable snapshot payload changed",
  );

  const persisted = db.prepare("SELECT reasons_json AS reasonsJson FROM decision_snapshots WHERE decision_snapshot_id = ?")
    .get(bundle.decisionSnapshot.decisionSnapshotId) as { reasonsJson: string };
  assert.equal(
    persisted.reasonsJson,
    JSON.stringify(bundle.decisionSnapshot.reasons),
    "failed replay must leave the original decision snapshot payload intact",
  );

  db.exec("DROP TRIGGER trg_decision_snapshots_no_update");
  db.prepare("UPDATE decision_snapshots SET confidence_state = ? WHERE decision_snapshot_id = ?").run(
    "CONFIRMED",
    bundle.decisionSnapshot.decisionSnapshotId,
  );
  const audit = auditMarketEventDatabase(db, ":memory:");
  assert.equal(audit.status, "error", "central audit must reject stale persisted decisionSnapshotId bindings");
  assert.ok(
    audit.invalidDecisionRows.some(
      row => row.decisionSnapshotId === bundle.decisionSnapshot?.decisionSnapshotId
        && /decisionSnapshotId does not match canonical decision identity/.test(row.message),
    ),
    "central audit must identify the decision row with a stale decisionSnapshotId binding",
  );
} finally {
  db.close();
}

console.log("market-event-decision-replay: ok");
