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
    content_hash: "a".repeat(64),
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

const duplicatePrimaryKeyRemote = structuredClone(canonical);
duplicatePrimaryKeyRemote.event_sources.push({ ...duplicatePrimaryKeyRemote.event_sources[0] });
const duplicatePrimaryKeyPlan = buildD1SyncPlan(canonical, duplicatePrimaryKeyRemote);
assert.equal(duplicatePrimaryKeyPlan.status, "blocked");
assert.match(
  duplicatePrimaryKeyPlan.blockers.join("\n"),
  /event_sources contains duplicate primary key src_alpha/,
  "duplicate remote rows must remain inspectable as a blocked read-only plan instead of throwing",
);

const unsupportedSchemaVersionRemote = structuredClone(canonical);
unsupportedSchemaVersionRemote.market_events[0].schema_version = 2;
const unsupportedSchemaVersionPlan = buildD1SyncPlan(canonical, unsupportedSchemaVersionRemote);
assert.equal(unsupportedSchemaVersionPlan.status, "blocked");
assert.match(
  unsupportedSchemaVersionPlan.blockers.join("\n"),
  /remote: market_events evt_alpha schema_version must be 1, got 2/,
  "unsupported persisted schema versions must block D1 sync preview",
);

const invalidEventTypeRemote = structuredClone(canonical);
invalidEventTypeRemote.market_events[0].event_type = "NOT_AN_EVENT_TYPE";
const invalidEventTypePlan = buildD1SyncPlan(canonical, invalidEventTypeRemote);
assert.equal(invalidEventTypePlan.status, "blocked");
assert.match(invalidEventTypePlan.blockers.join("\n"), /invalid event_type NOT_AN_EVENT_TYPE/);

const invalidEventStatusRemote = structuredClone(canonical);
invalidEventStatusRemote.market_events[0].status = "NOT_A_STATUS";
const invalidEventStatusPlan = buildD1SyncPlan(canonical, invalidEventStatusRemote);
assert.equal(invalidEventStatusPlan.status, "blocked");
assert.match(invalidEventStatusPlan.blockers.join("\n"), /invalid status NOT_A_STATUS/);

const invalidEventPriorityRemote = structuredClone(canonical);
invalidEventPriorityRemote.market_events[0].priority = "S9";
const invalidEventPriorityPlan = buildD1SyncPlan(canonical, invalidEventPriorityRemote);
assert.equal(invalidEventPriorityPlan.status, "blocked");
assert.match(invalidEventPriorityPlan.blockers.join("\n"), /invalid priority S9/);

const invalidTimePrecisionRemote = structuredClone(canonical);
invalidTimePrecisionRemote.market_events[0].time_precision = "APPROXIMATE";
const invalidTimePrecisionPlan = buildD1SyncPlan(canonical, invalidTimePrecisionRemote);
assert.equal(invalidTimePrecisionPlan.status, "blocked");
assert.match(invalidTimePrecisionPlan.blockers.join("\n"), /invalid time_precision APPROXIMATE/);

const invalidCurrentDecisionRemote = structuredClone(canonical);
invalidCurrentDecisionRemote.market_events[0].current_decision_state = "BUY_NOW";
const invalidCurrentDecisionPlan = buildD1SyncPlan(canonical, invalidCurrentDecisionRemote);
assert.equal(invalidCurrentDecisionPlan.status, "blocked");
assert.match(invalidCurrentDecisionPlan.blockers.join("\n"), /invalid current_decision_state BUY_NOW/);

const invalidLastVerifiedAtRemote = structuredClone(canonical);
invalidLastVerifiedAtRemote.market_events[0].last_verified_at = "2026-08-04T00:00:00";
const invalidLastVerifiedAtPlan = buildD1SyncPlan(canonical, invalidLastVerifiedAtRemote);
assert.equal(invalidLastVerifiedAtPlan.status, "blocked");
assert.match(invalidLastVerifiedAtPlan.blockers.join("\n"), /last_verified_at must be a strict ISO timestamp/);

const invalidStaleAfterRemote = structuredClone(canonical);
invalidStaleAfterRemote.market_events[0].stale_after = "2026-08-05T00:00:00";
const invalidStaleAfterPlan = buildD1SyncPlan(canonical, invalidStaleAfterRemote);
assert.equal(invalidStaleAfterPlan.status, "blocked");
assert.match(invalidStaleAfterPlan.blockers.join("\n"), /stale_after must be a strict ISO timestamp/);

const invalidCreatedAtRemote = structuredClone(canonical);
invalidCreatedAtRemote.market_events[0].created_at = "2026-08-04T00:00:00";
const invalidCreatedAtPlan = buildD1SyncPlan(canonical, invalidCreatedAtRemote);
assert.equal(invalidCreatedAtPlan.status, "blocked");
assert.match(invalidCreatedAtPlan.blockers.join("\n"), /created_at must be a strict ISO timestamp/);

const updatedBeforeCreatedRemote = structuredClone(canonical);
updatedBeforeCreatedRemote.market_events[0].created_at = "2026-08-04T00:00:01.000Z";
const updatedBeforeCreatedPlan = buildD1SyncPlan(canonical, updatedBeforeCreatedRemote);
assert.equal(updatedBeforeCreatedPlan.status, "blocked");
assert.match(updatedBeforeCreatedPlan.blockers.join("\n"), /updated_at must be on or after created_at/);

const invalidRevisionChangeTypeRemote = structuredClone(canonical);
invalidRevisionChangeTypeRemote.event_revisions[0].change_type = "REWRITTEN";
const invalidRevisionChangeTypePlan = buildD1SyncPlan(canonical, invalidRevisionChangeTypeRemote);
assert.equal(invalidRevisionChangeTypePlan.status, "blocked");
assert.match(invalidRevisionChangeTypePlan.blockers.join("\n"), /invalid change_type REWRITTEN/);

const invalidDecisionStateRemote = structuredClone(canonical);
invalidDecisionStateRemote.decision_snapshots[0].decision_state = "BUY_NOW";
const invalidDecisionStatePlan = buildD1SyncPlan(canonical, invalidDecisionStateRemote);
assert.equal(invalidDecisionStatePlan.status, "blocked");
assert.match(invalidDecisionStatePlan.blockers.join("\n"), /invalid decision_state BUY_NOW/);

const invalidConfidenceStateRemote = structuredClone(canonical);
invalidConfidenceStateRemote.decision_snapshots[0].confidence_state = "CERTAIN";
const invalidConfidenceStatePlan = buildD1SyncPlan(canonical, invalidConfidenceStateRemote);
assert.equal(invalidConfidenceStatePlan.status, "blocked");
assert.match(invalidConfidenceStatePlan.blockers.join("\n"), /invalid confidence_state CERTAIN/);

const olderRemote = structuredClone(canonical);
olderRemote.market_events[0].title = "Old title";
olderRemote.market_events[0].updated_at = "2026-08-03T00:00:00.000Z";
const updatePlan = buildD1SyncPlan(canonical, olderRemote);
assert.equal(updatePlan.status, "blocked");
assert.match(updatePlan.blockers.join("\n"), /updated_at must be on or after created_at/);

const newerRemote = structuredClone(canonical);
newerRemote.market_events[0].title = "Newer remote title";
newerRemote.market_events[0].updated_at = "2026-08-05T00:00:00.000Z";
const staleCanonicalPlan = buildD1SyncPlan(canonical, newerRemote);
assert.equal(staleCanonicalPlan.status, "blocked");
assert.match(staleCanonicalPlan.blockers.join("\n"), /older than remote updated_at/);

const offsetCanonical = structuredClone(canonical);
offsetCanonical.market_events[0].title = "Canonical offset title";
offsetCanonical.market_events[0].updated_at = "2026-08-04T09:00:00+09:00";
const offsetRemote = structuredClone(offsetCanonical);
offsetRemote.market_events[0].title = "Remote later instant";
offsetRemote.market_events[0].updated_at = "2026-08-04T00:30:00Z";
const offsetChronologyPlan = buildD1SyncPlan(offsetCanonical, offsetRemote);
assert.equal(offsetChronologyPlan.status, "blocked");
assert.match(
  offsetChronologyPlan.blockers.join("\n"),
  /older than remote updated_at/,
  "updated_at ordering must compare instants instead of ISO strings with different offsets",
);

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

const wrongArrayShapeRemote = structuredClone(canonical);
wrongArrayShapeRemote.market_events[0].edge_types_json = "{}";
const wrongArrayShapePlan = buildD1SyncPlan(canonical, wrongArrayShapeRemote);
assert.equal(wrongArrayShapePlan.status, "blocked");
assert.match(wrongArrayShapePlan.blockers.join("\n"), /edge_types_json must contain a JSON string array/);

const wrongObjectShapeCanonical = structuredClone(canonical);
wrongObjectShapeCanonical.event_revisions[0].facts_json = "[]";
const wrongObjectShapePlan = buildD1SyncPlan(wrongObjectShapeCanonical, emptyD1SyncSnapshot());
assert.equal(wrongObjectShapePlan.status, "blocked");
assert.match(wrongObjectShapePlan.blockers.join("\n"), /facts_json must contain a JSON object/);

const wrongArrayItemRemote = structuredClone(canonical);
wrongArrayItemRemote.decision_snapshots[0].reasons_json = '["ok",1]';
const wrongArrayItemPlan = buildD1SyncPlan(canonical, wrongArrayItemRemote);
assert.equal(wrongArrayItemPlan.status, "blocked");
assert.match(wrongArrayItemPlan.blockers.join("\n"), /reasons_json must contain a JSON string array/);

const invalidSourceTypeRemote = structuredClone(canonical);
invalidSourceTypeRemote.event_sources[0].source_type = "NOT_A_SOURCE";
const invalidSourceTypePlan = buildD1SyncPlan(canonical, invalidSourceTypeRemote);
assert.equal(invalidSourceTypePlan.status, "blocked");
assert.match(invalidSourceTypePlan.blockers.join("\n"), /source src_alpha has invalid source_type NOT_A_SOURCE/);

const invalidSourceHashRemote = structuredClone(canonical);
invalidSourceHashRemote.event_sources[0].content_hash = "abc123";
const invalidSourceHashPlan = buildD1SyncPlan(canonical, invalidSourceHashRemote);
assert.equal(invalidSourceHashPlan.status, "blocked");
assert.match(invalidSourceHashPlan.blockers.join("\n"), /source src_alpha has invalid content_hash/);

const insecureSourceUrlRemote = structuredClone(canonical);
insecureSourceUrlRemote.event_sources[0].url = "http://example.com/src_alpha";
const insecureSourceUrlPlan = buildD1SyncPlan(canonical, insecureSourceUrlRemote);
assert.equal(insecureSourceUrlPlan.status, "blocked");
assert.match(insecureSourceUrlPlan.blockers.join("\n"), /source src_alpha URL must use https/);

const invalidStorageClassRemote = structuredClone(canonical);
invalidStorageClassRemote.event_sources[0].storage_class = "PUBLIC_UNKNOWN";
const invalidStorageClassPlan = buildD1SyncPlan(canonical, invalidStorageClassRemote);
assert.equal(invalidStorageClassPlan.status, "blocked");
assert.match(
  invalidStorageClassPlan.blockers.join("\n"),
  /source src_alpha has invalid storage_class PUBLIC_UNKNOWN/,
);

const missingRevisionSourceCanonical = structuredClone(canonical);
missingRevisionSourceCanonical.event_revisions[0].source_ids_json = '["src_missing"]';
const missingRevisionSourcePlan = buildD1SyncPlan(missingRevisionSourceCanonical, emptyD1SyncSnapshot());
assert.equal(missingRevisionSourcePlan.status, "blocked");
assert.match(missingRevisionSourcePlan.blockers.join("\n"), /revision rev_alpha references invalid source src_missing/);

const sourceAfterObservationRemote = structuredClone(canonical);
sourceAfterObservationRemote.event_sources[0].retrieved_at = "2026-08-04T00:00:01.000Z";
const sourceAfterObservationPlan = buildD1SyncPlan(canonical, sourceAfterObservationRemote);
assert.equal(sourceAfterObservationPlan.status, "blocked");
assert.match(
  sourceAfterObservationPlan.blockers.join("\n"),
  /revision rev_alpha references source src_alpha retrieved after observed_at/,
);

const sourcePublishedAfterRetrievalRemote = structuredClone(canonical);
sourcePublishedAfterRetrievalRemote.event_sources[0].published_at = "2026-08-04T00:00:01.000Z";
const sourcePublishedAfterRetrievalPlan = buildD1SyncPlan(canonical, sourcePublishedAfterRetrievalRemote);
assert.equal(sourcePublishedAfterRetrievalPlan.status, "blocked");
assert.match(sourcePublishedAfterRetrievalPlan.blockers.join("\n"), /published_at must be on or before retrieved_at/);

const revisionPublishedAfterObservationRemote = structuredClone(canonical);
revisionPublishedAfterObservationRemote.event_revisions[0].published_at = "2026-08-04T00:00:01.000Z";
const revisionPublishedAfterObservationPlan = buildD1SyncPlan(canonical, revisionPublishedAfterObservationRemote);
assert.equal(revisionPublishedAfterObservationPlan.status, "blocked");
assert.match(revisionPublishedAfterObservationPlan.blockers.join("\n"), /publishedAt must be on or before observedAt/);

const revisionExecutableBeforeObservationRemote = structuredClone(canonical);
revisionExecutableBeforeObservationRemote.event_revisions[0].first_executable_at = "2026-08-03T23:59:59.000Z";
const revisionExecutableBeforeObservationPlan = buildD1SyncPlan(canonical, revisionExecutableBeforeObservationRemote);
assert.equal(revisionExecutableBeforeObservationPlan.status, "blocked");
assert.match(revisionExecutableBeforeObservationPlan.blockers.join("\n"), /firstExecutableAt must be on or after observedAt/);

const decisionBeforeObservationRemote = structuredClone(canonical);
decisionBeforeObservationRemote.decision_snapshots[0].created_at = "2026-08-03T23:59:59.000Z";
const decisionBeforeObservationPlan = buildD1SyncPlan(canonical, decisionBeforeObservationRemote);
assert.equal(decisionBeforeObservationPlan.status, "blocked");
assert.match(decisionBeforeObservationPlan.blockers.join("\n"), /was created before revision rev_alpha was observed/);

const invalidDecisionTimestampRemote = structuredClone(canonical);
invalidDecisionTimestampRemote.decision_snapshots[0].created_at = "2026-08-04T00:00:00";
const invalidDecisionTimestampPlan = buildD1SyncPlan(canonical, invalidDecisionTimestampRemote);
assert.equal(invalidDecisionTimestampPlan.status, "blocked");
assert.match(invalidDecisionTimestampPlan.blockers.join("\n"), /decision created_at must be a strict ISO timestamp/);

const stalePointerCanonical = structuredClone(canonical);
stalePointerCanonical.event_revisions.push({
  ...revisionRow("rev_alpha_v2", "evt_alpha"),
  revision_number: 2,
  previous_revision_id: "rev_alpha",
});
const stalePointerPlan = buildD1SyncPlan(stalePointerCanonical, emptyD1SyncSnapshot());
assert.equal(stalePointerPlan.status, "blocked");
assert.match(
  stalePointerPlan.blockers.join("\n"),
  /current_revision_id rev_alpha is stale; latest is rev_alpha_v2/,
  "D1 sync must not propagate an older same-event revision as current",
);

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
