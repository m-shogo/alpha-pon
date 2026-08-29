import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
  type SecurityEntityType,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-history-type-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const entity = (
    entityId: string,
    entityType: SecurityEntityType,
    canonicalName: string,
  ) => withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${entityId}:record:001`,
    entityId,
    entityType,
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
    identifiers: entityType === "listed_security" ? [{
      type: "jpx_code",
      value: "9999",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${entityId}`],
    }] : [{
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

  const legalOld = entity("entity:legal:old", "legal_entity", "Old Legal株式会社");
  const legalNew = entity("entity:legal:new", "legal_entity", "New Legal株式会社");
  const security = entity("entity:security:history-mismatch", "listed_security", "Mismatch Security");

  const relationship = (
    relationshipId: string,
    fromEntityId: string,
    toEntityId: string,
    minute: number,
  ) => withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: `${relationshipId}:record:001`,
    relationshipId,
    relationshipType: "renamed_from",
    fromEntityId,
    toEntityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: [`source:${relationshipId}`],
    observedAt: `2026-08-06T09:${String(minute).padStart(2, "0")}:00+09:00`,
    retrievedAt: `2026-08-06T09:${String(minute + 1).padStart(2, "0")}:00+09:00`,
  });

  const validHistory = relationship(
    "relationship:history:valid",
    legalNew.entityId,
    legalOld.entityId,
    2,
  );
  const mismatchedHistory = relationship(
    "relationship:history:mismatched",
    legalNew.entityId,
    security.entityId,
    4,
  );

  writeFileSync(
    entitiesPath,
    `${[legalOld, legalNew, security].map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
  writeFileSync(
    relationshipsPath,
    `${[validHistory, mismatchedHistory].map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  const mismatchTarget = `relationship:${mismatchedHistory.relationshipId}:${mismatchedHistory.recordId}`;
  assert.ok(
    result.issues.some(
      (item) => item.code === "history_relationship_type_mismatch" && item.target === mismatchTarget,
    ),
    "the governed validator must retain the cross-type history diagnostic",
  );
  assert.equal(result.relationshipRecordCount, 2, "raw append-only relationships remain intact");
  assert.equal(result.activeEntityCount, 3, "valid endpoint entities remain visible");
  assert.ok(
    result.snapshot.relationships.some((record) => record.relationshipId === validHistory.relationshipId),
    "same-type history remains available in the read-only snapshot",
  );
  assert.equal(
    result.snapshot.relationships.some(
      (record) => record.relationshipId === mismatchedHistory.relationshipId,
    ),
    false,
    "cross-type renamed_from must fail closed from the read-only snapshot",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: history relationship type mismatch fails closed from read-only projection OK");
