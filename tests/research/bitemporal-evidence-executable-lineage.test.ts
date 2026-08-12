import assert from "node:assert/strict";
import {
  withEvidenceRecordHash,
  type EvidenceRecord,
  type EvidenceRecordInput,
  type EvidenceStoreSchemas,
} from "../../src/research/bitemporal-evidence-store.js";
import { validateBitemporalEvidenceStoreGoverned } from "../../src/research/bitemporal-evidence-hardening.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: EvidenceStoreSchemas = {
  evidence: loadCouncilSchema("research/schemas/evidence-record.schema.json"),
  relation: loadCouncilSchema("research/schemas/evidence-relation-record.schema.json"),
};
const knownEntities = new Set(["entity:issuer:alpha"]);

function evidence(overrides: Partial<EvidenceRecordInput> = {}): EvidenceRecord {
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "evidence:alpha:001:record:001",
    evidenceId: "evidence:alpha:001",
    entityIds: ["entity:issuer:alpha"],
    sourceId: "tdnet",
    sourceType: "exchange_disclosure",
    sourceLocator: "tdnet:evidence:alpha:001",
    documentId: "alpha-001",
    sourceContentHash: "a".repeat(64),
    eventAtStatus: "known",
    eventAt: "2026-08-05T00:00:00Z",
    publishedAt: "2026-08-05T00:00:00Z",
    observedAt: overrides.observedAt ?? "2026-08-05T00:00:01Z",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T00:00:02Z",
    effectiveFrom: "2026-08-05T00:00:00Z",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-05T00:10:00Z",
    evidenceTier: "primary_authoritative",
    status: "active",
    license: "metadata_only",
    storagePolicy: "hash_only",
    title: "Alpha disclosure",
    summary: "synthetic metadata-only evidence",
    retrievalRunId: "run-alpha",
    parserVersion: "parser-v1",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

{
  const original = evidence();
  const revision = evidence({
    recordId: "evidence:alpha:001:record:002",
    observedAt: "2026-08-05T00:00:03Z",
    retrievedAt: "2026-08-05T00:00:04Z",
    firstExecutableAt: "2026-08-05T00:09:59.999999999Z",
    supersedesRecordId: original.recordId,
  });
  const issues = validateBitemporalEvidenceStoreGoverned(
    [original, revision],
    [],
    schemas,
    knownEntities,
  );
  assert.ok(
    issues.some((item) => item.code === "evidence_revision_executable_time_regressed"),
    "a later revision must not move firstExecutableAt earlier, even by 1ns",
  );
}

{
  const original = evidence();
  const revision = evidence({
    recordId: "evidence:alpha:001:record:002",
    observedAt: "2026-08-05T00:00:03Z",
    retrievedAt: "2026-08-05T00:00:04Z",
    firstExecutableAt: "2026-08-05T00:10:00Z",
    supersedesRecordId: original.recordId,
  });
  const issues = validateBitemporalEvidenceStoreGoverned(
    [original, revision],
    [],
    schemas,
    knownEntities,
  );
  assert.equal(
    issues.some((item) => item.code === "evidence_revision_executable_time_regressed"),
    false,
    "an unchanged execution boundary remains valid",
  );
}

console.log("bitemporal-evidence-executable-lineage: execution gate monotonicity OK");
