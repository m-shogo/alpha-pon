import assert from "node:assert/strict";
import {
  validateSecurityMasterGoverned,
} from "../../src/research/security-master-hardening.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
  type SecurityMasterEntityRecordInput,
  type SecurityMasterRelationshipRecordInput,
  type SecurityMasterSchemas,
} from "../../src/research/security-master.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: SecurityMasterSchemas = {
  entity: loadCouncilSchema("research/schemas/security-master-entity-record.schema.json"),
  relationship: loadCouncilSchema("research/schemas/security-master-relationship-record.schema.json"),
};

function entity(overrides: Partial<SecurityMasterEntityRecordInput> = {}) {
  const entityId = overrides.entityId ?? "entity:issuer:retrieval-order";
  const canonicalName = overrides.canonicalName ?? "Retrieval Order株式会社";
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${entityId}:record:001`,
    entityId,
    entityType: "legal_entity",
    canonicalName,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: canonicalName,
      kind: "legal",
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
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:01:00.000000001+09:00",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

function relationship(overrides: Partial<SecurityMasterRelationshipRecordInput> = {}) {
  const relationshipId = overrides.relationshipId ?? "relationship:retrieval-order";
  return withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${relationshipId}:record:001`,
    relationshipId,
    relationshipType: "parent_of",
    fromEntityId: overrides.fromEntityId ?? "entity:issuer:retrieval-parent",
    toEntityId: overrides.toEntityId ?? "entity:issuer:retrieval-child",
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: [`source:relationship:${relationshipId}`],
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:01:00.000000001+09:00",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

{
  const first = entity();
  const revision = entity({
    recordId: `${first.entityId}:record:002`,
    observedAt: "2026-08-05T15:00:30+09:00",
    retrievedAt: "2026-08-05T15:01:00+09:00",
    supersedesRecordId: first.recordId,
  });
  const issues = validateSecurityMasterGoverned([first, revision], [], schemas);
  assert.ok(issues.some((item) => item.code === "entity_revision_retrieval_not_monotonic"));
}

{
  const parent = entity({
    entityId: "entity:issuer:retrieval-parent",
    canonicalName: "Retrieval Parent株式会社",
  });
  const child = entity({
    entityId: "entity:issuer:retrieval-child",
    canonicalName: "Retrieval Child株式会社",
  });
  const first = relationship();
  const revision = relationship({
    recordId: `${first.relationshipId}:record:002`,
    observedAt: "2026-08-05T15:00:30+09:00",
    retrievedAt: "2026-08-05T15:01:00+09:00",
    supersedesRecordId: first.recordId,
  });
  const issues = validateSecurityMasterGoverned(
    [parent, child],
    [first, revision],
    schemas,
  );
  assert.ok(issues.some((item) => item.code === "relationship_revision_retrieval_not_monotonic"));
}

{
  const first = entity({
    entityId: "entity:issuer:retrieval-forward",
    canonicalName: "Retrieval Forward株式会社",
  });
  const revision = entity({
    entityId: first.entityId,
    canonicalName: first.canonicalName,
    recordId: `${first.entityId}:record:002`,
    observedAt: "2026-08-05T15:01:00.000000001+09:00",
    retrievedAt: "2026-08-05T15:01:00.000000002+09:00",
    supersedesRecordId: first.recordId,
  });
  const issues = validateSecurityMasterGoverned([first, revision], [], schemas);
  assert.equal(issues.some((item) => item.code === "entity_revision_retrieval_not_monotonic"), false);
}

console.log("security-master-retrieval-revision-chronology: all tests passed");
