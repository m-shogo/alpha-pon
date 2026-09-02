import assert from "node:assert/strict";
import { linkSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-repository-file-boundary-"));
try {
  const outsideEntities = join(dir, "outside-entities.jsonl");
  const outsideRelationships = join(dir, "outside-relationships.jsonl");
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  writeFileSync(outsideEntities, "", "utf-8");
  writeFileSync(outsideRelationships, "", "utf-8");
  linkSync(outsideEntities, entitiesPath);
  linkSync(outsideRelationships, relationshipsPath);

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-09-03",
    cutoffInstant: "2026-09-03T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "non_standalone_security_master_file" && item.target === entitiesPath
  ));
  assert.ok(result.issues.some((item) =>
    item.code === "non_standalone_security_master_file" && item.target === relationshipsPath
  ));
  assert.equal(result.entityRecordCount, 0);
  assert.equal(result.relationshipRecordCount, 0);
  assert.equal(result.snapshot.entities.length, 0);
  assert.equal(result.snapshot.relationships.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master-repository: aliased JSONL files fail closed OK");
