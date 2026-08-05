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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-repository: unresolved Security Master entity block OK");
}

console.log("bitemporal-evidence-repository: 全テスト成功");
