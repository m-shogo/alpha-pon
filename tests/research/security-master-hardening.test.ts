import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSecurityMasterRecordsGoverned,
  validateSecurityMasterGoverned,
  verifiedOfficialLinks,
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
  const entityId = overrides.entityId ?? "entity:issuer:hardening";
  const entityType = overrides.entityType ?? "legal_entity";
  const canonicalName = overrides.canonicalName ?? "Hardening株式会社";
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${entityId}:record:001`,
    entityId,
    entityType,
    canonicalName,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: overrides.status ?? "active",
    names: overrides.names ?? [{
      name: canonicalName,
      kind: entityType === "brand" ? "brand" : "legal",
      validFrom: "2020-01-01",
      sourceRefs: [`source:name:${entityId}`],
    }],
    identifiers: overrides.identifiers ?? [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${entityId}`],
    }],
    officialLinks: overrides.officialLinks ?? [
      {
        kind: "website",
        url: "https://example.com/",
        verificationStatus: "verified_official",
        validFrom: "2020-01-01",
        sourceRefs: [`source:web:${entityId}`],
      },
      {
        kind: "sns",
        url: "https://example.com/unverified-account",
        platform: "example-sns",
        verificationStatus: "claimed",
        validFrom: "2020-01-01",
        sourceRefs: [`source:sns:${entityId}`],
      },
    ],
    sourceRefs: [`source:entity:${entityId}`],
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:01:00+09:00",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

function relationship(overrides: Partial<SecurityMasterRelationshipRecordInput> = {}) {
  const relationshipId = overrides.relationshipId ?? "relationship:hardening-parent";
  return withSecurityRelationshipHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${relationshipId}:record:001`,
    relationshipId,
    relationshipType: overrides.relationshipType ?? "parent_of",
    fromEntityId: overrides.fromEntityId ?? "entity:issuer:parent",
    toEntityId: overrides.toEntityId ?? "entity:issuer:child",
    validFrom: overrides.validFrom ?? "2020-01-01",
    confidence: overrides.confidence ?? "verified",
    sourceRefs: [`source:relationship:${relationshipId}`],
    observedAt: overrides.observedAt ?? "2026-08-05T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:01:00+09:00",
    ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

{
  const record = entity();
  const links = verifiedOfficialLinks(record, "2026-08-05");
  assert.equal(links.length, 1);
  assert.equal(links[0].verificationStatus, "verified_official");
  console.log("security-master-hardening: verified official links only OK");
}

{
  const first = entity({
    recordId: "entity-cycle-record-a",
    supersedesRecordId: "entity-cycle-record-b",
  });
  const second = entity({
    recordId: "entity-cycle-record-b",
    supersedesRecordId: "entity-cycle-record-a",
    observedAt: "2026-08-05T16:00:00+09:00",
    retrievedAt: "2026-08-05T16:01:00+09:00",
  });
  assert.ok(validateSecurityMasterGoverned([first, second], [], schemas)
    .some((item) => item.code === "entity_revision_cycle"));
  console.log("security-master-hardening: entity revision cycle block OK");
}

{
  const parent = entity({ entityId: "entity:issuer:parent", canonicalName: "Parent株式会社" });
  const child = entity({ entityId: "entity:issuer:child", canonicalName: "Child株式会社" });
  const subsidiaryOnly = relationship({
    relationshipId: "relationship:child-subsidiary-parent",
    relationshipType: "subsidiary_of",
    fromEntityId: child.entityId,
    toEntityId: parent.entityId,
  });
  assert.ok(validateSecurityMasterGoverned([parent, child], [subsidiaryOnly], schemas)
    .some((item) => item.code === "missing_parent_of_inverse"));

  const parentOf = relationship({
    relationshipId: "relationship:parent-of-child",
    relationshipType: "parent_of",
    fromEntityId: parent.entityId,
    toEntityId: child.entityId,
  });
  assert.equal(validateSecurityMasterGoverned(
    [parent, child],
    [subsidiaryOnly, parentOf],
    schemas,
  ).some((item) => item.code === "missing_parent_of_inverse"), false);
  console.log("security-master-hardening: ownership inverse contract OK");
}

{
  const issuerA = entity({ entityId: "entity:issuer:a", canonicalName: "A株式会社" });
  const issuerB = entity({ entityId: "entity:issuer:b", canonicalName: "B株式会社" });
  const security = entity({
    entityId: "entity:security:hardening",
    entityType: "listed_security",
    canonicalName: "Hardening普通株式",
    identifiers: [{
      type: "jpx_code",
      value: "9999",
      market: "TSE",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:jpx:9999"],
    }],
  });
  const firstIssuer = relationship({
    relationshipId: "relationship:issuer-a-security",
    relationshipType: "issuer_of",
    fromEntityId: issuerA.entityId,
    toEntityId: security.entityId,
  });
  const secondIssuer = relationship({
    relationshipId: "relationship:issuer-b-security",
    relationshipType: "issuer_of",
    fromEntityId: issuerB.entityId,
    toEntityId: security.entityId,
    validFrom: "2021-01-01",
  });
  assert.ok(validateSecurityMasterGoverned(
    [issuerA, issuerB, security],
    [firstIssuer, secondIssuer],
    schemas,
  ).some((item) => item.code === "overlapping_verified_issuers"));
  console.log("security-master-hardening: overlapping issuer block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-journal-"));
  const paths = {
    entities: join(dir, "entities.jsonl"),
    relationships: join(dir, "relationships.jsonl"),
  };
  const journalPath = `${paths.entities}.batch-journal.json`;
  try {
    writeFileSync(journalPath, `${JSON.stringify({ state: "prepared" })}\n`, "utf-8");
    assert.throws(
      () => appendSecurityMasterRecordsGoverned(
        paths,
        { entities: [entity()], relationships: [] },
        "journal-owner",
        schemas,
      ),
      /incomplete_security_master_batch/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-hardening: incomplete journal blocks automatic append OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-governed-"));
  const paths = {
    entities: join(dir, "entities.jsonl"),
    relationships: join(dir, "relationships.jsonl"),
  };
  try {
    appendSecurityMasterRecordsGoverned(
      paths,
      { entities: [entity()], relationships: [] },
      "governed-owner",
      schemas,
    );
    assert.equal(existsSync(`${paths.entities}.batch-journal.json`), false);
    assert.equal(existsSync(`${paths.entities}.security-master.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-hardening: committed journal cleanup OK");
}

console.log("security-master-hardening: 全テスト成功");
