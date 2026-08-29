import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-ownership-pct-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const issuer = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:issuer:ownership-pct:record:001",
    entityId: "entity:issuer:ownership-pct",
    entityType: "legal_entity",
    canonicalName: "Issuer株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Issuer株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:issuer:ownership-pct"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:issuer:ownership-pct",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:issuer:ownership-pct"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:issuer:ownership-pct"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T09:01:00+09:00",
  });

  const security = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:security:ownership-pct:record:001",
    entityId: "entity:security:ownership-pct",
    entityType: "listed_security",
    canonicalName: "Issuer普通株式",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Issuer普通株式",
      kind: "trade",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:security:ownership-pct"],
    }],
    identifiers: [{
      type: "ticker",
      value: "SYN1",
      market: "XTKS",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:security:ownership-pct"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:security:ownership-pct"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T09:01:00+09:00",
  });

  const invalidIssuerRelationship = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:issuer:ownership-pct:record:001",
    relationshipId: "relationship:issuer:ownership-pct",
    relationshipType: "issuer_of",
    fromEntityId: issuer.entityId,
    toEntityId: security.entityId,
    validFrom: "2020-01-01",
    ownershipPct: 51,
    confidence: "verified",
    sourceRefs: ["source:relationship:issuer:ownership-pct"],
    observedAt: "2026-08-06T09:02:00+09:00",
    retrievedAt: "2026-08-06T09:03:00+09:00",
  });

  writeFileSync(
    entitiesPath,
    `${JSON.stringify(issuer)}\n${JSON.stringify(security)}\n`,
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

  assert.ok(
    result.issues.some((item) => item.code === "ownership_pct_on_non_ownership_relationship"),
  );
  assert.equal(
    result.relationshipRecordCount,
    1,
    "raw invalid relationship remains available for diagnostics",
  );
  assert.equal(result.activeEntityCount, 2, "valid endpoint entities remain visible");
  assert.equal(
    result.activeRelationshipCount,
    0,
    "ownershipPct on a non-ownership relationship must fail closed from the read-only snapshot",
  );
  assert.equal(result.snapshot.relationships.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: invalid ownershipPct fails closed from read-only projection OK");
