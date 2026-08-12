import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvidenceStoreRecordsGoverned } from "../../src/research/bitemporal-evidence-hardening.js";
import {
  withEvidenceRecordHash,
  type EvidenceRecordInput,
  type EvidenceStoreSchemas,
} from "../../src/research/bitemporal-evidence-store.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: EvidenceStoreSchemas = {
  evidence: loadCouncilSchema("research/schemas/evidence-record.schema.json"),
  relation: loadCouncilSchema("research/schemas/evidence-relation-record.schema.json"),
};
const entityIds = new Set(["entity:issuer:alpha"]);

function evidence(overrides: Partial<EvidenceRecordInput> = {}) {
  const evidenceId = "evidence:cross-batch";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: ["entity:issuer:alpha"],
    sourceId: "tdnet",
    sourceType: "exchange_disclosure",
    sourceLocator: "source:evidence:cross-batch",
    documentId: evidenceId,
    sourceContentHash: overrides.sourceContentHash ?? "a".repeat(64),
    eventAtStatus: "known",
    eventAt: "2026-08-05T15:30:00+09:00",
    publishedAt: "2026-08-05T15:30:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:31:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:32:00+09:00",
    effectiveFrom: "2026-08-05T15:30:00+09:00",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T09:00:00+09:00",
    evidenceTier: "primary_authoritative",
    status: overrides.status ?? "active",
    license: "metadata_only",
    storagePolicy: "hash_only",
    title: "Cross-batch evidence",
    summary: "Cross-batch governed validation regression",
    retrievalRunId: overrides.retrievalRunId ?? "run-cross-batch-1",
    parserVersion: "parser-v1",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

function pathsFor(dir: string) {
  return {
    evidence: join(dir, "evidence.jsonl"),
    relations: join(dir, "relations.jsonl"),
  };
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-governed-valid-cross-batch-"));
  try {
    const paths = pathsFor(dir);
    const original = evidence();
    const corrected = evidence({
      recordId: "evidence:cross-batch:record:002",
      sourceContentHash: "b".repeat(64),
      observedAt: "2026-08-06T10:00:00+09:00",
      retrievedAt: "2026-08-06T10:01:00+09:00",
      firstExecutableAt: "2026-08-06T10:01:00+09:00",
      status: "corrected",
      retrievalRunId: "run-cross-batch-2",
      supersedesRecordId: original.recordId,
    });
    appendEvidenceStoreRecordsGoverned(paths, { evidence: [original], relations: [] }, "owner-1", schemas, entityIds);
    assert.doesNotThrow(() => appendEvidenceStoreRecordsGoverned(
      paths,
      { evidence: [corrected], relations: [] },
      "owner-2",
      schemas,
      entityIds,
    ));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-governed-invalid-cross-batch-"));
  try {
    const paths = pathsFor(dir);
    const retracted = evidence({ status: "retracted" });
    const reactivated = evidence({
      recordId: "evidence:cross-batch:record:002",
      sourceContentHash: "c".repeat(64),
      observedAt: "2026-08-06T10:00:00+09:00",
      retrievedAt: "2026-08-06T10:01:00+09:00",
      firstExecutableAt: "2026-08-06T10:01:00+09:00",
      status: "active",
      retrievalRunId: "run-cross-batch-2",
      supersedesRecordId: retracted.recordId,
    });
    appendEvidenceStoreRecordsGoverned(paths, { evidence: [retracted], relations: [] }, "owner-1", schemas, entityIds);
    assert.throws(
      () => appendEvidenceStoreRecordsGoverned(paths, { evidence: [reactivated], relations: [] }, "owner-2", schemas, entityIds),
      /invalid_evidence_status_transition/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("bitemporal-evidence-governed-cross-batch: all tests passed");
