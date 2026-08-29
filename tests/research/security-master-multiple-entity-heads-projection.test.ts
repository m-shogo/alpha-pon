import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-multiple-entity-heads-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const entityId = "entity:ambiguous-head";
  const entityHead = (
    recordId: string,
    canonicalName: string,
    observedAt: string,
    retrievedAt: string,
  ) => withSecurityEntityHash({
    schemaVersion: 1,
    recordId,
    entityId,
    entityType: "legal_entity",
    canonicalName,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: canonicalName,
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: [`source:name:${recordId}`],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${recordId}`],
    }],
    officialLinks: [],
    sourceRefs: [`source:entity:${recordId}`],
    observedAt,
    retrievedAt,
  });

  const headA = entityHead(
    "entity:ambiguous-head:record:a",
    "Ambiguous Head A株式会社",
    "2026-08-06T09:00:00+09:00",
    "2026-08-06T09:01:00+09:00",
  );
  const headB = entityHead(
    "entity:ambiguous-head:record:b",
    "Ambiguous Head B株式会社",
    "2026-08-06T09:02:00+09:00",
    "2026-08-06T09:03:00+09:00",
  );

  writeFileSync(
    entitiesPath,
    `${JSON.stringify(headA)}\n${JSON.stringify(headB)}\n`,
    "utf-8",
  );

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(
    result.issues.some(
      (item) => item.code === "multiple_entity_heads" && item.target === entityId,
    ),
  );
  assert.equal(result.entityRecordCount, 2, "raw ambiguous heads remain available for diagnostics");
  assert.equal(
    result.activeEntityCount,
    0,
    "ambiguous active heads for one identity must fail closed from the read-only snapshot",
  );
  assert.equal(result.snapshot.entities.length, 0);
  assert.equal(result.activeRelationshipCount, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master: multiple entity heads fail closed from read-only projection OK");
