import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-schema-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const validRecord = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:schema-invalid:record:001",
    entityId: "entity:issuer:schema-invalid",
    entityType: "legal_entity",
    canonicalName: "Schema Invalid株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Schema Invalid株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:schema-invalid"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:issuer:schema-invalid",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:schema-invalid"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:schema-invalid"],
    observedAt: "2026-08-06T10:00:00+09:00",
    retrievedAt: "2026-08-06T10:01:00+09:00",
  });
  const schemaInvalidRecord = { ...validRecord, unexpectedField: "synthetic-only" };
  writeFileSync(entitiesPath, `${JSON.stringify(schemaInvalidRecord)}\n`, "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) => item.code === "schema_violation"));
  assert.equal(result.entityRecordCount, 1, "raw malformed record remains visible for diagnostics");
  assert.equal(result.activeEntityCount, 0, "schema-invalid record must not enter read-only projection");
  assert.equal(result.snapshot.entities.length, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
