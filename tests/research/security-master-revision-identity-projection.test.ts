import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash, withSecurityRelationshipHash } from "../../src/research/security-master.js";

function entity(
  entityId: string,
  recordId: string,
  entityType: "legal_entity" | "brand",
  name: string,
) {
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId,
    entityId,
    entityType,
    canonicalName: name,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name,
      kind: entityType === "brand" ? "brand" : "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: [`source:name:${recordId}`],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${recordId}`],
    }],
    officialLinks: [],
    sourceRefs: [`source:entity:${recordId}`],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T09:30:00+09:00",
  });
}

const entityDir = mkdtempSync(join(tmpdir(), "security-master-revision-identity-entity-"));
try {
  const entitiesPath = join(entityDir, "entities.jsonl");
  const relationshipsPath = join(entityDir, "relationships.jsonl");
  const base = entity(
    "entity:identity-base",
    "entity:identity-base:record:001",
    "legal_entity",
    "Identity Base株式会社",
  );
  const invalidHead = withSecurityEntityHash({
    ...base,
    recordId: "entity:identity-base:record:002",
    entityId: "entity:identity-mutated",
    canonicalName: "Identity Mutated株式会社",
    names: [{
      name: "Identity Mutated株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:identity-mutated:002"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:identity-mutated",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:identity-mutated:002"],
    }],
    sourceRefs: ["source:entity:identity-mutated:002"],
    observedAt: "2026-08-06T10:00:00+09:00",
    retrievedAt: "2026-08-06T10:30:00+09:00",
    supersedesRecordId: base.recordId,
  });

  writeFileSync(entitiesPath, `${JSON.stringify(base)}\n${JSON.stringify(invalidHead)}\n`, "utf-8");
  writeFileSync(relationshipsPath, "", "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "entity_revision_identity_mismatch" && item.target === invalidHead.recordId,
  ));
  assert.equal(result.entityRecordCount, 2, "raw identity-changing revision remains diagnostic evidence");
  assert.equal(result.snapshot.entities[0]?.recordId, base.recordId);
  assert.equal(result.snapshot.entities[0]?.entityId, base.entityId);
} finally {
  rmSync(entityDir, { recursive: true, force: true });
}

const relationshipDir = mkdtempSync(join(tmpdir(), "security-master-revision-identity-relationship-"));
try {
  const entitiesPath = join(relationshipDir, "entities.jsonl");
  const relationshipsPath = join(relationshipDir, "relationships.jsonl");
  const ownerA = entity("entity:identity-owner-a", "entity:identity-owner-a:record:001", "legal_entity", "Owner A株式会社");
  const ownerB = entity("entity:identity-owner-b", "entity:identity-owner-b:record:001", "legal_entity", "Owner B株式会社");
  const brand = entity("entity:identity-brand", "entity:identity-brand:record:001", "brand", "Identity Brand");
  const base = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:identity:record:001",
    relationshipId: "relationship:identity",
    relationshipType: "owns_brand",
    fromEntityId: ownerA.entityId,
    toEntityId: brand.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:identity:001"],
    observedAt: "2026-08-06T10:00:00+09:00",
    retrievedAt: "2026-08-06T10:30:00+09:00",
  });
  const invalidHead = withSecurityRelationshipHash({
    ...base,
    recordId: "relationship:identity:record:002",
    fromEntityId: ownerB.entityId,
    sourceRefs: ["source:relationship:identity:002"],
    observedAt: "2026-08-06T11:00:00+09:00",
    retrievedAt: "2026-08-06T11:30:00+09:00",
    supersedesRecordId: base.recordId,
  });

  writeFileSync(
    entitiesPath,
    `${JSON.stringify(ownerA)}\n${JSON.stringify(ownerB)}\n${JSON.stringify(brand)}\n`,
    "utf-8",
  );
  writeFileSync(relationshipsPath, `${JSON.stringify(base)}\n${JSON.stringify(invalidHead)}\n`, "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "relationship_revision_identity_mismatch" && item.target === invalidHead.recordId,
  ));
  assert.equal(result.relationshipRecordCount, 2, "raw identity-changing relationship stays diagnostic");
  assert.equal(result.snapshot.relationships[0]?.recordId, base.recordId);
  assert.equal(result.snapshot.relationships[0]?.fromEntityId, ownerA.entityId);
} finally {
  rmSync(relationshipDir, { recursive: true, force: true });
}

console.log("security-master revision identity projection: identity-changing revisions fail closed OK");
