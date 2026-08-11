import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import {
  withSecurityEntityHash,
  type SecurityMasterEntityRecordInput,
} from "../../src/research/security-master.js";

function entityRecord(overrides: Partial<SecurityMasterEntityRecordInput> = {}) {
  const canonicalName = overrides.canonicalName ?? "Known At Cutoff株式会社";
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "entity:pit:record:001",
    entityId: "entity:pit:test",
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
      sourceRefs: ["source:name:pit"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:pit:test",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:pit"],
    }],
    officialLinks: [{
      kind: "website",
      url: "https://example.com/pit",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: ["source:web:pit"],
    }],
    sourceRefs: ["source:entity:pit"],
    observedAt: overrides.observedAt ?? "2024-01-10T15:00:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2024-01-10T15:01:00+09:00",
    ...(overrides.supersedesRecordId ? { supersedesRecordId: overrides.supersedesRecordId } : {}),
  });
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-pit-revision-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  const previous = entityRecord();
  const futureRevision = entityRecord({
    recordId: "entity:pit:record:002",
    canonicalName: "Future Correction株式会社",
    observedAt: "2026-01-10T15:00:00+09:00",
    retrievedAt: "2026-01-10T15:01:00+09:00",
    supersedesRecordId: previous.recordId,
  });

  try {
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(previous)}\n${JSON.stringify(futureRevision)}\n`,
      "utf-8",
    );
    writeFileSync(relationshipsPath, "", "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2025-06-01",
    });

    assert.ok(result.issues.some((issue) => issue.code === "future_entity_revision_shadowed"));
    assert.equal(result.snapshot.entities.length, 1);
    assert.equal(result.snapshot.entities[0]?.recordId, previous.recordId);
    assert.equal(result.snapshot.entities[0]?.canonicalName, "Known At Cutoff株式会社");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: future observed revision cannot leak into past PIT snapshot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-pit-retrieval-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  const previous = entityRecord();
  const lateRetrievedRevision = entityRecord({
    recordId: "entity:pit:record:003",
    canonicalName: "Late Retrieved Correction株式会社",
    observedAt: "2024-06-01T15:00:00+09:00",
    retrievedAt: "2026-01-10T15:01:00+09:00",
    supersedesRecordId: previous.recordId,
  });

  try {
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(previous)}\n${JSON.stringify(lateRetrievedRevision)}\n`,
      "utf-8",
    );
    writeFileSync(relationshipsPath, "", "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2025-06-01",
    });

    assert.ok(result.issues.some((issue) => issue.code === "future_entity_revision_shadowed"));
    assert.equal(result.snapshot.entities.length, 1);
    assert.equal(result.snapshot.entities[0]?.recordId, previous.recordId);
    assert.equal(result.snapshot.entities[0]?.canonicalName, "Known At Cutoff株式会社");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: late-retrieved revision cannot leak into past PIT snapshot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "security-master-repository-pit-order-"));
  const entitiesPath = join(dir, "entities.jsonl");
  const relationshipsPath = join(dir, "relationships.jsonl");
  const previous = entityRecord();
  const invalidChronologyRevision = entityRecord({
    recordId: "entity:pit:record:004",
    canonicalName: "Invalid Chronology Correction株式会社",
    observedAt: "2025-05-01T15:00:00.000000002+09:00",
    retrievedAt: "2025-05-01T15:00:00.000000001+09:00",
    supersedesRecordId: previous.recordId,
  });

  try {
    writeFileSync(
      entitiesPath,
      `${JSON.stringify(previous)}\n${JSON.stringify(invalidChronologyRevision)}\n`,
      "utf-8",
    );
    writeFileSync(relationshipsPath, "", "utf-8");

    const result = validateSecurityMasterRepository({
      entitiesPath,
      relationshipsPath,
      asOf: "2025-06-01",
    });

    assert.ok(result.issues.some((issue) => issue.code === "retrieved_before_observed"));
    assert.ok(result.issues.some((issue) => issue.code === "future_entity_revision_shadowed"));
    assert.equal(result.snapshot.entities.length, 1);
    assert.equal(result.snapshot.entities[0]?.recordId, previous.recordId);
    assert.equal(result.snapshot.entities[0]?.canonicalName, "Known At Cutoff株式会社");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("security-master-repository: invalid observed/retrieved ordering cannot shadow PIT snapshot OK");
}

console.log("security-master-repository-pit-revision.test.ts passed");
