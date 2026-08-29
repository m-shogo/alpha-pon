import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash, withSecurityRelationshipHash } from "../../src/research/security-master.js";

function legalEntity(entityId: string, recordId: string, name: string, observedAt: string, retrievedAt: string) {
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId,
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
    observedAt,
    retrievedAt,
  });
}

const entityDir = mkdtempSync(join(tmpdir(), "security-master-revision-observed-entity-"));
try {
  const entitiesPath = join(entityDir, "entities.jsonl");
  const relationshipsPath = join(entityDir, "relationships.jsonl");
  const base = legalEntity(
    "entity:revision-observed",
    "entity:revision-observed:record:001",
    "Observed Base株式会社",
    "2026-08-06T10:00:00+09:00",
    "2026-08-06T10:30:00+09:00",
  );
  const invalidHead = withSecurityEntityHash({
    ...base,
    recordId: "entity:revision-observed:record:002",
    canonicalName: "Observed Backward株式会社",
    names: [{
      name: "Observed Backward株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:revision-observed:002"],
    }],
    sourceRefs: ["source:entity:revision-observed:002"],
    observedAt: "2026-08-06T09:59:00+09:00",
    retrievedAt: "2026-08-06T11:00:00+09:00",
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
    item.code === "entity_revision_time_not_monotonic" && item.target === invalidHead.recordId,
  ));
  assert.equal(result.entityRecordCount, 2, "raw revisions remain visible to diagnostics");
  assert.equal(result.snapshot.entities[0]?.recordId, base.recordId);
} finally {
  rmSync(entityDir, { recursive: true, force: true });
}

const relationshipDir = mkdtempSync(join(tmpdir(), "security-master-revision-observed-relationship-"));
try {
  const entitiesPath = join(relationshipDir, "entities.jsonl");
  const relationshipsPath = join(relationshipDir, "relationships.jsonl");
  const owner = legalEntity(
    "entity:revision-observed-owner",
    "entity:revision-observed-owner:record:001",
    "Observed Owner株式会社",
    "2026-08-06T08:00:00+09:00",
    "2026-08-06T08:30:00+09:00",
  );
  const child = legalEntity(
    "entity:revision-observed-child",
    "entity:revision-observed-child:record:001",
    "Observed Child株式会社",
    "2026-08-06T08:00:00+09:00",
    "2026-08-06T08:30:00+09:00",
  );
  const base = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:revision-observed:record:001",
    relationshipId: "relationship:revision-observed",
    relationshipType: "parent_of",
    fromEntityId: owner.entityId,
    toEntityId: child.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:revision-observed:001"],
    observedAt: "2026-08-06T10:00:00+09:00",
    retrievedAt: "2026-08-06T10:30:00+09:00",
  });
  const invalidHead = withSecurityRelationshipHash({
    ...base,
    recordId: "relationship:revision-observed:record:002",
    sourceRefs: ["source:relationship:revision-observed:002"],
    observedAt: "2026-08-06T09:59:00+09:00",
    retrievedAt: "2026-08-06T11:00:00+09:00",
    supersedesRecordId: base.recordId,
  });

  writeFileSync(entitiesPath, `${JSON.stringify(owner)}\n${JSON.stringify(child)}\n`, "utf-8");
  writeFileSync(relationshipsPath, `${JSON.stringify(base)}\n${JSON.stringify(invalidHead)}\n`, "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "relationship_revision_time_not_monotonic" && item.target === invalidHead.recordId,
  ));
  assert.equal(result.relationshipRecordCount, 2, "raw relationship revisions remain visible");
  assert.equal(result.snapshot.relationships[0]?.recordId, base.recordId);
} finally {
  rmSync(relationshipDir, { recursive: true, force: true });
}

console.log("security-master revision observed projection: backward-observed revisions fail closed OK");
