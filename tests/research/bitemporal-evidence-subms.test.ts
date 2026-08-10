import assert from "node:assert/strict";
import {
  buildEvidenceSnapshot,
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
const knownEntities = new Set(["entity:issuer:alpha"]);

function evidence(overrides: Partial<EvidenceRecordInput> = {}): EvidenceRecord {
  const evidenceId = overrides.evidenceId ?? "evidence:alpha:001";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: ["entity:issuer:alpha"],
    sourceId: "tdnet",
    sourceType: "exchange_disclosure",
    sourceLocator: overrides.sourceLocator ?? `tdnet:${evidenceId}`,
    documentId: overrides.documentId ?? "alpha-001",
    sourceContentHash: overrides.sourceContentHash ?? "a".repeat(64),
    eventAtStatus: "known",
    eventAt: overrides.eventAt ?? "2026-08-05T00:00:00Z",
    publishedAt: overrides.publishedAt ?? "2026-08-05T00:00:00.000000001Z",
    observedAt: overrides.observedAt ?? "2026-08-05T00:00:00.000000002Z",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T00:00:00.000000003Z",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T00:00:00Z",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-05T00:00:00.000000004Z",
    evidenceTier: "primary_authoritative",
    status: "active",
    license: "metadata_only",
    storagePolicy: "hash_only",
    title: "Alpha disclosure",
    summary: overrides.summary ?? "synthetic metadata-only evidence",
    retrievalRunId: "run-alpha",
    parserVersion: "parser-v1",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

function relation(overrides: Partial<EvidenceRelationRecordInput> = {}): EvidenceRelationRecord {
  return withEvidenceRelationHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "relation:alpha:record:001",
    relationId: overrides.relationId ?? "relation:alpha",
    relationType: overrides.relationType ?? "corrects",
    fromEvidenceId: overrides.fromEvidenceId ?? "evidence:alpha:correction",
    toEvidenceId: overrides.toEvidenceId ?? "evidence:alpha:001",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T00:00:00Z",
    observedAt: overrides.observedAt ?? "2026-08-05T00:00:00.000000003Z",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T00:00:00.000000004Z",
    sourceRefs: ["synthetic:relation"],
    supersessionStrength: overrides.supersessionStrength ?? "binding",
  });
}

{
  const record = evidence({
    publishedAt: "2026-08-05T00:00:00.000000002Z",
    observedAt: "2026-08-05T00:00:00.000000001Z",
  });
  const issues = validateBitemporalEvidenceStore([record], [], schemas, knownEntities);
  assert.ok(
    issues.some((item) => item.code === "observed_before_published"),
    "1ns observedAt inversion must not collapse to the same millisecond",
  );
}

{
  const original = evidence();
  const revision = evidence({
    recordId: "evidence:alpha:001:record:002",
    observedAt: "2026-08-05T00:00:00.000000003Z",
    retrievedAt: "2026-08-05T00:00:00.000000004Z",
    firstExecutableAt: "2026-08-05T00:00:00.000000005Z",
    supersedesRecordId: original.recordId,
    summary: "later by one nanosecond-scale fraction",
  });
  const issues = validateBitemporalEvidenceStore([original, revision], [], schemas, knownEntities);
  assert.equal(
    issues.some((item) => item.code === "evidence_revision_time_not_monotonic"),
    false,
    "strictly later sub-ms revisions must remain valid",
  );
}

{
  const record = evidence({
    observedAt: "2026-08-05T00:00:00.000000002Z",
    retrievedAt: "2026-08-05T00:00:00.000000002Z",
    firstExecutableAt: "2026-08-05T00:00:00.000000003Z",
  });
  const snapshot = buildEvidenceSnapshot(
    [record],
    [],
    "2026-08-05T00:00:00.000000001Z",
    "system_replay",
    "knowledge",
  );
  assert.equal(
    snapshot.evidence.length,
    0,
    "same-millisecond future Evidence must not leak into an as-of snapshot",
  );
}

{
  const target = evidence();
  const correction = evidence({
    evidenceId: "evidence:alpha:correction",
    recordId: "evidence:alpha:correction:record:001",
    documentId: "alpha-correction",
    sourceContentHash: "b".repeat(64),
    observedAt: "2026-08-05T00:00:00.000000001Z",
    retrievedAt: "2026-08-05T00:00:00.000000002Z",
    firstExecutableAt: "2026-08-05T00:00:00.000000003Z",
  });
  const binding = relation({ observedAt: "2026-08-05T00:00:00.000000003Z" });
  const issues = validateBitemporalEvidenceStore(
    [target, correction],
    [binding],
    schemas,
    knownEntities,
  );
  assert.ok(
    issues.some((item) => item.code === "binding_relation_from_older_evidence"),
    "binding correction source observed 1ns earlier must not be treated as simultaneous",
  );
}

console.log("bitemporal-evidence-subms: fractional PIT ordering OK");
