import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash, withSecurityRelationshipHash } from "../../src/research/security-master.js";

function entity(recordId: string, entityId: string, name: string) {
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId,
    entityId,
    entityType: "legal_entity",
    canonicalName: name,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{ name, kind: "legal", language: "ja", validFrom: "2020-01-01", sourceRefs: [`source:name:${entityId}`] }],
    identifiers: [{ type: "internal", value: entityId, validFrom: "2020-01-01", confidence: "verified", sourceRefs: [`source:id:${entityId}`] }],
    officialLinks: [],
    sourceRefs: [`source:${entityId}`],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T09:01:00+09:00",
  });
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-duplicate-entity-record-id-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    const a = entity("entity:duplicate:record:001", "entity:duplicate:a", "Duplicate A株式会社");
    const b = entity("entity:duplicate:record:001", "entity:duplicate:b", "Duplicate B株式会社");
    writeFileSync(entitiesPath, `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`, "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
      cutoffInstant: "2026-08-06T12:00:00+09:00",
    });
    assert.ok(result.issues.some((item) => item.code === "duplicate_entity_record_id"));
    assert.equal(result.entityRecordCount, 2, "raw duplicate records remain diagnosable");
    assert.equal(result.activeEntityCount, 0, "ambiguous entity record identity must fail closed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-duplicate-relationship-record-id-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  try {
    const parent = entity("entity:parent:record:001", "entity:parent", "Parent株式会社");
    const child = entity("entity:child:record:001", "entity:child", "Child株式会社");
    const relationship = (relationshipId: string, type: "parent_of" | "subsidiary_of", from: string, to: string) =>
      withSecurityRelationshipHash({
        schemaVersion: 1,
        recordId: "relationship:duplicate:record:001",
        relationshipId,
        relationshipType: type,
        fromEntityId: from,
        toEntityId: to,
        validFrom: "2020-01-01",
        confidence: "unresolved",
        sourceRefs: [`source:${relationshipId}`],
        observedAt: "2026-08-06T09:02:00+09:00",
        retrievedAt: "2026-08-06T09:03:00+09:00",
      });
    const a = relationship("relationship:duplicate:a", "parent_of", parent.entityId, child.entityId);
    const b = relationship("relationship:duplicate:b", "subsidiary_of", child.entityId, parent.entityId);
    writeFileSync(entitiesPath, `${JSON.stringify(parent)}\n${JSON.stringify(child)}\n`, "utf-8");
    writeFileSync(relationshipsPath, `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`, "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2026-08-06",
      cutoffInstant: "2026-08-06T12:00:00+09:00",
    });
    assert.ok(result.issues.some((item) => item.code === "duplicate_relationship_record_id"));
    assert.equal(result.relationshipRecordCount, 2, "raw duplicate relationships remain diagnosable");
    assert.equal(result.activeEntityCount, 0, "ambiguous repository identity blocks the whole read-only snapshot");
    assert.equal(result.activeRelationshipCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("security-master: duplicate record ids fail closed from read-only projection OK");
