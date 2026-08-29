import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateBitemporalEvidenceRepository,
} from "../../src/research/bitemporal-evidence-repository.js";
import {
  withEvidenceRecordHash,
} from "../../src/research/bitemporal-evidence-store.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

{
  const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-repository-empty-"));
  try {
    const result = validateBitemporalEvidenceRepository({
      evidencePath: join(dir, "missing-evidence.jsonl"),
      relationsPath: join(dir, "missing-relations.jsonl"),
      securityEntitiesPath: join(dir, "missing-security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "missing-security-relationships.jsonl"),
      asOf: "2026-08-06T00:00:00+09:00",
    });
    assert.equal(result.evidenceRecordCount, 0);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-repository-invalid-asof-"));
  const evidencePath = join(dir, "evidence.jsonl");
  try {
    writeFileSync(evidencePath, "{}", "utf-8");
    for (const invalidAsOf of ["2026-08-06T12:00:00", "2026-02-30T12:00:00+09:00"]) {
      const result = validateBitemporalEvidenceRepository({
        evidencePath,
        relationsPath: join(dir, "relations.jsonl"),
        securityEntitiesPath: join(dir, "security-entities.jsonl"),
        securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
        asOf: invalidAsOf,
      });
      assert.ok(result.issues.some((issue) => issue.code === "invalid_evidence_repository_as_of"));
      assert.equal(result.evidenceRecordCount, 0);
      assert.equal(result.snapshotEvidenceCount, 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: invalid asOf fails closed before local reads OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-repository-partial-"));
  const evidencePath = join(dir, "evidence.jsonl");
  try {
    writeFileSync(evidencePath, "{}", "utf-8");
    const result = validateBitemporalEvidenceRepository({
      evidencePath,
      relationsPath: join(dir, "relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T00:00:00+09:00",
    });
    assert.ok(result.issues.some((issue) => issue.code === "partial_jsonl_tail"));
    assert.equal(result.snapshotEvidenceCount, 0);
    assert.equal(result.snapshotRelationCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: partial tail block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-repository-journal-"));
  const evidencePath = join(dir, "evidence.jsonl");
  try {
    writeFileSync(`${evidencePath}.batch-journal.json`, "{}\n", "utf-8");
    const result = validateBitemporalEvidenceRepository({
      evidencePath,
      relationsPath: join(dir, "relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T00:00:00+09:00",
    });
    assert.ok(result.issues.some((issue) => issue.code === "incomplete_evidence_batch"));
    assert.equal(result.snapshotEvidenceCount, 0);
    assert.equal(result.snapshotRelationCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: incomplete journal block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-repository-entity-"));
  const evidencePath = join(dir, "evidence.jsonl");
  try {
    const record = withEvidenceRecordHash({
      schemaVersion: 1,
      recordId: "evidence:unknown-entity:record:001",
      evidenceId: "evidence:unknown-entity",
      entityIds: ["entity:issuer:not-in-security-master"],
      sourceId: "tdnet",
      sourceType: "exchange_disclosure",
      sourceLocator: "tdnet:unknown-entity",
      documentId: "unknown-entity-doc",
      sourceContentHash: "a".repeat(64),
      eventAtStatus: "known",
      eventAt: "2026-08-05T15:30:00+09:00",
      publishedAt: "2026-08-05T15:30:00+09:00",
      observedAt: "2026-08-05T15:31:00+09:00",
      retrievedAt: "2026-08-05T15:32:00+09:00",
      effectiveFrom: "2026-08-05T15:30:00+09:00",
      firstExecutableAt: "2026-08-06T09:00:00+09:00",
      evidenceTier: "primary_authoritative",
      status: "active",
      license: "metadata_only",
      storagePolicy: "hash_only",
      title: "Unknown entity evidence",
      summary: "Security Masterに存在しないentityを参照",
      retrievalRunId: "run-unknown-entity",
      parserVersion: "parser-v1",
    });
    writeFileSync(evidencePath, `${JSON.stringify(record)}\n`, "utf-8");
    const result = validateBitemporalEvidenceRepository({
      evidencePath,
      relationsPath: join(dir, "relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T12:00:00+09:00",
    });
    assert.ok(result.issues.some((issue) => issue.code === "unknown_security_master_entity"));
    assert.equal(result.evidenceRecordCount, 1, "raw record count remains available for diagnostics");
    assert.equal(result.snapshotEvidenceCount, 0, "invalid governed Evidence must not enter read-only projection");
    assert.equal(result.recommendationEligibleCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: unresolved Security Master entity fails closed from snapshot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-repository-security-cutoff-"));
  const evidencePath = join(dir, "evidence.jsonl");
  const securityEntitiesPath = join(dir, "security-entities.jsonl");
  const entityId = "entity:issuer:future-same-day";
  try {
    const futureEntity = withSecurityEntityHash({
      schemaVersion: 1,
      recordId: "entity:future-same-day:record:001",
      entityId,
      entityType: "legal_entity",
      canonicalName: "Future Same Day株式会社",
      jurisdiction: "JP",
      validFrom: "2020-01-01",
      status: "active",
      names: [{
        name: "Future Same Day株式会社",
        kind: "legal",
        language: "ja",
        validFrom: "2020-01-01",
        sourceRefs: ["source:name:future-same-day"],
      }],
      identifiers: [{
        type: "internal",
        value: entityId,
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:id:future-same-day"],
      }],
      officialLinks: [],
      sourceRefs: ["source:entity:future-same-day"],
      observedAt: "2026-08-06T18:00:00+09:00",
      retrievedAt: "2026-08-06T18:01:00+09:00",
    });
    const evidence = withEvidenceRecordHash({
      schemaVersion: 1,
      recordId: "evidence:future-same-day-identity:record:001",
      evidenceId: "evidence:future-same-day-identity",
      entityIds: [entityId],
      sourceId: "tdnet",
      sourceType: "exchange_disclosure",
      sourceLocator: "tdnet:future-same-day-identity",
      documentId: "future-same-day-identity-doc",
      sourceContentHash: "b".repeat(64),
      eventAtStatus: "known",
      eventAt: "2026-08-06T10:00:00+09:00",
      publishedAt: "2026-08-06T10:00:00+09:00",
      observedAt: "2026-08-06T10:01:00+09:00",
      retrievedAt: "2026-08-06T10:02:00+09:00",
      effectiveFrom: "2026-08-06T10:00:00+09:00",
      firstExecutableAt: "2026-08-06T11:00:00+09:00",
      evidenceTier: "primary_authoritative",
      status: "active",
      license: "metadata_only",
      storagePolicy: "hash_only",
      title: "Evidence before identity availability",
      summary: "同日夕方に初めて取得したidentityを正午snapshotで先取りしてはいけない",
      retrievalRunId: "run-future-same-day-identity",
      parserVersion: "parser-v1",
    });
    writeFileSync(securityEntitiesPath, `${JSON.stringify(futureEntity)}\n`, "utf-8");
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`, "utf-8");

    const result = validateBitemporalEvidenceRepository({
      evidencePath,
      relationsPath: join(dir, "relations.jsonl"),
      securityEntitiesPath,
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T12:00:00+09:00",
    });

    assert.ok(
      result.issues.some((item) => item.code === "unknown_security_master_entity"),
      "evidence must not borrow an identity first observed and retrieved later on the same JST day",
    );
    assert.equal(result.snapshotEvidenceCount, 0, "future identity dependency must fail closed from projection");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: exact Security Master PIT cutoff fails closed from snapshot OK");
}

console.log("bitemporal-evidence-repository: 全テスト成功");