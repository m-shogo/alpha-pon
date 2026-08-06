import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvidenceStoreRecords,
  bindingDispositionByEvidenceId,
  buildEvidenceSnapshot,
  recommendationEligibleEvidence,
  validateBitemporalEvidenceStore,
  withEvidenceRecordHash,
  withEvidenceRelationHash,
  type EvidenceRecord,
  type EvidenceRecordInput,
  type EvidenceRelationRecord,
  type EvidenceRelationRecordInput,
  type EvidenceStoreSchemas,
} from "../../src/research/bitemporal-evidence-store.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: EvidenceStoreSchemas = {
  evidence: loadCouncilSchema("research/schemas/evidence-record.schema.json"),
  relation: loadCouncilSchema("research/schemas/evidence-relation-record.schema.json"),
};
const KNOWN_ENTITIES = new Set(["entity:issuer:alpha", "entity:security:1234"]);

function evidence(overrides: Partial<EvidenceRecordInput> = {}): EvidenceRecord {
  const evidenceId = overrides.evidenceId ?? "evidence:alpha:disclosure:001";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: overrides.entityIds ?? ["entity:issuer:alpha"],
    sourceId: overrides.sourceId ?? "tdnet",
    sourceType: overrides.sourceType ?? "exchange_disclosure",
    sourceLocator: overrides.sourceLocator ?? "tdnet:doc:alpha-001",
    documentId: overrides.documentId ?? "alpha-001",
    sourceContentHash: overrides.sourceContentHash ?? "a".repeat(64),
    eventAtStatus: overrides.eventAtStatus ?? "known",
    eventAt: overrides.eventAt ?? "2026-08-05T15:30:00+09:00",
    publishedAt: overrides.publishedAt ?? "2026-08-05T15:30:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:31:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:32:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T15:30:00+09:00",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T09:00:00+09:00",
    evidenceTier: overrides.evidenceTier ?? "primary_authoritative",
    status: overrides.status ?? "active",
    license: overrides.license ?? "metadata_only",
    storagePolicy: overrides.storagePolicy ?? "hash_only",
    title: overrides.title ?? "Alpha開示",
    summary: overrides.summary ?? "Alphaに関する公式開示",
    retrievalRunId: overrides.retrievalRunId ?? "run-alpha-001",
    parserVersion: overrides.parserVersion ?? "parser-v1",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function relation(
  overrides: Partial<EvidenceRelationRecordInput> = {},
): EvidenceRelationRecord {
  const relationId = overrides.relationId ?? "relation:correction:alpha-001";
  return withEvidenceRelationHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${relationId}:record:001`,
    relationId,
    relationType: overrides.relationType ?? "corrects",
    fromEvidenceId: overrides.fromEvidenceId ?? "evidence:alpha:correction:001",
    toEvidenceId: overrides.toEvidenceId ?? "evidence:alpha:disclosure:001",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-06T10:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-06T10:01:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-06T10:02:00+09:00",
    sourceRefs: overrides.sourceRefs ?? ["evidence:alpha:correction:001"],
    supersessionStrength: overrides.supersessionStrength ?? "binding",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

{
  const record = evidence();
  assert.deepEqual(
    validateBitemporalEvidenceStore([record], [], schemas, KNOWN_ENTITIES)
      .filter((item) => item.severity === "error"),
    [],
  );
  console.log("bitemporal-evidence-store: valid official evidence OK");
}

{
  const record = evidence({
    retrievedAt: "2026-08-05T16:00:00+09:00",
    firstExecutableAt: "2026-08-06T09:00:00+09:00",
  });
  const providerSnapshot = buildEvidenceSnapshot(
    [record],
    [],
    "2026-08-05T15:45:00+09:00",
    "provider_available",
    "knowledge",
  );
  const systemSnapshot = buildEvidenceSnapshot(
    [record],
    [],
    "2026-08-05T15:45:00+09:00",
    "system_replay",
    "knowledge",
  );
  assert.equal(providerSnapshot.evidence.length, 1);
  assert.equal(systemSnapshot.evidence.length, 0);

  const executableSnapshot = buildEvidenceSnapshot(
    [record],
    [],
    "2026-08-05T17:00:00+09:00",
    "system_replay",
    "executable",
  );
  assert.equal(executableSnapshot.evidence.length, 0);
  console.log("bitemporal-evidence-store: provider/system/executable boundaries OK");
}

{
  const original = evidence();
  const revision = evidence({
    recordId: "evidence:alpha:disclosure:001:record:002",
    summary: "Alphaに関する取得後の解析訂正",
    observedAt: "2026-08-06T11:00:00+09:00",
    retrievedAt: "2026-08-06T11:01:00+09:00",
    firstExecutableAt: "2026-08-06T11:01:00+09:00",
    supersedesRecordId: original.recordId,
  });
  assert.equal(
    buildEvidenceSnapshot(
      [original, revision],
      [],
      "2026-08-06T10:00:00+09:00",
      "system_replay",
    ).evidence[0].recordId,
    original.recordId,
  );
  assert.equal(
    buildEvidenceSnapshot(
      [original, revision],
      [],
      "2026-08-06T12:00:00+09:00",
      "system_replay",
    ).evidence[0].recordId,
    revision.recordId,
  );
  console.log("bitemporal-evidence-store: issue-time revision replay OK");
}

{
  const original = evidence();
  const correction = evidence({
    evidenceId: "evidence:alpha:correction:001",
    recordId: "evidence:alpha:correction:001:record:001",
    documentId: "alpha-correction-001",
    sourceLocator: "tdnet:doc:alpha-correction-001",
    sourceContentHash: "b".repeat(64),
    eventAt: "2026-08-06T10:00:00+09:00",
    publishedAt: "2026-08-06T10:00:00+09:00",
    observedAt: "2026-08-06T10:01:00+09:00",
    retrievedAt: "2026-08-06T10:02:00+09:00",
    effectiveFrom: "2026-08-06T10:00:00+09:00",
    firstExecutableAt: "2026-08-06T10:02:00+09:00",
    title: "Alpha訂正開示",
    summary: "前回開示の数値を訂正",
  });
  const corrects = relation();
  assert.deepEqual(
    validateBitemporalEvidenceStore(
      [original, correction],
      [corrects],
      schemas,
      KNOWN_ENTITIES,
    ).filter((item) => item.severity === "error"),
    [],
  );
  const snapshot = buildEvidenceSnapshot(
    [original, correction],
    [corrects],
    "2026-08-06T12:00:00+09:00",
    "system_replay",
  );
  assert.equal(bindingDispositionByEvidenceId(snapshot).get(original.evidenceId), "corrected");
  assert.deepEqual(
    recommendationEligibleEvidence(snapshot).map((item) => item.evidenceId),
    [correction.evidenceId],
  );
  console.log("bitemporal-evidence-store: binding correction preserves history OK");
}

{
  const unknownLicense = evidence({ license: "unknown" });
  assert.ok(validateBitemporalEvidenceStore(
    [unknownLicense],
    [],
    schemas,
    KNOWN_ENTITIES,
  ).some((item) => item.code === "unknown_license"));

  const metadataViolation = evidence({
    storagePolicy: "local_only_content",
  });
  assert.ok(validateBitemporalEvidenceStore(
    [metadataViolation],
    [],
    schemas,
    KNOWN_ENTITIES,
  ).some((item) => item.code === "metadata_license_content_storage"));
  console.log("bitemporal-evidence-store: license/storage policy guards OK");
}

{
  const promotedDiscovery = evidence({
    sourceType: "discovery_only",
    evidenceTier: "primary_authoritative",
  });
  assert.ok(validateBitemporalEvidenceStore(
    [promotedDiscovery],
    [],
    schemas,
    KNOWN_ENTITIES,
  ).some((item) => item.code === "discovery_source_promoted"));

  const discovery = evidence({
    sourceType: "discovery_only",
    evidenceTier: "discovery_only",
  });
  const snapshot = buildEvidenceSnapshot(
    [discovery],
    [],
    "2026-08-06T12:00:00+09:00",
    "system_replay",
  );
  assert.deepEqual(recommendationEligibleEvidence(snapshot), []);
  console.log("bitemporal-evidence-store: discovery sandbox isolation OK");
}

{
  const unknownEntity = evidence({ entityIds: ["entity:issuer:unknown"] });
  assert.ok(validateBitemporalEvidenceStore(
    [unknownEntity],
    [],
    schemas,
    KNOWN_ENTITIES,
  ).some((item) => item.code === "unknown_security_master_entity"));
  console.log("bitemporal-evidence-store: Security Master entity reference guard OK");
}

{
  const original = evidence();
  const olderCorrection = evidence({
    evidenceId: "evidence:alpha:older-correction",
    recordId: "evidence:alpha:older-correction:record:001",
    documentId: "older-correction",
    sourceLocator: "tdnet:doc:older-correction",
    sourceContentHash: "c".repeat(64),
    eventAt: "2026-08-04T10:00:00+09:00",
    publishedAt: "2026-08-04T10:00:00+09:00",
    observedAt: "2026-08-04T10:01:00+09:00",
    retrievedAt: "2026-08-04T10:02:00+09:00",
    effectiveFrom: "2026-08-04T10:00:00+09:00",
    firstExecutableAt: "2026-08-04T10:02:00+09:00",
  });
  const invalidRelation = relation({
    fromEvidenceId: olderCorrection.evidenceId,
    observedAt: "2026-08-06T10:01:00+09:00",
  });
  assert.ok(validateBitemporalEvidenceStore(
    [original, olderCorrection],
    [invalidRelation],
    schemas,
    KNOWN_ENTITIES,
  ).some((item) => item.code === "binding_relation_from_older_evidence"));
  console.log("bitemporal-evidence-store: older evidence cannot bind-correct newer evidence OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-store-"));
  const paths = {
    evidence: join(dir, "evidence.jsonl"),
    relations: join(dir, "relations.jsonl"),
  };
  try {
    appendEvidenceStoreRecords(
      paths,
      { evidence: [evidence()], relations: [] },
      "evidence-owner",
      schemas,
      KNOWN_ENTITIES,
    );
    assert.equal(readFileSync(paths.evidence, "utf-8").trim().split("\n").length, 1);
    assert.throws(
      () => appendEvidenceStoreRecords(
        paths,
        { evidence: [{ ...evidence({ recordId: "bad" }), contentHash: "0".repeat(64) }], relations: [] },
        "bad-owner",
        schemas,
        KNOWN_ENTITIES,
      ),
      /invalid_content_hash/,
    );
    assert.equal(existsSync(`${paths.evidence}.evidence-store.lock`), false);
    assert.equal(existsSync(`${paths.evidence}.batch-journal.json`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-store: governed append/fsync guards OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-store-journal-"));
  const paths = {
    evidence: join(dir, "evidence.jsonl"),
    relations: join(dir, "relations.jsonl"),
  };
  try {
    writeFileSync(`${paths.evidence}.batch-journal.json`, "{}\n", "utf-8");
    assert.throws(
      () => appendEvidenceStoreRecords(
        paths,
        { evidence: [evidence()], relations: [] },
        "journal-owner",
        schemas,
        KNOWN_ENTITIES,
      ),
      /incomplete_evidence_batch/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-store: incomplete journal blocks automatic append OK");
}

console.log("bitemporal-evidence-store: 全テスト成功");
