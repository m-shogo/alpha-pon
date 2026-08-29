import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDocumentRevisionDiffRepository } from "../../src/research/document-revision-diff-repository.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";
import { documentEvidence, documentRevision } from "./document-revision-diff-fixtures.js";

function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

function securityEntity(
  entityId: string,
  observedAt: string,
  retrievedAt: string,
) {
  return withSecurityEntityHash({
    schemaVersion: 1,
    recordId: `${entityId}:record:001`,
    entityId,
    entityType: "legal_entity",
    canonicalName: `${entityId}株式会社`,
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: `${entityId}株式会社`,
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
    officialLinks: [],
    sourceRefs: [`source:entity:${entityId}`],
    observedAt,
    retrievedAt,
  });
}

const dir = mkdtempSync(join(tmpdir(), "document-revision-security-cutoff-"));
try {
  const knownEntityId = "entity:issuer:document-pilot";
  const futureEntityId = "entity:issuer:document-future-same-day";
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
    evidence: join(dir, "evidence.jsonl"),
    evidenceRelations: join(dir, "evidence-relations.jsonl"),
    securityEntities: join(dir, "security-entities.jsonl"),
    securityRelationships: join(dir, "security-relationships.jsonl"),
  };

  writeJsonl(paths.securityEntities, [
    securityEntity(
      knownEntityId,
      "2026-08-05T14:00:00+09:00",
      "2026-08-05T14:01:00+09:00",
    ),
    securityEntity(
      futureEntityId,
      "2026-08-06T18:00:00+09:00",
      "2026-08-06T18:01:00+09:00",
    ),
  ]);
  writeJsonl(paths.securityRelationships, []);
  writeJsonl(paths.evidence, [documentEvidence()]);
  writeJsonl(paths.evidenceRelations, []);
  writeJsonl(paths.revisions, [documentRevision({
    entityIds: [knownEntityId, futureEntityId],
  })]);
  writeJsonl(paths.diffs, []);

  const result = validateDocumentRevisionDiffRepository({
    revisionsPath: paths.revisions,
    diffsPath: paths.diffs,
    evidencePath: paths.evidence,
    evidenceRelationsPath: paths.evidenceRelations,
    securityEntitiesPath: paths.securityEntities,
    securityRelationshipsPath: paths.securityRelationships,
    asOf: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(
    result.issues.some((item) => item.code === "unknown_document_entity"),
    "Document Revision must not borrow an entity first observed and retrieved after the exact cutoff",
  );
  assert.equal(result.snapshot, null);
  assert.equal(result.snapshotRevisionCount, 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("document-revision-security-master-cutoff: future same-day identity fails closed OK");
