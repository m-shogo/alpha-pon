import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildD1SyncApplySql,
  buildD1SyncPlan,
  emptyD1SyncSnapshot,
  type D1SyncRow,
  type D1SyncSnapshot,
} from "../src/market-events/d1-sync.js";

function eventRow(id = "evt_alpha", updatedAt = "2026-08-04T00:00:00.000Z"): D1SyncRow {
  return {
    event_id: id,
    schema_version: 1,
    occurrence_key: `occurrence-${id}`,
    issuer_code: "0000",
    issuer_name: "Alpha Pon",
    event_type: "REVIEW_CHECKPOINT",
    title: "Review checkpoint",
    status: "SCHEDULED",
    priority: "S1",
    start_at: "2026-12-01T00:00:00.000Z",
    end_at: null,
    all_day: 1,
    timezone: "Asia/Tokyo",
    time_precision: "DATE_ONLY",
    window_start: null,
    window_end: null,
    edge_types_json: "[]",
    current_decision_state: "INFO",
    why_it_matters: "Verify the event contract",
    checks_before_json: "[]",
    checks_after_json: "[]",
    related_event_ids_json: "[]",
    current_revision_id: id.replace("evt_", "rev_"),
    last_verified_at: updatedAt,
    stale_after: null,
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

function revisionRow(id = "rev_alpha", eventId = "evt_alpha"): D1SyncRow {
  return {
    revision_id: id,
    event_id: eventId,
    schema_version: 1,
    revision_number: 1,
    observed_at: "2026-08-04T00:00:00.000Z",
    published_at: null,
    effective_at: null,
    first_executable_at: null,
    change_type: "CREATED",
    facts_json: "{}",
    source_ids_json: `["${eventId.replace("evt_", "src_")}"]`,
    previous_revision_id: null,
  };
}

function sourceRow(id = "src_alpha", eventId = "evt_alpha"): D1SyncRow {
  return {
    source_id: id,
    event_id: eventId,
    schema_version: 1,
    authority: "Alpha Pon",
    source_type: "OTHER",
    url: `https://example.com/${id}`,
    title: "Primary source",
    published_at: null,
    retrieved_at: "2026-08-04T00:00:00.000Z",
    content_hash: id,
    storage_class: "METADATA_ONLY",
    object_key: null,
  };
}

function decisionRow(id = "dec_alpha", eventId = "evt_alpha", revisionId = "rev_alpha"): D1SyncRow {
  return {
    decision_snapshot_id: id,
    event_id: eventId,
    revision_id: revisionId,
    schema_version: 1,
    decision_state: "INFO",
    confidence_state: "CONFIRMED",
    reasons_json: "[]",
    invalidation_conditions_json: "[]",
    created_at: "2026-08-04T00:00:00.000Z",
  };
}

function snapshot(suffix = "alpha"): D1SyncSnapshot {
  const eventId = `evt_${suffix}`;
  const revisionId = `rev_${suffix}`;
  return {
    market_events: [eventRow(eventId)],
    event_sources: [sourceRow(`src_${suffix}`, eventId)],
    event_revisions: [revisionRow(revisionId, eventId)],
    decision_snapshots: [decisionRow(`dec_${suffix}`, eventId, revisionId)],
    triggers: 0,
    legacyGuardMarker: 0,
  };
}

const canonical = snapshot();

const additionPlan = buildD1SyncPlan(canonical, emptyD1SyncSnapshot());
assert.equal(additionPlan.status, "ready");
assert.equal(additionPlan.summary.added, 4);
assert.equal(additionPlan.summary.updated, 0);

const identicalPlan = buildD1SyncPlan(canonical, structuredClone(canonical));
assert.equal(identicalPlan.status, "ready");
assert.equal(identicalPlan.summary.unchanged, 4);
assert.equal(identicalPlan.summary.added, 0);

const olderRemote = structuredClone(canonical);
olderRemote.market_events[0].title = "Old title";
olderRemote.market_events[0].updated_at = "2026-08-03T00:00:00.000Z";
const updatePlan = buildD1SyncPlan(canonical, olderRemote);
assert.equal(updatePlan.status, "ready");
assert.deepEqual(updatePlan.tables.market_events.updated, ["evt_alpha"]);

const newerRemote = structuredClone(canonical);
newerRemote.market_events[0].title = "Newer remote title";
newerRemote.market_events[0].updated_at = "2026-08-05T00:00:00.000Z";
const staleCanonicalPlan = buildD1SyncPlan(canonical, newerRemote);
assert.equal(staleCanonicalPlan.status, "blocked");
assert.match(staleCanonicalPlan.blockers.join("\n"), /older than remote updated_at/);

const remoteWithExtra = structuredClone(canonical);
const extra = snapshot("extra");
remoteWithExtra.market_events.push(...extra.market_events);
remoteWithExtra.event_sources.push(...extra.event_sources);
remoteWithExtra.event_revisions.push(...extra.event_revisions);
remoteWithExtra.decision_snapshots.push(...extra.decision_snapshots);
const removalPlan = buildD1SyncPlan(canonical, remoteWithExtra);
assert.equal(removalPlan.status, "ready");
assert.equal(removalPlan.summary.removedCandidates, 4);

const collisionRemote = structuredClone(canonical);
collisionRemote.event_revisions[0].facts_json = '{"changed":true}';
const collisionPlan = buildD1SyncPlan(canonical, collisionRemote);
assert.equal(collisionPlan.status, "blocked");
assert.deepEqual(collisionPlan.tables.event_revisions.collisions, ["rev_alpha"]);

const malformedRemote = structuredClone(canonical);
malformedRemote.market_events[0].checks_before_json = "not-json";
const malformedPlan = buildD1SyncPlan(canonical, malformedRemote);
assert.equal(malformedPlan.status, "blocked");
assert.match(malformedPlan.blockers.join("\n"), /malformed/);

const triggerRemote = structuredClone(canonical);
triggerRemote.triggers = 1;
const triggerPlan = buildD1SyncPlan(canonical, triggerRemote);
assert.equal(triggerPlan.status, "blocked");
assert.match(triggerPlan.blockers.join("\n"), /zero triggers/);

const sql = buildD1SyncApplySql(canonical);
assert.match(sql, /INSERT INTO "market_events"/);
assert.match(sql, /ON CONFLICT\(event_id\) DO UPDATE/);
assert.match(sql, /INSERT OR IGNORE INTO "event_revisions"/);
assert.doesNotMatch(sql, /\bDELETE\b/i);
assert.doesNotMatch(sql, /\bDROP\b/i);
assert.doesNotMatch(sql, /CREATE\s+TRIGGER/i);

const workflow = readFileSync(".github/workflows/sync-cloudflare-d1-market-events.yml", "utf8");
assert.match(workflow, /DATABASE_NAME: \$\{\{ inputs\.database \}\}/);
assert.match(workflow, /CLOUDFLARE_D1_READ_API_TOKEN/);
assert.match(workflow, /CLOUDFLARE_D1_EDIT_API_TOKEN/);
assert.match(workflow, /environment: production/);
assert.match(workflow, /\^\[A-Za-z0-9\]\[A-Za-z0-9_-\]\{0,63\}\$/);
assert.doesNotMatch(workflow, /--database "\$\{\{ inputs\.database \}\}"/);
assert.doesNotMatch(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
assert.doesNotMatch(workflow, /^env:\n  CLOUDFLARE_API_TOKEN:/m);

console.log("cloudflare-d1-sync-verification: ok");
