import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateSecurityMasterRepository,
} from "../../src/research/security-master-repository.js";

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-empty-"));
  try {
    const result = validateSecurityMasterRepository({
      entitiesPath: join(dir, "missing-entities.jsonl"),
      relationshipsPath: join(dir, "missing-relationships.jsonl"),
      asOf: "2026-08-06",
    });
    assert.equal(result.entityRecordCount, 0);
    assert.equal(result.issues.some((issue) => issue.severity === "error"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-partial-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    writeFileSync(entitiesPath, "{}", "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
    });
    assert.ok(result.issues.some((issue) => issue.code === "partial_jsonl_tail"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: partial tail block OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-journal-"));
  const entitiesPath = join(dir, "entities.jsonl");
  try {
    writeFileSync(`${entitiesPath}.batch-journal.json`, "{}\n", "utf-8");
    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath: join(dir, "relationships.jsonl"),
      asOf: "2026-08-06",
    });
    assert.ok(result.issues.some((issue) => issue.code === "incomplete_security_master_batch"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: incomplete journal block OK");
}

console.log("security-master-repository: 全テスト成功");
