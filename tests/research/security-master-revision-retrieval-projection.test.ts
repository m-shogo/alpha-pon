import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash, withSecurityRelationshipHash } from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-revision-retrieval-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const base = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:revision-retrieval:record:001",
    entityId: "entity:revision-retrieval",
    entityType: "legal_entity",
    canonicalName: "Revision Retrieval株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Revision Retrieval株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:revision-retrieval:001"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:revision-retrieval",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:revision-retrieval:001"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:revision-retrieval:001"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T10:00:00+09:00",
  });
  const impossibleHead = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:revision-retrieval:record:002",
    entityId: base.entityId,
    entityType: base.entityType,
    canonicalName: "Impossible Earlier Retrieval株式会社",
    jurisdiction: base.jurisdiction,
    validFrom: base.validFrom,
    status: base.status,
    names: [{
      name: "Impossible Earlier Retrieval株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:revision-retrieval:002"],
    }],
    identifiers: base.identifiers,
    officialLinks: [],
    sourceRefs: ["source:entity:revision-retrieval:002"],
    observedAt: "2026-08-06T09:30:00+09:00",
    retrievedAt: "2026-08-06T09:59:00+09:00",
    supersedesRecordId: base.recordId,
  });

  writeFileSync(entitiesPath, `${JSON.stringify(base)}\n${JSON.stringify(impossibleHead)}\n`, "utf-8");
  writeFileSync(relationshipsPath, "", "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "entity_revision_retrieval_not_monotonic" && item.target === impossibleHead.recordId,
  ));
  assert.equal(result.entityRecordCount, 2, "raw append-only revisions remain visible to diagnostics");
  assert.equal(result.activeEntityCount, 1);
  assert.equal(
    result.snapshot.entities[0]?.recordId,
    base.recordId,
    "an impossible superseding retrieval must not shadow the last valid PIT revision",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const orphanDir = mkdtempSync(join(tmpdir(), "security-master-orphan-revision-projection-"));
const orphanEntitiesPath = join(orphanDir, "entities.jsonl");
const orphanRelationshipsPath = join(orphanDir, "relationships.jsonl");

try {
  const orphan = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:orphan-revision:record:002",
    entityId: "entity:orphan-revision",
    entityType: "legal_entity",
    canonicalName: "Orphan Revision株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Orphan Revision株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:orphan-revision:002"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:orphan-revision",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:orphan-revision:002"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:orphan-revision:002"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T10:00:00+09:00",
    supersedesRecordId: "entity:orphan-revision:record:001",
  });

  writeFileSync(orphanEntitiesPath, `${JSON.stringify(orphan)}\n`, "utf-8");
  writeFileSync(orphanRelationshipsPath, "", "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath: orphanEntitiesPath,
    relationshipsPath: orphanRelationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "missing_entity_revision_parent" && item.target === orphan.recordId,
  ));
  assert.equal(result.entityRecordCount, 1, "raw orphan revision remains visible to diagnostics");
  assert.equal(result.activeEntityCount, 0);
  assert.deepEqual(
    result.snapshot.entities,
    [],
    "a revision whose declared parent is absent must not become a PIT snapshot head",
  );
} finally {
  rmSync(orphanDir, { recursive: true, force: true });
}

const relationshipDir = mkdtempSync(join(tmpdir(), "security-master-orphan-relationship-projection-"));
const relationshipEntitiesPath = join(relationshipDir, "entities.jsonl");
const relationshipRelationshipsPath = join(relationshipDir, "relationships.jsonl");

try {
  const owner = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:orphan-relationship-owner:record:001",
    entityId: "entity:orphan-relationship-owner",
    entityType: "legal_entity",
    canonicalName: "Relationship Owner株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Relationship Owner株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:orphan-relationship-owner:001"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:orphan-relationship-owner",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:orphan-relationship-owner:001"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:orphan-relationship-owner:001"],
    observedAt: "2026-08-06T08:00:00+09:00",
    retrievedAt: "2026-08-06T08:30:00+09:00",
  });
  const brand = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:orphan-relationship-brand:record:001",
    entityId: "entity:orphan-relationship-brand",
    entityType: "brand",
    canonicalName: "Relationship Brand",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Relationship Brand",
      kind: "brand",
      language: "en",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:orphan-relationship-brand:001"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:orphan-relationship-brand",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:orphan-relationship-brand:001"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:orphan-relationship-brand:001"],
    observedAt: "2026-08-06T08:00:00+09:00",
    retrievedAt: "2026-08-06T08:30:00+09:00",
  });
  const orphanRelationship = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:orphan-revision:record:002",
    relationshipId: "relationship:orphan-revision",
    relationshipType: "owns_brand",
    fromEntityId: owner.entityId,
    toEntityId: brand.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:orphan-revision:002"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T10:00:00+09:00",
    supersedesRecordId: "relationship:orphan-revision:record:001",
  });

  writeFileSync(
    relationshipEntitiesPath,
    `${JSON.stringify(owner)}\n${JSON.stringify(brand)}\n`,
    "utf-8",
  );
  writeFileSync(
    relationshipRelationshipsPath,
    `${JSON.stringify(orphanRelationship)}\n`,
    "utf-8",
  );

  const result = validateSecurityMasterRepository({
    entitiesPath: relationshipEntitiesPath,
    relationshipsPath: relationshipRelationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "missing_relationship_revision_parent" && item.target === orphanRelationship.recordId,
  ));
  assert.equal(
    result.relationshipRecordCount,
    1,
    "raw orphan relationship revision remains visible to diagnostics",
  );
  assert.equal(result.activeRelationshipCount, 0);
  assert.deepEqual(
    result.snapshot.relationships,
    [],
    "a relationship revision whose declared parent is absent must not enter a PIT snapshot",
  );
} finally {
  rmSync(relationshipDir, { recursive: true, force: true });
}

console.log("security-master revision retrieval projection: invalid superseding revisions fail closed OK");
