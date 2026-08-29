import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  withSecurityRelationshipHash,
} from "../../src/research/security-master.js";

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-fail-closed-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    const validRecord = withSecurityEntityHash({
      schemaVersion: 1,
      recordId: "entity:invalid-hash:record:001",
      entityId: "entity:issuer:invalid-hash",
      entityType: "legal_entity",
      canonicalName: "Invalid Hash株式会社",
      jurisdiction: "JP",
      validFrom: "2020-01-01",
      status: "active",
      names: [{
        name: "Invalid Hash株式会社",
        kind: "legal",
        language: "ja",
        validFrom: "2020-01-01",
        sourceRefs: ["source:name:invalid-hash"],
      }],
      identifiers: [{
        type: "internal",
        value: "entity:issuer:invalid-hash",
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:id:invalid-hash"],
      }],
      officialLinks: [],
      sourceRefs: ["source:entity:invalid-hash"],
      observedAt: "2026-08-06T10:00:00+09:00",
      retrievedAt: "2026-08-06T10:01:00+09:00",
    });
    const invalidRecord = { ...validRecord, contentHash: "0".repeat(64) };
    writeFileSync(entitiesPath, `${JSON.stringify(invalidRecord)}\n`, "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
      cutoffInstant: "2026-08-06T12:00:00+09:00",
    });

    assert.ok(result.issues.some((item) => item.code === "invalid_content_hash"));
    assert.equal(result.entityRecordCount, 1, "raw record count remains available for diagnostics");
    assert.equal(result.activeEntityCount, 0, "invalid Security Master data must not enter read-only projection");
    assert.equal(result.snapshot.entities.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-governed-error-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    const invalidOfficialUrlRecord = withSecurityEntityHash({
      schemaVersion: 1,
      recordId: "entity:invalid-url:record:001",
      entityId: "entity:issuer:invalid-url",
      entityType: "legal_entity",
      canonicalName: "Invalid URL株式会社",
      jurisdiction: "JP",
      validFrom: "2020-01-01",
      status: "active",
      names: [{
        name: "Invalid URL株式会社",
        kind: "legal",
        language: "ja",
        validFrom: "2020-01-01",
        sourceRefs: ["source:name:invalid-url"],
      }],
      identifiers: [{
        type: "internal",
        value: "entity:issuer:invalid-url",
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:id:invalid-url"],
      }],
      officialLinks: [{
        kind: "website",
        url: "https://example.com/ir?api_key=synthetic-placeholder",
        verificationStatus: "verified_official",
        validFrom: "2020-01-01",
        sourceRefs: ["source:link:invalid-url"],
      }],
      sourceRefs: ["source:entity:invalid-url"],
      observedAt: "2026-08-06T10:00:00+09:00",
      retrievedAt: "2026-08-06T10:01:00+09:00",
    });
    writeFileSync(entitiesPath, `${JSON.stringify(invalidOfficialUrlRecord)}\n`, "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
      cutoffInstant: "2026-08-06T12:00:00+09:00",
    });

    assert.ok(result.issues.some((item) => item.code === "invalid_official_url"));
    assert.equal(result.entityRecordCount, 1, "invalid governed records remain visible to diagnostics");
    assert.equal(result.activeEntityCount, 0, "credential-like official URL errors must fail closed from read-only projection");
    assert.equal(result.snapshot.entities.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-relationship-chronology-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  try {
    const entity = (entityId: string, name: string) => withSecurityEntityHash({
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
      observedAt: "2026-08-06T10:00:00+09:00",
      retrievedAt: "2026-08-06T10:01:00+09:00",
    });
    const parent = entity("entity:parent", "Parent株式会社");
    const child = entity("entity:child", "Child株式会社");
    const impossibleRelationship = withSecurityRelationshipHash({
      schemaVersion: 1,
      recordId: "relationship:parent:record:001",
      relationshipId: "relationship:parent",
      relationshipType: "parent_of",
      fromEntityId: parent.entityId,
      toEntityId: child.entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:relationship:parent"],
      observedAt: "2026-08-06T09:00:00+09:00",
      retrievedAt: "2026-08-06T10:02:00+09:00",
    });
    writeFileSync(entitiesPath, `${JSON.stringify(parent)}\n${JSON.stringify(child)}\n`, "utf-8");
    writeFileSync(relationshipsPath, `${JSON.stringify(impossibleRelationship)}\n`, "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2026-08-06",
      cutoffInstant: "2026-08-06T12:00:00+09:00",
    });

    assert.ok(result.issues.some((item) => item.code === "relationship_observed_before_from_entity"));
    assert.ok(result.issues.some((item) => item.code === "relationship_observed_before_to_entity"));
    assert.equal(result.relationshipRecordCount, 1, "invalid relationship remains visible to diagnostics");
    assert.equal(result.activeEntityCount, 2, "valid endpoints remain visible in read-only projection");
    assert.equal(result.activeRelationshipCount, 0, "impossible relationship chronology must not enter snapshot");
    assert.equal(result.snapshot.relationships.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-ambiguous-issuer-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  try {
    const issuer = (entityId: string, name: string) => withSecurityEntityHash({
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
    const issuerA = issuer("entity:issuer:a", "Issuer A株式会社");
    const issuerB = issuer("entity:issuer:b", "Issuer B株式会社");
    const security = withSecurityEntityHash({
      schemaVersion: 1,
      recordId: "entity:security:ambiguous:record:001",
      entityId: "entity:security:ambiguous",
      entityType: "listed_security",
      canonicalName: "Ambiguous Security",
      jurisdiction: "JP",
      validFrom: "2020-01-01",
      status: "active",
      names: [{
        name: "Ambiguous Security",
        kind: "legal",
        language: "en",
        validFrom: "2020-01-01",
        sourceRefs: ["source:name:ambiguous-security"],
      }],
      identifiers: [{
        type: "jpx_code",
        value: "9999",
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:id:ambiguous-security"],
      }],
      officialLinks: [],
      sourceRefs: ["source:entity:ambiguous-security"],
      observedAt: "2026-08-06T09:00:00+09:00",
      retrievedAt: "2026-08-06T09:01:00+09:00",
    });
    const issuerRelationship = (recordId: string, relationshipId: string, fromEntityId: string) =>
      withSecurityRelationshipHash({
        schemaVersion: 1,
        recordId,
        relationshipId,
        relationshipType: "issuer_of",
        fromEntityId,
        toEntityId: security.entityId,
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: [`source:${relationshipId}`],
        observedAt: "2026-08-06T09:02:00+09:00",
        retrievedAt: "2026-08-06T09:03:00+09:00",
      });
    const relationshipA = issuerRelationship(
      "relationship:issuer:a:record:001",
      "relationship:issuer:a",
      issuerA.entityId,
    );
    const relationshipB = issuerRelationship(
      "relationship:issuer:b:record:001",
      "relationship:issuer:b",
      issuerB.entityId,
    );
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(issuerA)}\n${JSON.stringify(issuerB)}\n${JSON.stringify(security)}\n`,
      "utf-8",
    );
    writeFileSync(
      relationshipsPath,
      `${JSON.stringify(relationshipA)}\n${JSON.stringify(relationshipB)}\n`,
      "utf-8",
    );

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2026-08-06",
      cutoffInstant: "2026-08-06T12:00:00+09:00",
    });

    assert.ok(result.issues.some((item) => item.code === "overlapping_verified_issuers"));
    assert.equal(result.relationshipRecordCount, 2, "conflicting issuer records remain visible to diagnostics");
    assert.equal(result.activeEntityCount, 3, "valid entities remain visible in read-only projection");
    assert.equal(result.activeRelationshipCount, 0, "ambiguous verified issuers must fail closed from snapshot");
    assert.equal(result.snapshot.relationships.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("security-master-repository: invalid and ambiguous relationships fail closed from snapshot OK");
