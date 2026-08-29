import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-self-relationship-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const entity = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:self-parent:record:001",
    entityId: "entity:self-parent",
    entityType: "legal_entity",
    canonicalName: "Self Parent株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Self Parent株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:self-parent"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:self-parent",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:self-parent"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:self-parent"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T09:01:00+09:00",
  });
  const selfRelationship = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:self-parent:record:001",
    relationshipId: "relationship:self-parent",
    relationshipType: "parent_of",
    fromEntityId: entity.entityId,
    toEntityId: entity.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:self-parent"],
    observedAt: "2026-08-06T09:02:00+09:00",
    retrievedAt: "2026-08-06T09:03:00+09:00",
  });

  writeFileSync(entitiesPath, `${JSON.stringify(entity)}\n`, "utf-8");
  writeFileSync(relationshipsPath, `${JSON.stringify(selfRelationship)}\n`, "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) => item.code === "self_relationship"));
  assert.equal(result.relationshipRecordCount, 1, "raw self relationship remains available for diagnostics");
  assert.equal(result.activeEntityCount, 1, "valid entity remains visible in the read-only snapshot");
  assert.equal(
    result.activeRelationshipCount,
    0,
    "self relationship must fail closed from the read-only snapshot",
  );
  assert.equal(result.snapshot.relationships.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: self relationship fails closed from read-only projection OK");
