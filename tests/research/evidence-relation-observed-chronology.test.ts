import assert from "node:assert/strict";
import {
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

const KNOWN_ENTITIES = new Set(["entity:issuer:alpha"]);

function evidence(overrides: Partial<EvidenceRecordInput>): EvidenceRecord {
  const evidenceId = overrides.evidenceId ?? "evidence:alpha:base";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: ["entity:issuer:alpha"],
    sourceId: "synthetic-official",
    sourceType: "exchange_disclosure",
    sourceLocator: `synthetic:${evidenceId}`,
    documentId: evidenceId,
    sourceContentHash: (overrides.sourceContentHash ?? "a".repeat(64)),
    eventAtStatus: "known",
    eventAt: overrides.eventAt ?? "2026-08-06T10:00:00+09:00",
    publishedAt: overrides.publishedAt ?? "2026-08-06T10:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-06T10:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-06T10:00:01+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-06T10:00:00+09:00",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T10:00:01+09:00",
    evidenceTier: "primary_authoritative",
    status: "active",
    license: "metadata_only",
    storagePolicy: "hash_only",
    title: evidenceId,
    summary: evidenceId,
    retrievalRunId: "synthetic-run",
    parserVersion: "synthetic-v1",
  });
}

function relation(overrides: Partial<EvidenceRelationRecordInput>): EvidenceRelationRecord {
  return withEvidenceRelationHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "relation:alpha:record:001",
    relationId: overrides.relationId ?? "relation:alpha",
    relationType: overrides.relationType ?? "supports",
    fromEvidenceId: overrides.fromEvidenceId ?? "evidence:alpha:source",
    toEvidenceId: overrides.toEvidenceId ?? "evidence:alpha:target",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-06T10:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-06T10:00:02+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-06T10:00:03+09:00",
    sourceRefs: overrides.sourceRefs ?? ["evidence:alpha:source"],
    supersessionStrength: overrides.supersessionStrength ?? "informational",
  });
}

{
  const source = evidence({
    evidenceId: "evidence:alpha:source",
    sourceContentHash: "b".repeat(64),
    observedAt: "2026-08-06T10:00:00.000000001+09:00",
    retrievedAt: "2026-08-06T10:00:01+09:00",
    firstExecutableAt: "2026-08-06T10:00:01+09:00",
  });
  const target = evidence({
    evidenceId: "evidence:alpha:target",
    sourceContentHash: "c".repeat(64),
  });
  const supports = relation({
    observedAt: "2026-08-06T10:00:00+09:00",
  });

  const issues = validateBitemporalEvidenceStore(
    [source, target],
    [supports],
    schemas,
    KNOWN_ENTITIES,
  );
  assert.ok(issues.some((item) => item.code === "relation_observed_before_source_evidence"));
}

{
  const source = evidence({
    evidenceId: "evidence:alpha:source",
    sourceContentHash: "d".repeat(64),
  });
  const target = evidence({
    evidenceId: "evidence:alpha:target",
    sourceContentHash: "e".repeat(64),
    observedAt: "2026-08-06T10:00:00.000000001+09:00",
    retrievedAt: "2026-08-06T10:00:01+09:00",
    firstExecutableAt: "2026-08-06T10:00:01+09:00",
  });
  const confirms = relation({
    relationType: "confirms",
    observedAt: "2026-08-06T10:00:00+09:00",
  });

  const issues = validateBitemporalEvidenceStore(
    [source, target],
    [confirms],
    schemas,
    KNOWN_ENTITIES,
  );
  assert.ok(issues.some((item) => item.code === "relation_observed_before_target_evidence"));
}

console.log("evidence-relation-observed-chronology: all tests passed");
