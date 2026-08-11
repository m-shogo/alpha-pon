import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  buildSecurityMasterSnapshot,
  withSecurityEntityHash,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";

function entityRecord(
  entityId: string,
  observedAt: string,
  retrievedAt: string,
) {
  const canonicalName = `${entityId}株式会社`;
  const input: SecurityMasterEntityRecordInput = {
    schemaVersion: 1,
    recordId: `${entityId}:record:001`,
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
      sourceRefs: [`source:name:${entityId}`],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: [`source:id:${entityId}`],
    }],
    officialLinks: [{
      kind: "website",
      url: `https://example.com/${encodeURIComponent(entityId)}`,
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: [`source:web:${entityId}`],
    }],
    sourceRefs: [`source:entity:${entityId}`],
    observedAt,
    retrievedAt,
  };
  return withSecurityEntityHash(input);
}

const finalNanosecond = entityRecord(
  "entity:pit:final-nanosecond",
  "2024-02-01T23:59:59.999999998+09:00",
  "2024-02-01T23:59:59.999999999+09:00",
);
const nextDay = entityRecord(
  "entity:pit:next-day",
  "2024-02-02T00:00:00+09:00",
  "2024-02-02T00:00:00+09:00",
);

const directSnapshot = buildSecurityMasterSnapshot(
  [finalNanosecond, nextDay],
  [],
  "2024-02-01",
);
assert.deepEqual(
  directSnapshot.entities.map((record) => record.recordId),
  [finalNanosecond.recordId],
  "the final nanosecond of the JST asOf day must be available while next-day midnight remains unavailable",
);

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-snapshot-nanosecond-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  try {
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(finalNanosecond)}\n${JSON.stringify(nextDay)}\n`,
      "utf-8",
    );
    writeFileSync(relationshipsPath, "", "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2024-02-01",
    });
    assert.deepEqual(
      result.snapshot.entities.map((record) => record.recordId),
      [finalNanosecond.recordId],
      "repository PIT filtering must preserve the exact final nanosecond of the JST snapshot day",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("security-master-snapshot-nanosecond.test.ts passed");
