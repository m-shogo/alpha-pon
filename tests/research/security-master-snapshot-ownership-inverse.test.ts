import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-snapshot-ownership-inverse-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const entity = (entityId: string, name: string) => withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${entityId}:record:001`,
    entityId,
    entityType: "legal_entity",
    canonicalName: name,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name,
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: [`source:name:${entityId}`],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${entityId}`],
    }],
    officialLinks: [],
    sourceRefs: [`source:entity:${entityId}`],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T09:01:00+09:00",
  });
  const parent = entity("entity:parent:inverse", "Parent Inverse株式会社");
  const child = entity("entity:child:inverse", "Child Inverse株式会社");
  const subsidiary = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:subsidiary:inverse:record:001",
    relationshipId: "relationship:subsidiary:inverse",
    relationshipType: "subsidiary_of",
    fromEntityId: child.entityId,
    toEntityId: parent.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:subsidiary:inverse"],
    observedAt: "2026-08-06T09:02:00+09:00",
    retrievedAt: "2026-08-06T09:03:00+09:00",
  });

  writeFileSync(entitiesPath, `${JSON.stringify(parent)}\n${JSON.stringify(child)}\n`, "utf-8");
  writeFileSync(relationshipsPath, `${JSON.stringify(subsidiary)}\n`, "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) => item.code === "missing_parent_of_inverse"));
  assert.ok(result.issues.some((item) => item.code === "snapshot_missing_parent_of_inverse"));
  assert.equal(result.relationshipRecordCount, 1, "raw relationship remains visible to diagnostics");
  assert.equal(result.activeEntityCount, 2, "valid endpoints remain visible in read-only projection");
  assert.equal(result.activeRelationshipCount, 0, "verified subsidiary without its inverse must fail closed from snapshot");
  assert.equal(result.snapshot.relationships.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master snapshot ownership inverse: incomplete verified ownership fails closed OK");
