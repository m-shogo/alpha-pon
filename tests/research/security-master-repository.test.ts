import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateSecurityMasterRepository,
} from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-empty-"));
  try {
    const result = validateSecurityMasterRepository({
      entitiesPath: join(dir, "missing-entities.jsonl"),
      relationshipsPath: join(dir, "missing-relationships.jsonl"),
      asOf: "2026-08-06",
    });
    assert.equal(result.entityRecordCount, 0);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-partial-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    writeFileSync(entitiesPath, "{}", "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
    });
    assert.ok(result.issues.some((issue) => issue.code === "partial_jsonl_tail"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: partial tail block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-journal-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    writeFileSync(`${entitiesPath}.batch-journal.json`, "{}\n", "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
    });
    assert.ok(result.issues.some((issue) => issue.code === "incomplete_security_master_batch"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: incomplete journal block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-historical-shadow-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  const base = (overrides: Partial<SecurityMasterEntityRecordInput> = {}) => withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "entity:issuer:history:record:001",
    entityId: "entity:issuer:history",
    entityType: "legal_entity",
    canonicalName: overrides.canonicalName ?? "History株式会社",
    jurisdiction: "JP",
    validFrom: overrides.validFrom ?? "2020-01-01",
    ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
    status: "active",
    names: [{
      name: overrides.canonicalName ?? "History株式会社",
      kind: "legal",
      language: "ja",
      validFrom: overrides.validFrom ?? "2020-01-01",
      ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
      sourceRefs: ["source:name:history"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:issuer:history",
      validFrom: overrides.validFrom ?? "2020-01-01",
      ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
      confidence: "verified",
      sourceRefs: ["source:id:history"],
    }],
    officialLinks: [{
      kind: "website",
      url: "https://example.com/history",
      verificationStatus: "verified_official",
      validFrom: overrides.validFrom ?? "2020-01-01",
      ...(overrides.validTo ? { validTo: overrides.validTo } : {}),
      sourceRefs: ["source:web:history"],
    }],
    sourceRefs: ["source:entity:history"],
    observedAt: overrides.observedAt ?? "2025-01-01T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2025-01-01T15:01:00+09:00",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
  const previous = base({ validTo: "2025-12-31" });
  const futureHead = base({
    recordId: "entity:issuer:history:record:002",
    validFrom: "2026-01-01",
    observedAt: "2026-01-01T15:00:00+09:00",
    retrievedAt: "2026-01-01T15:01:00+09:00",
    supersedesRecordId: previous.recordId,
  });
  try {
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(previous)}\n${JSON.stringify(futureHead)}\n`,
      "utf-8",
    );
    writeFileSync(relationshipsPath, "", "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2025-06-01",
    });
    assert.ok(result.issues.some((issue) => issue.code === "historical_entity_revision_shadowed"));
    assert.equal(result.snapshot.entities.length, 1);
    assert.equal(result.snapshot.entities[0]?.recordId, previous.recordId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: future effective head cannot erase historical entity snapshot OK");
}

console.log("security-master-repository: 全テスト成功");