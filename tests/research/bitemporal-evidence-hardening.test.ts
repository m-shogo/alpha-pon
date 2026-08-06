import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvidenceStoreRecordsGovernedStrict,
} from "../../src/research/bitemporal-evidence-governed.js";
import {
  validateBitemporalEvidenceStoreGoverned,
} from "../../src/research/bitemporal-evidence-hardening.js";
import {
  withEvidenceRecordHash,
  withEvidenceRelationHash,
  type EvidenceRecordInput,
  type EvidenceRelationRecordInput,
  type EvidenceStoreSchemas,
} from "../../src/research/bitemporal-evidence-store.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: EvidenceStoreSchemas = {
  evidence: loadCouncilSchema("research/schemas/evidence-record.schema.json"),
  relation: loadCouncilSchema("research/schemas/evidence-relation-record.schema.json"),
};
const ENTITY_IDS = new Set(["entity:issuer:alpha"]);

function evidence(overrides: Partial<EvidenceRecordInput> = {}) {
  const evidenceId = overrides.evidenceId ?? "evidence:hardening:original";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: ["entity:issuer:alpha"],
    sourceId: overrides.sourceId ?? "tdnet",
    sourceType: overrides.sourceType ?? "exchange_disclosure",
    sourceLocator: overrides.sourceLocator ?? `source:${evidenceId}`,
    documentId: overrides.documentId ?? evidenceId,
    sourceContentHash: overrides.sourceContentHash ?? "a".repeat(64),
    eventAtStatus: "known",
    eventAt: overrides.eventAt ?? "2026-08-05T15:30:00+09:00",
    publishedAt: overrides.publishedAt ?? "2026-08-05T15:30:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:31:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:32:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T15:30:00+09:00",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T09:00:00+09:00",
    evidenceTier: overrides.evidenceTier ?? "primary_authoritative",
    status: overrides.status ?? "active",
    license: "metadata_only",
    storagePolicy: "hash_only",
    title: overrides.title ?? "Hardening evidence",
    summary: overrides.summary ?? "Hardening evidence summary",
    retrievalRunId: overrides.retrievalRunId ?? "run-hardening",
    parserVersion: "parser-v1",
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function relation(overrides: Partial<EvidenceRelationRecordInput> = {}) {
  const relationId = overrides.relationId ?? "relation:hardening:corrects";
  return withEvidenceRelationHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${relationId}:record:001`,
    relationId,
    relationType: overrides.relationType ?? "corrects",
    fromEvidenceId: overrides.fromEvidenceId ?? "evidence:hardening:correction",
    toEvidenceId: overrides.toEvidenceId ?? "evidence:hardening:original",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-06T10:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-06T10:01:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-06T10:02:00+09:00",
    sourceRefs: ["evidence:hardening:correction"],
    supersessionStrength: overrides.supersessionStrength ?? "binding",
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

{
  const promotedNews = evidence({
    sourceType: "reliable_news",
    evidenceTier: "primary_authoritative",
  });
  assert.ok(validateBitemporalEvidenceStoreGoverned(
    [promotedNews],
    [],
    schemas,
    ENTITY_IDS,
  ).some((item) => item.code === "source_tier_mismatch"));
  console.log("bitemporal-evidence-hardening: source tier promotion block OK");
}

{
  const retracted = evidence({ status: "retracted" });
  const reactivated = evidence({
    recordId: "evidence:hardening:original:record:002",
    observedAt: "2026-08-06T12:00:00+09:00",
    retrievedAt: "2026-08-06T12:01:00+09:00",
    firstExecutableAt: "2026-08-06T12:01:00+09:00",
    status: "active",
    supersedesRecordId: retracted.recordId,
  });
  assert.ok(validateBitemporalEvidenceStoreGoverned(
    [retracted, reactivated],
    [],
    schemas,
    ENTITY_IDS,
  ).some((item) => item.code === "invalid_evidence_status_transition"));
  console.log("bitemporal-evidence-hardening: retracted evidence reactivation block OK");
}

{
  const original = evidence();
  const newsCorrection = evidence({
    evidenceId: "evidence:hardening:correction",
    recordId: "evidence:hardening:correction:record:001",
    sourceId: "reliable-news",
    sourceType: "reliable_news",
    evidenceTier: "secondary_reliable",
    sourceContentHash: "b".repeat(64),
    eventAt: "2026-08-06T10:00:00+09:00",
    publishedAt: "2026-08-06T10:00:00+09:00",
    observedAt: "2026-08-06T10:01:00+09:00",
    retrievedAt: "2026-08-06T10:02:00+09:00",
    effectiveFrom: "2026-08-06T10:00:00+09:00",
    firstExecutableAt: "2026-08-06T10:02:00+09:00",
  });
  assert.ok(validateBitemporalEvidenceStoreGoverned(
    [original, newsCorrection],
    [relation()],
    schemas,
    ENTITY_IDS,
  ).some((item) => item.code === "binding_relation_without_primary_source"));
  console.log("bitemporal-evidence-hardening: weak source binding correction block OK");
}

{
  const first = evidence();
  const second = evidence({
    evidenceId: "evidence:hardening:second",
    recordId: "evidence:hardening:second:record:001",
    sourceContentHash: "c".repeat(64),
    eventAt: "2026-08-06T10:00:00+09:00",
    publishedAt: "2026-08-06T10:00:00+09:00",
    observedAt: "2026-08-06T10:01:00+09:00",
    retrievedAt: "2026-08-06T10:02:00+09:00",
    effectiveFrom: "2026-08-06T10:00:00+09:00",
    firstExecutableAt: "2026-08-06T10:02:00+09:00",
  });
  const firstToSecond = relation({
    relationId: "relation:hardening:first-second",
    fromEvidenceId: first.evidenceId,
    toEvidenceId: second.evidenceId,
    observedAt: "2026-08-06T11:00:00+09:00",
    retrievedAt: "2026-08-06T11:01:00+09:00",
  });
  const secondToFirst = relation({
    relationId: "relation:hardening:second-first",
    fromEvidenceId: second.evidenceId,
    toEvidenceId: first.evidenceId,
    observedAt: "2026-08-06T11:00:00+09:00",
    retrievedAt: "2026-08-06T11:01:00+09:00",
  });
  assert.ok(validateBitemporalEvidenceStoreGoverned(
    [first, second],
    [firstToSecond, secondToFirst],
    schemas,
    ENTITY_IDS,
  ).some((item) => item.code === "binding_evidence_relation_cycle"));
  console.log("bitemporal-evidence-hardening: binding relation cycle block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-governed-existing-"));
  const paths = {
    evidence: join(dir, "evidence.jsonl"),
    relations: join(dir, "relations.jsonl"),
  };
  const original = evidence();
  const correction = evidence({
    evidenceId: "evidence:hardening:correction",
    recordId: "evidence:hardening:correction:record:001",
    sourceContentHash: "d".repeat(64),
    eventAt: "2026-08-06T10:00:00+09:00",
    publishedAt: "2026-08-06T10:00:00+09:00",
    observedAt: "2026-08-06T10:01:00+09:00",
    retrievedAt: "2026-08-06T10:02:00+09:00",
    effectiveFrom: "2026-08-06T10:00:00+09:00",
    firstExecutableAt: "2026-08-06T10:02:00+09:00",
  });
  try {
    appendEvidenceStoreRecordsGovernedStrict(
      paths,
      { evidence: [original], relations: [] },
      "first-owner",
      schemas,
      ENTITY_IDS,
    );
    appendEvidenceStoreRecordsGovernedStrict(
      paths,
      { evidence: [correction], relations: [relation()] },
      "second-owner",
      schemas,
      ENTITY_IDS,
    );
    assert.equal(existsSync(`${paths.evidence}.batch-journal.json`), false);
    assert.equal(existsSync(`${paths.evidence}.evidence-store.lock`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal-evidence-hardening: relation to existing Evidence append OK");
}

console.log("bitemporal-evidence-hardening: 全テスト成功");
