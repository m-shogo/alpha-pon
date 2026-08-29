import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSecurityMasterRepository } from "../../src/research/security-master-repository.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

const dir = mkdtempSync(join(tmpdir(), "security-master-revision-retrieval-projection-"));
const entitiesPath = join(dir, "entities.jsonl");
const relationshipsPath = join(dir, "relationships.jsonl");

try {
  const base = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:revision-retrieval:record:001",
    entityId: "entity:revision-retrieval",
    entityType: "legal_entity",
    canonicalName: "Revision Retrieval株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Revision Retrieval株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:revision-retrieval:001"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:revision-retrieval",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:id:revision-retrieval:001"],
    }],
    officialLinks: [],
    sourceRefs: ["source:entity:revision-retrieval:001"],
    observedAt: "2026-08-06T09:00:00+09:00",
    retrievedAt: "2026-08-06T10:00:00+09:00",
  });
  const impossibleHead = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:revision-retrieval:record:002",
    entityId: base.entityId,
    entityType: base.entityType,
    canonicalName: "Impossible Earlier Retrieval株式会社",
    jurisdiction: base.jurisdiction,
    validFrom: base.validFrom,
    status: base.status,
    names: [{
      name: "Impossible Earlier Retrieval株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:name:revision-retrieval:002"],
    }],
    identifiers: base.identifiers,
    officialLinks: [],
    sourceRefs: ["source:entity:revision-retrieval:002"],
    observedAt: "2026-08-06T09:30:00+09:00",
    retrievedAt: "2026-08-06T09:59:00+09:00",
    supersedesRecordId: base.recordId,
  });

  writeFileSync(entitiesPath, `${JSON.stringify(base)}\n${JSON.stringify(impossibleHead)}\n`, "utf-8");
  writeFileSync(relationshipsPath, "", "utf-8");

  const result = validateSecurityMasterRepository({
    entitiesPath,
    relationshipsPath,
    asOf: "2026-08-06",
    cutoffInstant: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(result.issues.some((item) =>
    item.code === "entity_revision_retrieval_not_monotonic" && item.target === impossibleHead.recordId,
  ));
  assert.equal(result.entityRecordCount, 2, "raw append-only revisions remain visible to diagnostics");
  assert.equal(result.activeEntityCount, 1);
  assert.equal(
    result.snapshot.entities[0]?.recordId,
    base.recordId,
    "an impossible superseding retrieval must not shadow the last valid PIT revision",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("security-master revision retrieval projection: impossible superseding retrieval fails closed OK");
