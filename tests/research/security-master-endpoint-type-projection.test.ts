import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-endpoint-type-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const legalEntity = (entityId: string, name: string) => withSecurityEntityHash({
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

  const issuer = legalEntity("entity:issuer:endpoint-type", "Issuer株式会社");
  const wrongSecurityEndpoint = legalEntity(
    "entity:not-listed-security:endpoint-type",
    "Wrong Endpoint株式会社",
  );
  const invalidIssuerRelationship = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:issuer:endpoint-type:record:001",
    relationshipId: "relationship:issuer:endpoint-type",
    relationshipType: "issuer_of",
    fromEntityId: issuer.entityId,
    toEntityId: wrongSecurityEndpoint.entityId,
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:endpoint-type"],
    observedAt: "2026-08-06T09:02:00+09:00",
    retrievedAt: "2026-08-06T09:03:00+09:00",
  });

  writeFileSync(
    entitiesPath,
    `${JSON.stringify(issuer)}\n${JSON.stringify(wrongSecurityEndpoint)}\n`,
    "utf-8",
  );
  writeFileSync(
    relationshipsPath,
    `${JSON.stringify(invalidIssuerRelationship)}\n`,
    "utf-8",
  );

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) => item.code === "relationship_endpoint_type_mismatch"));
  assert.equal(result.relationshipRecordCount, 1, "raw invalid relationship remains available for diagnostics");
  assert.equal(result.activeEntityCount, 2, "valid endpoint entities remain visible in the read-only snapshot");
  assert.equal(
    result.activeRelationshipCount,
    0,
    "relationship with an impossible endpoint type must fail closed from the read-only snapshot",
  );
  assert.equal(result.snapshot.relationships.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: endpoint type mismatch fails closed from read-only projection OK");
