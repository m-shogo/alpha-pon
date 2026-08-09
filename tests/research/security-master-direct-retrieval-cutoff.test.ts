import assert from "node:assert/strict";
import {
  buildSecurityMasterSnapshot,
  withSecurityEntityHash,
  withSecurityRelationshipHash,
  type SecurityMasterEntityRecordInput,
  type SecurityMasterRelationshipRecordInput,
} from "../../src/research/security-master.js";

function entity(
  overrides: Partial<SecurityMasterEntityRecordInput> = {},
) {
  const entityId = overrides.entityId ?? "entity:issuer:pit-cutoff";
  const canonicalName = overrides.canonicalName ?? "PIT Cutoff株式会社";
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${entityId}:record:001`,
    entityId,
    entityType: overrides.entityType ?? "legal_entity",
    canonicalName,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: canonicalName,
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:pit-cutoff"],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:pit-cutoff"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:pit-cutoff"],
    observedAt: overrides.observedAt ?? "2024-06-01T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2024-06-01T15:01:00+09:00",
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function relationship(
  overrides: Partial<SecurityMasterRelationshipRecordInput> = {},
) {
  return withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "relationship:pit-cutoff:record:001",
    relationshipId: overrides.relationshipId ?? "relationship:pit-cutoff",
    relationshipType: overrides.relationshipType ?? "parent_of",
    fromEntityId: overrides.fromEntityId ?? "entity:issuer:pit-cutoff",
    toEntityId: overrides.toEntityId ?? "entity:issuer:pit-cutoff-child",
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:pit-cutoff"],
    observedAt: overrides.observedAt ?? "2024-06-01T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2024-06-01T15:01:00+09:00",
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

{
  const lateRetrievedEntity = entity({
    retrievedAt: "2026-01-10T15:01:00+09:00",
  });
  const snapshot = buildSecurityMasterSnapshot(
    [lateRetrievedEntity],
    [],
    "2025-06-01",
  );
  assert.equal(snapshot.entities.length, 0);
}

{
  const parent = entity();
  const child = entity({
    entityId: "entity:issuer:pit-cutoff-child",
    canonicalName: "PIT Cutoff Child株式会社",
  });
  const lateRetrievedRelationship = relationship({
    retrievedAt: "2026-01-10T15:01:00+09:00",
  });
  const snapshot = buildSecurityMasterSnapshot(
    [parent, child],
    [lateRetrievedRelationship],
    "2025-06-01",
  );
  assert.equal(snapshot.relationships.length, 0);
}

console.log("security-master-direct-retrieval-cutoff.test.ts passed");
