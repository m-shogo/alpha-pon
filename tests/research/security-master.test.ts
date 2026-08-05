import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSecurityMasterRecords,
  buildSecurityMasterSnapshot,
  resolveEntityByIdentifier,
  resolveListedSecurityContext,
  validateSecurityMaster,
  withSecurityEntityHash,
  withSecurityRelationshipHash,
  type SecurityMasterEntityRecord,
  type SecurityMasterEntityRecordInput,
  type SecurityMasterRelationshipRecord,
  type SecurityMasterRelationshipRecordInput,
  type SecurityMasterSchemas
} from "../../src/research/security-master.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: SecurityMasterSchemas = {
  entity: loadCouncilSchema("research/schemas/security-master-entity-record.schema.json"),
  relationship: loadCouncilSchema("research/schemas/security-master-relationship-record.schema.json")
};

function entity(
  overrides: Partial<SecurityMasterEntityRecordInput> = {}
): SecurityMasterEntityRecord {
  const entityId = overrides.entityId ?? "entity:issuer:alpha";
  const entityType = overrides.entityType ?? "legal_entity";
  const canonicalName = overrides.canonicalName ?? "Alpha株式会社";
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${entityId}:record:001`,
    entityId,
    entityType,
    canonicalName,
    jurisdiction: overrides.jurisdiction ?? "JP",
    validFrom: overrides.validFrom ?? "2020-01-01",
    status: overrides.status ?? "active",
    names: overrides.names ?? [{
      name: canonicalName,
      kind: entityType === "brand" ? "brand" : "legal",
      language: "ja",
      validFrom: overrides.validFrom ?? "2020-01-01",
      sourceRefs: [`source:name:${entityId}`]
    }],
    identifiers: overrides.identifiers ?? [{
      type: "internal",
      value: entityId,
      validFrom: overrides.validFrom ?? "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${entityId}`]
    }],
    officialLinks: overrides.officialLinks ?? [{
      kind: "website",
      url: "https://example.com/",
      verificationStatus: "verified_official",
      validFrom: overrides.validFrom ?? "2020-01-01",
      sourceRefs: [`source:web:${entityId}`]
    }],
    sourceRefs: overrides.sourceRefs ?? [`source:entity:${entityId}`],
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:01:00+09:00",
    ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {})
  });
}

function relationship(
  overrides: Partial<SecurityMasterRelationshipRecordInput> = {}
): SecurityMasterRelationshipRecord {
  const relationshipId = overrides.relationshipId ?? "relationship:issuer:alpha-security";
  return withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${relationshipId}:record:001`,
    relationshipId,
    relationshipType: overrides.relationshipType ?? "issuer_of",
    fromEntityId: overrides.fromEntityId ?? "entity:issuer:alpha",
    toEntityId: overrides.toEntityId ?? "entity:security:1234",
    validFrom: overrides.validFrom ?? "2020-01-01",
    confidence: overrides.confidence ?? "verified",
    sourceRefs: overrides.sourceRefs ?? [`source:relationship:${relationshipId}`],
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:01:00+09:00",
    ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
    ...(overrides.ownershipPct !== undefined
      ? { ownershipPct: overrides.ownershipPct }
      : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {})
  });
}

function validMaster() {
  const issuer = entity();
  const security = entity({
    entityId: "entity:security:1234",
    entityType: "listed_security",
    canonicalName: "Alpha普通株式",
    identifiers: [
      {
        type: "jpx_code",
        value: "1234",
        market: "TSE",
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:jpx:1234"]
      },
      {
        type: "ticker",
        value: "1234",
        market: "TSE",
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:ticker:1234"]
      }
    ]
  });
  const listing = entity({
    entityId: "entity:listing:tse-prime",
    entityType: "listing",
    canonicalName: "東京証券取引所プライム市場",
    identifiers: [{
      type: "market_code",
      value: "TSE-PRIME",
      validFrom: "2022-04-04",
      confidence: "verified",
      sourceRefs: ["source:jpx:market-prime"]
    }]
  });
  const issuerOf = relationship();
  const listedOn = relationship({
    relationshipId: "relationship:security:1234-listing",
    relationshipType: "listed_on",
    fromEntityId: security.entityId,
    toEntityId: listing.entityId
  });
  return {
    entities: [issuer, security, listing],
    relationships: [issuerOf, listedOn]
  };
}

{
  const master = validMaster();
  assert.deepEqual(
    validateSecurityMaster(master.entities, master.relationships, schemas)
      .filter((issue) => issue.severity === "error"),
    []
  );
  const snapshot = buildSecurityMasterSnapshot(
    master.entities,
    master.relationships,
    "2026-08-05"
  );
  const context = resolveListedSecurityContext(snapshot, {
    type: "jpx_code",
    value: "1234",
    market: "TSE"
  });
  assert.equal(context.security.entityId, "entity:security:1234");
  assert.equal(context.issuer.entityId, "entity:issuer:alpha");
  assert.equal(context.listing.entityId, "entity:listing:tse-prime");
  console.log("security-master: verified security/issuer/listing resolution OK");
}

{
  const master = validMaster();
  const snapshot = buildSecurityMasterSnapshot(
    master.entities,
    master.relationships,
    "2026-08-05"
  );
  assert.throws(
    () => resolveEntityByIdentifier(snapshot, { type: "jpx_code", value: "123" }),
    /security_master_not_found/
  );
  console.log("security-master: fuzzy identifier lookup prohibited OK");
}

{
  const oldSecurity = entity({
    entityId: "entity:security:old",
    entityType: "listed_security",
    canonicalName: "旧Alpha普通株式",
    validFrom: "2018-01-01",
    validTo: "2019-12-31",
    status: "inactive",
    identifiers: [{
      type: "ticker",
      value: "ALP",
      market: "TSE",
      validFrom: "2018-01-01",
      validTo: "2019-12-31",
      confidence: "verified",
      sourceRefs: ["source:ticker:old"]
    }]
  });
  const newSecurity = entity({
    entityId: "entity:security:new",
    entityType: "listed_security",
    canonicalName: "新Alpha普通株式",
    validFrom: "2020-01-01",
    identifiers: [{
      type: "ticker",
      value: "ALP",
      market: "TSE",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:ticker:new"]
    }]
  });
  assert.equal(
    validateSecurityMaster([oldSecurity, newSecurity], [], schemas)
      .some((issue) => issue.code === "verified_identifier_collision"),
    false
  );
  assert.equal(
    resolveEntityByIdentifier(
      buildSecurityMasterSnapshot([oldSecurity, newSecurity], [], "2019-06-01"),
      { type: "ticker", value: "ALP", market: "TSE" }
    ).entityId,
    oldSecurity.entityId
  );
  assert.equal(
    resolveEntityByIdentifier(
      buildSecurityMasterSnapshot([oldSecurity, newSecurity], [], "2026-01-01"),
      { type: "ticker", value: "ALP", market: "TSE" }
    ).entityId,
    newSecurity.entityId
  );
  console.log("security-master: time-bounded old ticker resolution OK");
}

{
  const first = validMaster().entities[1];
  const second = entity({
    entityId: "entity:security:collision",
    entityType: "listed_security",
    canonicalName: "Collision普通株式",
    identifiers: [{
      type: "jpx_code",
      value: "1234",
      market: "TSE",
      validFrom: "2021-01-01",
      confidence: "verified",
      sourceRefs: ["source:jpx:collision"]
    }]
  });
  assert.ok(validateSecurityMaster([first, second], [], schemas)
    .some((issue) => issue.code === "verified_identifier_collision"));
  console.log("security-master: overlapping verified identifier collision block OK");
}

{
  const unresolved = entity({
    entityId: "entity:security:unresolved",
    entityType: "listed_security",
    canonicalName: "Unresolved普通株式",
    identifiers: [{
      type: "ticker",
      value: "UNR",
      market: "TSE",
      validFrom: "2020-01-01",
      confidence: "unresolved",
      sourceRefs: ["source:ticker:unresolved"]
    }]
  });
  assert.ok(validateSecurityMaster([unresolved], [], schemas)
    .some((issue) => issue.code === "listed_security_without_verified_identifier"));
  const snapshot = buildSecurityMasterSnapshot([unresolved], [], "2026-01-01");
  assert.throws(
    () => resolveEntityByIdentifier(snapshot, {
      type: "ticker",
      value: "UNR",
      market: "TSE"
    }),
    /security_master_not_found/
  );
  console.log("security-master: unresolved identifier excluded from resolution OK");
}

{
  const parentA = entity({ entityId: "entity:issuer:a", canonicalName: "A株式会社" });
  const parentB = entity({ entityId: "entity:issuer:b", canonicalName: "B株式会社" });
  const aToB = relationship({
    relationshipId: "relationship:a-parent-b",
    relationshipType: "parent_of",
    fromEntityId: parentA.entityId,
    toEntityId: parentB.entityId
  });
  const bToA = relationship({
    relationshipId: "relationship:b-parent-a",
    relationshipType: "parent_of",
    fromEntityId: parentB.entityId,
    toEntityId: parentA.entityId
  });
  assert.ok(validateSecurityMaster([parentA, parentB], [aToB, bToA], schemas)
    .some((issue) => issue.code === "parent_relationship_cycle"));
  console.log("security-master: verified parent cycle block OK");
}

{
  const master = validMaster();
  const wrong = relationship({
    relationshipId: "relationship:wrong-endpoints",
    relationshipType: "owns_brand",
    fromEntityId: "entity:security:1234",
    toEntityId: "entity:listing:tse-prime"
  });
  assert.ok(validateSecurityMaster(master.entities, [wrong], schemas)
    .some((issue) => issue.code === "relationship_endpoint_type_mismatch"));
  console.log("security-master: relationship endpoint type guard OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-"));
  const paths = {
    entities: join(dir, "entities.jsonl"),
    relationships: join(dir, "relationships.jsonl")
  };
  const master = validMaster();
  try {
    appendSecurityMasterRecords(paths, master, "security-master-owner", schemas);
    assert.equal(readFileSync(paths.entities, "utf-8").trim().split("\n").length, 3);
    assert.equal(readFileSync(paths.relationships, "utf-8").trim().split("\n").length, 2);
    assert.throws(
      () => appendSecurityMasterRecords(
        paths,
        { entities: [{ ...master.entities[0], contentHash: "0".repeat(64) }], relationships: [] },
        "bad-owner",
        schemas
      ),
      /invalid_content_hash|duplicate_entity_record_id|duplicate_content_hash/
    );
    assert.equal(existsSync(`${paths.entities}.security-master.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master: single-writer append/fsync guards OK");
}

console.log("security-master: 全テスト成功");
