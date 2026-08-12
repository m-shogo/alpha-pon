import assert from "node:assert/strict";
import { validateSecurityMasterGoverned } from "../../src/research/security-master-hardening.js";
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

function entity(
  entityId: string,
  canonicalName: string,
  overrides: Partial<SecurityMasterEntityRecordInput> = {},
) {
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
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:00:00.000000001+09:00",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

function relationship(overrides: Partial<SecurityMasterRelationshipRecordInput> = {}) {
  return withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "relationship:endpoint:record:001",
    relationshipId: "relationship:endpoint",
    relationshipType: "parent_of",
    fromEntityId: "entity:endpoint:from",
    toEntityId: "entity:endpoint:to",
    validFrom: "2020-01-01",
    confidence: "verified",
    sourceRefs: ["source:relationship:endpoint"],
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00.000000002+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:00:00.000000003+09:00",
  });
}

{
  const from = entity("entity:endpoint:from", "From株式会社", {
    observedAt: "2026-08-05T15:00:00.000000001+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000003+09:00",
  });
  const to = entity("entity:endpoint:to", "To株式会社");
  const edge = relationship({
    observedAt: "2026-08-05T15:00:00+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000002+09:00",
  });
  const issues = validateSecurityMasterGoverned([from, to], [edge], schemas);
  assert.ok(issues.some((item) => item.code === "relationship_observed_before_from_entity"));
  assert.ok(issues.some((item) => item.code === "relationship_retrieved_before_from_entity"));
}

{
  const from = entity("entity:endpoint:from", "From株式会社");
  const to = entity("entity:endpoint:to", "To株式会社", {
    observedAt: "2026-08-05T15:00:00.000000001+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000003+09:00",
  });
  const edge = relationship({
    observedAt: "2026-08-05T15:00:00+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000002+09:00",
  });
  const issues = validateSecurityMasterGoverned([from, to], [edge], schemas);
  assert.ok(issues.some((item) => item.code === "relationship_observed_before_to_entity"));
  assert.ok(issues.some((item) => item.code === "relationship_retrieved_before_to_entity"));
}

{
  const firstFrom = entity("entity:endpoint:from", "From株式会社");
  const laterFrom = entity("entity:endpoint:from", "From株式会社", {
    recordId: "entity:endpoint:from:record:002",
    observedAt: "2026-08-06T15:00:00+09:00",
    retrievedAt: "2026-08-06T15:00:01+09:00",
    supersedesRecordId: firstFrom.recordId,
  });
  const to = entity("entity:endpoint:to", "To株式会社");
  const edge = relationship();
  const issues = validateSecurityMasterGoverned([firstFrom, laterFrom, to], [edge], schemas);
  assert.equal(issues.some((item) => item.code.startsWith("relationship_observed_before_")), false);
  assert.equal(issues.some((item) => item.code.startsWith("relationship_retrieved_before_")), false);
}

console.log("security-master-relationship-endpoint-chronology: all tests passed");
