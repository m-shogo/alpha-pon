import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateSecurityMasterRepository,
} from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
  type SecurityMasterEntityRecord,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";

function legalEntity(input: {
  entityId: string;
  recordId: string;
  canonicalName: string;
  validFrom: string;
}): SecurityMasterEntityRecord {
  const base: SecurityMasterEntityRecordInput = {
    schemaVersion: 1,
    recordId: input.recordId,
    entityId: input.entityId,
    entityType: "legal_entity",
    canonicalName: input.canonicalName,
    jurisdiction: "JP",
    validFrom: input.validFrom,
    status: "active",
    names: [{
      name: input.canonicalName,
      kind: "legal",
      language: "ja",
      validFrom: input.validFrom,
      sourceRefs: [`source:name:${input.entityId}`],
    }],
    identifiers: [{
      type: "internal",
      value: input.entityId,
      validFrom: input.validFrom,
      confidence: "verified",
      sourceRefs: [`source:id:${input.entityId}`],
    }],
    officialLinks: [{
      kind: "website",
      url: `https://example.com/${input.entityId.replaceAll(":", "-")}`,
      verificationStatus: "verified_official",
      validFrom: input.validFrom,
      sourceRefs: [`source:web:${input.entityId}`],
    }],
    sourceRefs: [`source:entity:${input.entityId}`],
    observedAt: "2024-12-31T15:00:00+09:00",
    retrievedAt: "2024-12-31T15:01:00+09:00",
  };
  return withSecurityEntityHash(base);
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-snapshot-endpoint-integrity-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  const futureParent = legalEntity({
    entityId: "entity:future-parent",
    recordId: "entity:future-parent:record:001",
    canonicalName: "Future Parent株式会社",
    validFrom: "2026-01-01",
  });
  const currentChild = legalEntity({
    entityId: "entity:current-child",
    recordId: "entity:current-child:record:001",
    canonicalName: "Current Child株式会社",
    validFrom: "2020-01-01",
  });
  const relationship = withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: "relationship:parent:record:001",
    relationshipId: "relationship:parent:future-to-current",
    relationshipType: "parent_of",
    fromEntityId: futureParent.entityId,
    toEntityId: currentChild.entityId,
    validFrom: "2025-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:future-to-current"],
    observedAt: "2025-01-01T09:00:00+09:00",
    retrievedAt: "2025-01-01T09:01:00+09:00",
  });

  try {
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(futureParent)}\n${JSON.stringify(currentChild)}\n`,
      "utf-8",
    );
    writeFileSync(relationshipsPath, `${JSON.stringify(relationship)}\n`, "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2025-06-01",
    });

    assert.ok(result.issues.some((item) =>
      item.code === "snapshot_relationship_missing_from_entity"
      && item.target.includes(relationship.relationshipId),
    ));
    assert.equal(result.snapshot.entities.some((item) => item.entityId === futureParent.entityId), false);
    assert.equal(result.snapshot.entities.some((item) => item.entityId === currentChild.entityId), true);
    assert.equal(result.snapshot.relationships.length, 0);
    assert.equal(result.activeRelationshipCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("security-master-snapshot-endpoint-integrity: as-of dangling relationship fails closed and is excluded OK");
}

console.log("security-master-snapshot-endpoint-integrity.test.ts passed");
