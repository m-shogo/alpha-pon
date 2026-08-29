import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-multiple-relationship-heads-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const entity = (entityId: string, canonicalName: string) => withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${entityId}:record:001`,
    entityId,
    entityType: "legal_entity",
    canonicalName,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: canonicalName,
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
  const parent = entity("entity:parent:ambiguous-rel", "Parent株式会社");
  const child = entity("entity:child:ambiguous-rel", "Child株式会社");
  const relationshipId = "relationship:ambiguous-head";
  const relationshipHead = (
    recordId: string,
    observedAt: string,
    retrievedAt: string,
  ) => withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId,
    relationshipId,
    relationshipType: "parent_of",
    fromEntityId: parent.entityId,
    toEntityId: child.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: [`source:relationship:${recordId}`],
    observedAt,
    retrievedAt,
  });
  const headA = relationshipHead(
    "relationship:ambiguous-head:record:a",
    "2026-08-06T09:02:00+09:00",
    "2026-08-06T09:03:00+09:00",
  );
  const headB = relationshipHead(
    "relationship:ambiguous-head:record:b",
    "2026-08-06T09:04:00+09:00",
    "2026-08-06T09:05:00+09:00",
  );

  writeFileSync(
    entitiesPath,
    `${JSON.stringify(parent)}\n${JSON.stringify(child)}\n`,
    "utf-8",
  );
  writeFileSync(
    relationshipsPath,
    `${JSON.stringify(headA)}\n${JSON.stringify(headB)}\n`,
    "utf-8",
  );

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(
    result.issues.some(
      (item) => item.code === "multiple_relationship_heads" && item.target === relationshipId,
    ),
  );
  assert.equal(result.relationshipRecordCount, 2, "raw ambiguous heads remain available for diagnostics");
  assert.equal(result.activeEntityCount, 2, "valid endpoint entities remain visible in the read-only snapshot");
  assert.equal(
    result.activeRelationshipCount,
    0,
    "ambiguous active heads for one relationship identity must fail closed from the read-only snapshot",
  );
  assert.equal(result.snapshot.relationships.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: multiple relationship heads fail closed from read-only projection OK");
