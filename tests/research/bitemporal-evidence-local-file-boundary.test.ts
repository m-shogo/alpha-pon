import assert from "node:assert/strict";
import {
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvidenceStoreRecordsGovernedStrict } from "../../src/research/bitemporal-evidence-governed.js";
import {
  withEvidenceRecordHash,
  type EvidenceStoreSchemas,
} from "../../src/research/bitemporal-evidence-store.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: EvidenceStoreSchemas = {
  evidence: loadCouncilSchema("research/schemas/evidence-record.schema.json"),
  relation: loadCouncilSchema("research/schemas/evidence-relation-record.schema.json"),
};
const entityIds = new Set(["entity:issuer:alpha"]);

const record = withEvidenceRecordHash({
  schemaVersion: 1,
  recordId: "evidence:local-boundary:record:001",
  evidenceId: "evidence:local-boundary",
  entityIds: ["entity:issuer:alpha"],
  sourceId: "tdnet",
  sourceType: "exchange_disclosure",
  sourceLocator: "source:evidence:local-boundary",
  documentId: "evidence:local-boundary",
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
  title: "Local boundary evidence",
  summary: "Synthetic local boundary regression",
  retrievalRunId: "run-local-boundary",
  parserVersion: "parser-v1",
});

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-store-symlink-"));
  const target = join(dir, "outside.jsonl");
  const evidencePath = join(dir, "evidence.jsonl");
  const relationsPath = join(dir, "relations.jsonl");
  writeFileSync(target, "sentinel\n", "utf-8");
  symlinkSync(target, evidencePath);
  try {
    assert.throws(
      () => appendEvidenceStoreRecordsGovernedStrict(
        { evidence: evidencePath, relations: relationsPath },
        { evidence: [record], relations: [] },
        "symlink-owner",
        schemas,
        entityIds,
      ),
      /single-link regular file/,
    );
    assert.equal(readFileSync(target, "utf-8"), "sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal evidence store: symlink path rejected without modifying target OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "evidence-store-hardlink-"));
  const target = join(dir, "outside.jsonl");
  const evidencePath = join(dir, "evidence.jsonl");
  const relationsPath = join(dir, "relations.jsonl");
  writeFileSync(target, "sentinel\n", "utf-8");
  linkSync(target, relationsPath);
  try {
    assert.throws(
      () => appendEvidenceStoreRecordsGovernedStrict(
        { evidence: evidencePath, relations: relationsPath },
        { evidence: [record], relations: [] },
        "hardlink-owner",
        schemas,
        entityIds,
      ),
      /single-link regular file/,
    );
    assert.equal(readFileSync(target, "utf-8"), "sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("bitemporal evidence store: hard-link path rejected without modifying target OK");
}

console.log("bitemporal-evidence-local-file-boundary: all tests passed");
