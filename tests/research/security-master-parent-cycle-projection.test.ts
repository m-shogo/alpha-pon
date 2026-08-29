import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-parent-cycle-projection-"));
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

  const a = entity("entity:cycle:a", "Cycle A株式会社");
  const b = entity("entity:cycle:b", "Cycle B株式会社");
  const c = entity("entity:cycle:c", "Cycle C株式会社");
  const d = entity("entity:clean:d", "Clean D株式会社");
  const e = entity("entity:clean:e", "Clean E株式会社");

  const parentOf = (
    relationshipId: string,
    fromEntityId: string,
    toEntityId: string,
    minute: number,
  ) => withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: `${relationshipId}:record:001`,
    relationshipId,
    relationshipType: "parent_of",
    fromEntityId,
    toEntityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: [`source:${relationshipId}`],
    observedAt: `2026-08-06T09:${String(minute).padStart(2, "0")}:00+09:00`,
    retrievedAt: `2026-08-06T09:${String(minute + 1).padStart(2, "0")}:00+09:00`,
  });

  const relationships = [
    parentOf("relationship:cycle:a-b", a.entityId, b.entityId, 2),
    parentOf("relationship:cycle:b-c", b.entityId, c.entityId, 4),
    parentOf("relationship:cycle:c-a", c.entityId, a.entityId, 6),
    parentOf("relationship:clean:d-e", d.entityId, e.entityId, 8),
  ];

  writeFileSync(
    entitiesPath,
    `${[a, b, c, d, e].map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
  writeFileSync(
    relationshipsPath,
    `${relationships.map((record) => JSON.stringify(record)).join("\n")}\n`,
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
      (item) => item.code === "parent_relationship_cycle" && item.target === a.entityId,
    ),
    "the governed validator must retain the parent cycle diagnostic",
  );
  assert.equal(result.relationshipRecordCount, 4, "raw append-only relationship records remain intact");
  assert.equal(result.activeEntityCount, 5, "valid entities remain visible in the read-only snapshot");
  assert.ok(
    result.snapshot.relationships.some((record) => record.relationshipId === "relationship:clean:d-e"),
    "an unrelated verified parent relationship must remain operable",
  );
  assert.ok(
    result.snapshot.relationships.every((record) =>
      !(record.relationshipType === "parent_of" &&
        record.confidence === "verified" &&
        (record.fromEntityId === a.entityId || record.toEntityId === a.entityId)),
    ),
    "cycle-closing parent edges touching the diagnosed cycle node must fail closed from the snapshot",
  );
  assert.equal(
    result.snapshot.relationships.some((record) => record.relationshipId === "relationship:cycle:b-c"),
    true,
    "non-closing edge inside the formerly cyclic component remains available after the cycle is broken",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: parent relationship cycle fails closed from read-only projection OK");
