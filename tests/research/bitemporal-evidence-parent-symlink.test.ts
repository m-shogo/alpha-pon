import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateBitemporalEvidenceRepository,
} from "../../src/research/bitemporal-evidence-repository.js";

const root = mkdtempSync(join(tmpdir(), "bitemporal-evidence-parent-symlink-"));
try {
  const realDir = join(root, "real");
  const aliasDir = join(root, "alias");
  mkdirSync(realDir);
  writeFileSync(join(realDir, "evidence.jsonl"), "", "utf-8");
  symlinkSync(realDir, aliasDir, "dir");

  const aliasedEvidencePath = join(aliasDir, "evidence.jsonl");
  const result = validateBitemporalEvidenceRepository({
    evidencePath: aliasedEvidencePath,
    relationsPath: join(realDir, "relations.jsonl"),
    securityEntitiesPath: join(realDir, "security-entities.jsonl"),
    securityRelationshipsPath: join(realDir, "security-relationships.jsonl"),
    asOf: "2026-08-06T10:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "non_standalone_evidence_repository_file"
    && item.target === aliasedEvidencePath
  ));
  assert.equal(result.snapshotEvidenceCount, 0);
  assert.equal(result.recommendationEligibleCount, 0);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("bitemporal-evidence-parent-symlink: symlinked parent directory block OK");
