import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateDocumentRevisionDiffRepository,
} from "../../src/research/document-revision-diff-repository.js";
import {
  withSecurityEntityHash,
} from "../../src/research/security-master.js";
import {
  documentEvidence,
  documentRevisionPilotRecords,
} from "./document-revision-diff-fixtures.js";

function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0
      ? ""
      : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-repository-empty-"));
  try {
    const result = validateDocumentRevisionDiffRepository({
      revisionsPath: join(dir, "revisions.jsonl"),
      diffsPath: join(dir, "diffs.jsonl"),
      evidencePath: join(dir, "evidence.jsonl"),
      evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T10:00:00+09:00",
    });
    assert.equal(result.issues.some((item) => item.severity === "error"), false);
    assert.equal(result.revisionRecordCount, 0);
    assert.equal(result.snapshotRevisionCount, 0);
    assert.ok(result.snapshot, "empty governed snapshot is valid but milestone remains unproven");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-repository-pilot-"));
  const paths = {
    revisions: join(dir, "revisions.jsonl"),
    diffs: join(dir, "diffs.jsonl"),
    evidence: join(dir, "evidence.jsonl"),
    evidenceRelations: join(dir, "evidence-relations.jsonl"),
    securityEntities: join(dir, "security-entities.jsonl"),
    securityRelationships: join(dir, "security-relationships.jsonl"),
  };
  try {
    const entity = withSecurityEntityHash({
      schemaVersion: 1,
      recordId: "entity:issuer:document-pilot:record:001",
      entityId: "entity:issuer:document-pilot",
      entityType: "legal_entity",
      canonicalName: "Document Pilot株式会社",
      jurisdiction: "JP",
      validFrom: "2020-01-01",
      status: "active",
      names: [{
        name: "Document Pilot株式会社",
        kind: "legal",
        language: "ja",
        validFrom: "2020-01-01",
        sourceRefs: ["source:security:name:document-pilot"],
      }],
      identifiers: [{
        type: "internal",
        value: "entity:issuer:document-pilot",
        validFrom: "2020-01-01",
        confidence: "verified",
        sourceRefs: ["source:security:id:document-pilot"],
      }],
      officialLinks: [{
        kind: "ir",
        url: "https://example.com/document-pilot/ir",
        verificationStatus: "verified_official",
        validFrom: "2020-01-01",
        sourceRefs: ["source:security:ir:document-pilot"],
      }],
      sourceRefs: ["source:security:document-pilot"],
      observedAt: "2026-08-05T14:00:00+09:00",
      retrievedAt: "2026-08-05T14:01:00+09:00",
    });
    const initialEvidence = documentEvidence();
    const correctionEvidence = documentEvidence({
      evidenceId: "evidence:document-pilot:correction",
    });
    const pilot = documentRevisionPilotRecords();

    writeJsonl(paths.securityEntities, [entity]);
    writeJsonl(paths.securityRelationships, []);
    writeJsonl(paths.evidence, [initialEvidence, correctionEvidence]);
    writeJsonl(paths.evidenceRelations, []);
    writeJsonl(paths.revisions, pilot.revisions);
    writeJsonl(paths.diffs, pilot.diffs);

    const result = validateDocumentRevisionDiffRepository({
      revisionsPath: paths.revisions,
      diffsPath: paths.diffs,
      evidencePath: paths.evidence,
      evidenceRelationsPath: paths.evidenceRelations,
      securityEntitiesPath: paths.securityEntities,
      securityRelationshipsPath: paths.securityRelationships,
      asOf: "2026-08-06T10:00:00+09:00",
    });
    assert.deepEqual(
      result.issues.filter((item) => item.severity === "error"),
      [],
    );
    assert.equal(result.snapshotRevisionCount, 2);
    assert.equal(result.snapshotDiffCount, 1);
    assert.equal(result.claimEligibleChangeCount, 1);
    assert.equal(result.claimEligibleChanges[0].path, "/summary");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-repository: minimal pilot snapshot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "document-revision-repository-partial-"));
  const revisionsPath = join(dir, "revisions.jsonl");
  try {
    writeFileSync(revisionsPath, '{"partial":true}', "utf-8");
    const result = validateDocumentRevisionDiffRepository({
      revisionsPath,
      diffsPath: join(dir, "diffs.jsonl"),
      evidencePath: join(dir, "evidence.jsonl"),
      evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T10:00:00+09:00",
    });
    assert.ok(result.issues.some((item) =>
      item.code === "partial_document_revision_tail",
    ));
    assert.equal(result.snapshot, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("document-revision-diff-repository: partial tail block OK");
}

console.log("document-revision-diff-repository: 全テスト成功");
