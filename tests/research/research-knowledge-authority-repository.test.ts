import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readEdgeAuthorityView,
  readMarketEventAuthorityView,
  readSecurityEntityAuthorityView,
} from "../../src/research/research-knowledge-authority-repository.js";
import { loadResearchKnowledgeRepositorySnapshot } from "../../src/research/research-knowledge-repository-loader.js";
import { emptyResearchKnowledgeOwnedSnapshot } from "../../src/research/research-knowledge-snapshot-loader.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

const ontologyVersion = "research-knowledge-v1" as const;
const root = mkdtempSync(join(tmpdir(), "alpha-pon-research-authority-"));

try {
  const marketDbPath = join(root, "market-events.db");
  const db = new DatabaseSync(marketDbPath);
  db.exec(`
    CREATE TABLE market_events (
      event_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO market_events(event_id, created_at) VALUES (?, ?)").run(
    "evt_repository_fixture",
    "2026-08-28T10:00:00+09:00",
  );
  db.close();

  const eventView = readMarketEventAuthorityView(marketDbPath);
  assert.deepEqual(eventView.issues, []);
  assert.deepEqual(eventView.ids, ["evt_repository_fixture"]);
  assert.equal(eventView.availability.evt_repository_fixture, "2026-08-28T10:00:00+09:00");

  const malformedDbPath = join(root, "market-events-malformed.db");
  const malformedDb = new DatabaseSync(malformedDbPath);
  malformedDb.exec(`CREATE TABLE market_events (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);`);
  malformedDb.prepare("INSERT INTO market_events(event_id, created_at) VALUES (?, ?)").run(
    "evt_bad_time",
    "2026-08-28",
  );
  malformedDb.close();
  assert.ok(
    readMarketEventAuthorityView(malformedDbPath).issues.some(
      (entry) => entry.code === "research_event_repository_invalid_created_at",
    ),
  );

  const entityPath = join(root, "entities.jsonl");
  const entity = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity-record-fixture",
    entityId: "entity:repository-fixture",
    entityType: "legal_entity",
    canonicalName: "Repository Fixture Inc.",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Repository Fixture Inc.",
      kind: "legal",
      validFrom: "2020-01-01",
      sourceRefs: ["fixture-source"],
    }],
    identifiers: [],
    officialLinks: [],
    sourceRefs: ["fixture-source"],
    observedAt: "2026-08-28T09:55:00+09:00",
    retrievedAt: "2026-08-28T10:00:00+09:00",
  });
  writeFileSync(entityPath, `${JSON.stringify(entity)}\n`, "utf-8");
  const entityView = readSecurityEntityAuthorityView(entityPath);
  assert.deepEqual(entityView.issues, []);
  assert.deepEqual(entityView.ids, ["entity:repository-fixture"]);
  assert.equal(entityView.availability["entity:repository-fixture"], "2026-08-28T10:00:00+09:00");

  const partialEntityPath = join(root, "entities-partial.jsonl");
  writeFileSync(partialEntityPath, JSON.stringify(entity), "utf-8");
  assert.ok(
    readSecurityEntityAuthorityView(partialEntityPath).issues.some(
      (entry) => entry.code === "research_entity_repository_partial_tail",
    ),
  );

  const edgeView = readEdgeAuthorityView();
  assert.deepEqual(edgeView.issues, []);
  assert.ok(edgeView.ids.length > 0, "existing Formal Edge Registry must be discoverable read-only");
  assert.deepEqual(edgeView.ids, [...edgeView.ids].sort(), "Edge IDs must be deterministic");
  assert.deepEqual(edgeView.availability, {}, "date-only Edge createdAt must not be promoted to exact first-known time");

  const missingEventDb = join(root, "missing-market-events.db");
  const missingEntities = join(root, "missing-entities.jsonl");
  const first = loadResearchKnowledgeRepositorySnapshot(undefined, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
  });
  const second = loadResearchKnowledgeRepositorySnapshot(undefined, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
  });
  assert.deepEqual(first.issues, []);
  assert.equal(first.fingerprint, second.fingerprint, "same repository state must yield the same fingerprint");
  assert.deepEqual(first.snapshot, second.snapshot);

  const edgeId = first.snapshot.externalReferences?.edgeIds?.[0];
  assert.ok(edgeId, "repository snapshot must expose at least one Formal Edge ID");
  const owned = emptyResearchKnowledgeOwnedSnapshot();
  owned.opportunities = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "opportunity-repository-fixture",
    title: "Repository opportunity fixture",
    status: "screening",
    detectedAt: "2026-08-28T12:00:00+09:00",
    summary: "Proves Edge provenance is required before use.",
  }];
  owned.relations = [{
    schemaVersion: 1,
    ontologyVersion,
    id: "relation-repository-edge",
    relationType: "applies_edge",
    sourceType: "opportunity",
    sourceId: "opportunity-repository-fixture",
    targetType: "edge",
    targetId: edgeId,
    createdAt: "2026-08-28T12:00:00+09:00",
  }];

  const blocked = loadResearchKnowledgeRepositorySnapshot(owned, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
  });
  assert.ok(
    blocked.issues.some((entry) => entry.code === "research_external_availability_required"),
    "referenced Edge must remain blocked until exact provenance is supplied",
  );

  const safe = loadResearchKnowledgeRepositorySnapshot(owned, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
    edgeFirstKnownAt: { [edgeId]: "2026-08-28T11:00:00+09:00" },
  });
  assert.deepEqual(safe.issues, []);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("research knowledge authority repository: all tests passed");
