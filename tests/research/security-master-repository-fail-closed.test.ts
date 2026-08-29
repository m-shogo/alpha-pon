import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

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

console.log("security-master-repository: blocked governed errors fail closed from snapshot OK");
