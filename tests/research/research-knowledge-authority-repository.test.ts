import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readEdgeAuthorityView,
  readMarketEventAuthorityView,
  readResearchKnowledgeAuthorityViews,
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

  const paddedDbPath = join(root, "market-events-padded-id.db");
  const paddedDb = new DatabaseSync(paddedDbPath);
  paddedDb.exec(`CREATE TABLE market_events (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);`);
  paddedDb.prepare("INSERT INTO market_events(event_id, created_at) VALUES (?, ?)").run(
    " evt_repository_fixture ",
    "2026-08-28T10:00:00+09:00",
  );
  paddedDb.close();
  const paddedEventView = readMarketEventAuthorityView(paddedDbPath);
  assert.deepEqual(paddedEventView.ids, []);
  assert.deepEqual(paddedEventView.availability, {});
  assert.ok(
    paddedEventView.issues.some(
      (entry) => entry.code === "research_event_repository_noncanonical_id",
    ),
    "padded Market Event IDs must never become distinct canonical authority identities",
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

  const missingAssetRegistry = join(root, "missing-asset-registry");
  const brokenAssetAuthorities = readResearchKnowledgeAuthorityViews({
    marketEventDatabasePath: join(root, "missing-event-authority.db"),
    securityMasterEntitiesPath: join(root, "missing-entity-authority.jsonl"),
    assetRegistryRootPath: missingAssetRegistry,
  });
  for (const view of [
    brokenAssetAuthorities.document,
    brokenAssetAuthorities.watch,
    brokenAssetAuthorities.implementation,
  ]) {
    assert.ok(
      view.issues.some((entry) => entry.code === "research_asset_registry_root_missing"),
      `${view.nodeType} authority must fail closed when the shared Research Asset Registry is invalid`,
    );
  }

  const hardlinkRepoRoot = join(root, "hardlink-repo");
  const hardlinkRegistryRoot = join(root, "hardlink-registry");
  mkdirSync(join(hardlinkRepoRoot, "config"), { recursive: true });
  mkdirSync(join(hardlinkRegistryRoot, "assets"), { recursive: true });
  const originalTarget = join(hardlinkRepoRoot, "original-watch.yml");
  const linkedTarget = join(hardlinkRepoRoot, "config", "watch.yml");
  writeFileSync(originalTarget, "enabled: true\n", "utf-8");
  linkSync(originalTarget, linkedTarget);
  writeFileSync(
    join(hardlinkRegistryRoot, "assets", "watch-hardlink-fixture.yml"),
    [
      "schemaVersion: 1",
      "id: watch-hardlink-fixture",
      "assetType: watch",
      "path: config/watch.yml",
      "status: active",
      "description: Hard link fixture target",
      "",
    ].join("\n"),
    "utf-8",
  );
  const hardlinkAuthorities = readResearchKnowledgeAuthorityViews({
    marketEventDatabasePath: join(root, "missing-hardlink-event.db"),
    securityMasterEntitiesPath: join(root, "missing-hardlink-entities.jsonl"),
    assetRegistryRootPath: hardlinkRegistryRoot,
    assetRegistryRepositoryRootPath: hardlinkRepoRoot,
  });
  for (const view of [
    hardlinkAuthorities.document,
    hardlinkAuthorities.watch,
    hardlinkAuthorities.implementation,
  ]) {
    assert.ok(
      view.issues.some((entry) => entry.code === "research_asset_registry_target_hardlink_alias"),
      `${view.nodeType} authority must fail closed when a registered Asset target is a hard-link alias`,
    );
  }

  const edgeView = readEdgeAuthorityView();
  assert.deepEqual(edgeView.issues, []);
  assert.ok(edgeView.ids.length > 0, "existing Formal Edge Registry must be discoverable read-only");
  assert.deepEqual(edgeView.ids, [...edgeView.ids].sort(), "Edge IDs must be deterministic");
  assert.equal(
    Object.keys(edgeView.availability).length,
    edgeView.ids.length,
    "all currently backfilled Formal Edges must have exact canonical-main availability",
  );
  for (const edgeId of edgeView.ids) {
    assert.match(
      edgeView.availability[edgeId] ?? "",
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
      `Edge ${edgeId} must use an exact timestamp, never date-only createdAt`,
    );
  }

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
    detectedAt: "2026-08-28T20:00:00+09:00",
    summary: "Proves exact Edge provenance is required before use.",
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
    createdAt: "2026-08-28T20:05:00+09:00",
  }];

  const safeFromCanonicalLedger = loadResearchKnowledgeRepositorySnapshot(owned, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
  });
  assert.deepEqual(
    safeFromCanonicalLedger.issues,
    [],
    "a relation created after canonical first-known provenance may use the Formal Edge",
  );

  const blockedPendingProvenance = loadResearchKnowledgeRepositorySnapshot(owned, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
    edgeFirstKnownAt: {},
  });
  assert.ok(
    blockedPendingProvenance.issues.some((entry) => entry.code === "research_external_availability_required"),
    "a registered Edge with pending provenance may exist, but strict Research Knowledge links must fail closed",
  );

  const safeOverride = loadResearchKnowledgeRepositorySnapshot(owned, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
    edgeFirstKnownAt: { [edgeId]: "2026-08-28T19:00:00+09:00" },
  });
  assert.deepEqual(safeOverride.issues, []);

  const corruptedProvenancePath = join(root, "corrupted-provenance.jsonl");
  writeFileSync(corruptedProvenancePath, "{not-json}\n", "utf-8");
  const corrupted = loadResearchKnowledgeRepositorySnapshot(undefined, {
    marketEventDatabasePath: missingEventDb,
    securityMasterEntitiesPath: missingEntities,
    edgeProvenancePath: corruptedProvenancePath,
  });
  assert.ok(
    corrupted.issues.some((entry) => entry.code === "research_edge_provenance_invalid_json"),
    "structurally corrupted provenance must fail the repository snapshot globally",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("research knowledge authority repository: all tests passed");
