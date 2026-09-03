import assert from "node:assert/strict";
import { linkSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateBitemporalEvidenceRepository } from "../../src/research/bitemporal-evidence-repository.js";

const dir = mkdtempSync(join(tmpdir(), "bitemporal-evidence-file-boundary-"));
try {
  const outsideEvidence = join(dir, "outside-evidence.jsonl");
  const outsideRelations = join(dir, "outside-relations.jsonl");
  const evidencePath = join(dir, "evidence.jsonl");
  const relationsPath = join(dir, "relations.jsonl");
  writeFileSync(outsideEvidence, "", "utf-8");
  writeFileSync(outsideRelations, "", "utf-8");
  linkSync(outsideEvidence, evidencePath);
  linkSync(outsideRelations, relationsPath);

  const result = validateBitemporalEvidenceRepository({
    evidencePath,
    relationsPath,
    securityEntitiesPath: join(dir, "missing-security-entities.jsonl"),
    securityRelationshipsPath: join(dir, "missing-security-relationships.jsonl"),
    asOf: "2026-09-03T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "non_standalone_evidence_repository_file" && item.target === evidencePath
  ));
  assert.ok(result.issues.some((item) =>
    item.code === "non_standalone_evidence_repository_file" && item.target === relationsPath
  ));
  assert.equal(result.evidenceRecordCount, 0);
  assert.equal(result.relationRecordCount, 0);
  assert.equal(result.snapshotEvidenceCount, 0);
  assert.equal(result.snapshotRelationCount, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("bitemporal-evidence-repository: aliased JSONL files fail closed OK");
