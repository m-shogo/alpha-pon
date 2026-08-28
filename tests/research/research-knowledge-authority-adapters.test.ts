import assert from "node:assert/strict";
import type { MarketEventLedgerRecord } from "../../src/market-events/local-ledger.js";
import {
  buildEdgeAuthorityView,
  buildMarketEventAuthorityView,
  buildSecurityEntityAuthorityView,
} from "../../src/research/research-knowledge-authority-adapters.js";
import {
  emptyResearchKnowledgeOwnedSnapshot,
  loadResearchKnowledgeIntegritySnapshot,
} from "../../src/research/research-knowledge-snapshot-loader.js";
import type { SecurityMasterEntityRecord } from "../../src/research/security-master.js";

const ontologyVersion = "research-knowledge-v1" as const;
const firstKnown = "2026-08-28T10:00:00+09:00";
const laterKnown = "2026-08-28T10:10:00+09:00";

function marketEventRecord(eventId: string, recordedAt: string, createdAt = "2026-08-20T00:00:00+09:00"): MarketEventLedgerRecord {
  return {
    recordType: "MARKET_EVENT",
    recordedAt,
    payload: {
      schemaVersion: 1,
      eventId,
      occurrenceKey: "fixture",
      issuerCode: "285A",
      issuerName: "Fixture Issuer",
      eventType: "CORPORATE_ACTION",
      title: "Fixture event",
      status: "COMPLETED",
      priority: "S2",
      time: {
        startAt: "2026-08-19",
        endAt: null,
        allDay: true,
        timezone: "Asia/Tokyo",
        precision: "DATE_ONLY",
        windowStart: null,
        windowEnd: null,
      },
      edgeTypes: [],
      currentDecisionState: "INFO",
      whyItMatters: "Fixture",
      checksBefore: [],
      checksAfter: [],
      relatedEventIds: [],
      lastVerifiedAt: recordedAt,
      staleAfter: null,
      createdAt,
      updatedAt: recordedAt,
    },
  };
}

function securityEntityRecord(
  entityId: string,
  observedAt: string,
  retrievedAt: string,
  recordId = "record-1",
): SecurityMasterEntityRecord {
  return {
    schemaVersion: 1,
    recordId,
    entityId,
    entityType: "legal_entity",
    canonicalName: "Fixture Entity",
    jurisdiction: "JP",
    validFrom: "2000-01-01",
    status: "active",
    names: [{
      name: "Fixture Entity",
      kind: "legal",
      validFrom: "2000-01-01",
      sourceRefs: ["fixture"],
    }],
    identifiers: [],
    officialLinks: [],
    sourceRefs: ["fixture"],
    observedAt,
    retrievedAt,
    contentHash: "fixture-hash",
  };
}

{
  const view = buildMarketEventAuthorityView([
    marketEventRecord("evt_fixture", laterKnown, "2020-01-01T00:00:00+09:00"),
    marketEventRecord("evt_fixture", firstKnown, "2020-01-01T00:00:00+09:00"),
  ]);
  assert.deepEqual(view.issues, []);
  assert.deepEqual(view.ids, ["evt_fixture"]);
  assert.equal(
    view.availability.evt_fixture,
    firstKnown,
    "Event availability must be the earliest ledger recordedAt, not economic/event createdAt",
  );
}

{
  const view = buildSecurityEntityAuthorityView([
    securityEntityRecord("entity:fixture", "2026-08-28T09:50:00+09:00", laterKnown, "record-2"),
    securityEntityRecord("entity:fixture", "2026-08-28T09:40:00+09:00", firstKnown, "record-1"),
  ]);
  assert.deepEqual(view.issues, []);
  assert.deepEqual(view.ids, ["entity:fixture"]);
  assert.equal(
    view.availability["entity:fixture"],
    firstKnown,
    "Entity availability must use earliest safe retrievedAt across revisions",
  );
}

{
  const view = buildSecurityEntityAuthorityView([
    securityEntityRecord("entity:bad", laterKnown, firstKnown),
  ]);
  assert.ok(view.issues.some((entry) => entry.code === "research_entity_authority_retrieved_before_observed"));
  assert.equal(view.availability["entity:bad"], undefined);
}

{
  const view = buildEdgeAuthorityView(["misconduct-overreaction-recovery"], {
    "misconduct-overreaction-recovery": "2026-08-01",
  });
  assert.ok(view.issues.some((entry) => entry.code === "research_edge_authority_invalid_first_known_at"));
  assert.equal(view.availability["misconduct-overreaction-recovery"], undefined);
}

{
  const view = buildEdgeAuthorityView(["", " misconduct-overreaction-recovery ", "misconduct-overreaction-recovery"], {
    "misconduct-overreaction-recovery": firstKnown,
  });
  assert.deepEqual(view.ids, ["misconduct-overreaction-recovery"]);
  assert.equal(view.availability["misconduct-overreaction-recovery"], firstKnown);
  assert.equal(
    view.issues.filter((entry) => entry.code === "research_edge_authority_invalid_id").length,
    2,
    "blank or padded Edge IDs must never enter the authority identity set",
  );
}

function ownedWithExternalLinks() {
  const owned = emptyResearchKnowledgeOwnedSnapshot();
  owned.researchItems = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "research-fixture",
    title: "Research fixture",
    status: "investigating",
    createdAt: laterKnown,
    origin: "manual_research",
    summary: "Fixture research item.",
  }];
  owned.cases = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "case-fixture",
    title: "Case fixture",
    status: "open",
    createdAt: laterKnown,
    summary: "Fixture case.",
  }];
  owned.relations = [
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-case-event",
      relationType: "includes_event",
      sourceType: "case",
      sourceId: "case-fixture",
      targetType: "event",
      targetId: "evt_fixture",
      order: 0,
      createdAt: laterKnown,
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "relation-case-entity",
      relationType: "involves_entity",
      sourceType: "case",
      sourceId: "case-fixture",
      targetType: "entity",
      targetId: "entity:fixture",
      createdAt: laterKnown,
    },
  ];
  return owned;
}

{
  const eventView = buildMarketEventAuthorityView([marketEventRecord("evt_fixture", firstKnown)]);
  const entityView = buildSecurityEntityAuthorityView([
    securityEntityRecord("entity:fixture", "2026-08-28T09:55:00+09:00", firstKnown),
  ]);
  const result = loadResearchKnowledgeIntegritySnapshot(ownedWithExternalLinks(), {
    event: eventView,
    entity: entityView,
  });
  assert.deepEqual(result.issues, []);
}

{
  const owned = emptyResearchKnowledgeOwnedSnapshot();
  owned.opportunities = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "opportunity-fixture",
    title: "Opportunity fixture",
    status: "screening",
    detectedAt: laterKnown,
    summary: "Fixture opportunity.",
  }];
  owned.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-opportunity-edge",
    relationType: "applies_edge",
    sourceType: "opportunity",
    sourceId: "opportunity-fixture",
    targetType: "edge",
    targetId: "misconduct-overreaction-recovery",
    createdAt: laterKnown,
  }];

  const missing = loadResearchKnowledgeIntegritySnapshot(owned, {
    edge: buildEdgeAuthorityView(["misconduct-overreaction-recovery"]),
  });
  assert.ok(
    missing.issues.some((entry) => entry.code === "research_external_availability_required"),
    "repository-mode loader must fail closed when a referenced Edge has no authoritative first-known instant",
  );

  const safe = loadResearchKnowledgeIntegritySnapshot(owned, {
    edge: buildEdgeAuthorityView(["misconduct-overreaction-recovery"], {
      "misconduct-overreaction-recovery": firstKnown,
    }),
  });
  assert.deepEqual(safe.issues, []);
}

{
  const left = emptyResearchKnowledgeOwnedSnapshot();
  left.researchItems = [
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "research-b",
      title: "Research B",
      status: "investigating",
      createdAt: firstKnown,
      origin: "manual_research",
      summary: "B",
    },
    {
      schemaVersion: 1,
      ontologyVersion,
      id: "research-a",
      title: "Research A",
      status: "investigating",
      createdAt: firstKnown,
      origin: "manual_research",
      summary: "A",
    },
  ];
  const right = { ...left, researchItems: [...left.researchItems].reverse() };
  const leftResult = loadResearchKnowledgeIntegritySnapshot(left, {}, { requireExternalAvailability: false });
  const rightResult = loadResearchKnowledgeIntegritySnapshot(right, {}, { requireExternalAvailability: false });
  assert.equal(leftResult.fingerprint, rightResult.fingerprint, "top-level record order must not change snapshot fingerprint");
  assert.deepEqual(leftResult.snapshot, rightResult.snapshot);
}

console.log("research knowledge authority adapters: all tests passed");
