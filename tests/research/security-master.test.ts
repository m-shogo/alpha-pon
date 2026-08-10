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
    observedAt: "2018-01-01T09:00:00+09:00",
    retrievedAt: "2018-01-01T09:01:00+09:00",
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
    observedAt: "2020-01-01T09:00:00+09:00",
    retrievedAt: "2020-01-01T09:01:00+09:00",
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
  const credentialLinkEntity = entity({
    recordId: "entity:issuer:alpha:record:credential-url",
    officialLinks: [{
      kind: "website",
      url: "https://user:password@example.com/ir",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: ["source:web:credential-test"]
    }]
  });
  assert.ok(validateSecurityMaster([credentialLinkEntity], [], schemas)
    .some((issue) => issue.code === "invalid_official_url"));

  for (const [index, url] of [
    "https://example.com/ir?token=synthetic",
    "https://example.com/ir?document=123&api_key=synthetic",
    "https://example.com/ir#password=synthetic",
    "https://example.com/ir#section&subscription-key=synthetic",
    "https://example.com/ir?%74oken=synthetic",
    "https://example.com/ir?document=123&api%5Fkey=synthetic",
    "https://example.com/ir#%70assword=synthetic",
    "https://example.com/ir#section&subscription%2Dkey=synthetic",
    "https://example.com/ir?token%3Dsynthetic"
  ].entries()) {
    const secretParamLinkEntity = entity({
      recordId: `entity:issuer:alpha:record:credential-param-${index}`,
      officialLinks: [{
        kind: "website",
        url,
        verificationStatus: "verified_official",
        validFrom: "2020-01-01",
        sourceRefs: [`source:web:credential-param-${index}`]
      }]
    });
    assert.ok(validateSecurityMaster([secretParamLinkEntity], [], schemas)
      .some((issue) => issue.code === "invalid_official_url"));
  }

  const normalLinkEntity = entity({
    recordId: "entity:issuer:alpha:record:normal-url",
    officialLinks: [{
      kind: "website",
      url: "https://example.com/ir?document=123#results",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: ["source:web:normal-test"]
    }]
  });
  assert.equal(validateSecurityMaster([normalLinkEntity], [], schemas)
    .some((issue) => issue.code === "invalid_official_url"), false);
  console.log("security-master: official URL credentials blocked OK");
}

{
  const previousEntity = entity({
    recordId: "entity:issuer:alpha:record:pit-001",
    canonicalName: "Known At Cutoff株式会社",
    observedAt: "2024-01-10T15:00:00+09:00",
    retrievedAt: "2024-01-10T15:01:00+09:00"
  });
  const futureEntityRevision = entity({
    recordId: "entity:issuer:alpha:record:pit-002",
    canonicalName: "Future Correction株式会社",
    observedAt: "2026-01-10T15:00:00+09:00",
    retrievedAt: "2026-01-10T15:01:00+09:00",
    supersedesRecordId: previousEntity.recordId
  });
  const previousRelationship = relationship({
    recordId: "relationship:issuer:alpha-security:record:pit-001",
    observedAt: "2024-01-10T15:00:00+09:00",
    retrievedAt: "2024-01-10T15:01:00+09:00"
  });
  const futureRelationshipRevision = relationship({
    recordId: "relationship:issuer:alpha-security:record:pit-002",
    observedAt: "2026-01-10T15:00:00+09:00",
    retrievedAt: "2026-01-10T15:01:00+09:00",
    supersedesRecordId: previousRelationship.recordId
  });

  const pastSnapshot = buildSecurityMasterSnapshot(
    [previousEntity, futureEntityRevision],
    [previousRelationship, futureRelationshipRevision],
    "2025-06-01"
  );
  assert.equal(pastSnapshot.entities.length, 1);
  assert.equal(pastSnapshot.entities[0]?.recordId, previousEntity.recordId);
  assert.equal(pastSnapshot.entities[0]?.canonicalName, "Known At Cutoff株式会社");
  assert.equal(pastSnapshot.relationships.length, 1);
  assert.equal(pastSnapshot.relationships[0]?.recordId, previousRelationship.recordId);

  const futureSnapshot = buildSecurityMasterSnapshot(
    [previousEntity, futureEntityRevision],
    [previousRelationship, futureRelationshipRevision],
    "2026-01-10"
  );
  assert.equal(futureSnapshot.entities.length, 1);
  assert.equal(futureSnapshot.entities[0]?.recordId, futureEntityRevision.recordId);
  assert.equal(futureSnapshot.relationships.length, 1);
  assert.equal(futureSnapshot.relationships[0]?.recordId, futureRelationshipRevision.recordId);
  console.log("security-master: direct snapshot builder excludes future-observed revisions OK");
}

{
  const futureObservedEntity = entity({
    recordId: "entity:issuer:alpha:record:fractional-retrieval",
    observedAt: "2026-08-05T15:00:00.000000002+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000001+09:00"
  });
  assert.ok(validateSecurityMaster([futureObservedEntity], [], schemas)
    .some((issue) => issue.code === "retrieved_before_observed"));

  const master = validMaster();
  const futureObservedRelationship = relationship({
    recordId: "relationship:issuer:alpha-security:record:fractional-retrieval",
    observedAt: "2026-08-05T15:00:00.000000002+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000001+09:00"
  });
  assert.ok(validateSecurityMaster(master.entities, [futureObservedRelationship], schemas)
    .some((issue) => issue.code === "retrieved_before_observed"));
  console.log("security-master: fractional retrieved-before-observed blocked OK");
}

{
  const firstEntity = entity({
    recordId: "entity:issuer:alpha:record:fractional-001",
    observedAt: "2026-08-05T15:00:00.000000001+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000001+09:00"
  });
  const nextEntity = entity({
    recordId: "entity:issuer:alpha:record:fractional-002",
    observedAt: "2026-08-05T15:00:00.000000002+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000002+09:00",
    supersedesRecordId: firstEntity.recordId
  });
  assert.equal(validateSecurityMaster([firstEntity, nextEntity], [], schemas)
    .some((issue) => issue.code === "entity_revision_time_not_monotonic"), false);

  const master = validMaster();
  const firstRelationship = relationship({
    recordId: "relationship:issuer:alpha-security:record:fractional-001",
    observedAt: "2026-08-05T15:00:00.000000001+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000001+09:00"
  });
  const nextRelationship = relationship({
    recordId: "relationship:issuer:alpha-security:record:fractional-002",
    observedAt: "2026-08-05T15:00:00.000000002+09:00",
    retrievedAt: "2026-08-05T15:00:00.000000002+09:00",
    supersedesRecordId: firstRelationship.recordId
  });
  assert.equal(validateSecurityMaster(master.entities, [firstRelationship, nextRelationship], schemas)
    .some((issue) => issue.code === "relationship_revision_time_not_monotonic"), false);
  console.log("security-master: fractional revision ordering preserved OK");
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
