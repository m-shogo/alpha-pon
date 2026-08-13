import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withEvidenceRecordHash,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  validateClaimGraphRepository,
} from "../../src/research/claim-contradiction-graph-repository.js";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
} from "../../src/research/claim-contradiction-graph.js";
import {
  withSecurityEntityHash,
} from "../../src/research/security-master.js";

function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

function writePilot(dir: string) {
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
    evidence: join(dir, "evidence.jsonl"),
    evidenceRelations: join(dir, "evidence-relations.jsonl"),
    securityEntities: join(dir, "security-entities.jsonl"),
    securityRelationships: join(dir, "security-relationships.jsonl"),
  };
  const entity = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:issuer:claim-pilot:record:001",
    entityId: "entity:issuer:claim-pilot",
    entityType: "legal_entity",
    canonicalName: "Claim Pilot株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Claim Pilot株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:name:claim-pilot"],
    }],
    identifiers: [{
      type: "internal",
      value: "entity:issuer:claim-pilot",
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:security:id:claim-pilot"],
    }],
    officialLinks: [{
      kind: "ir",
      url: "https://example.com/claim-pilot/ir",
      verificationStatus: "verified_official",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:ir:claim-pilot"],
    }],
    sourceRefs: ["source:security:claim-pilot"],
    observedAt: "2026-08-05T14:00:00+09:00",
    retrievedAt: "2026-08-05T14:01:00+09:00",
  });
  const evidence = withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: "evidence:claim-pilot:record:001",
    evidenceId: "evidence:claim-pilot:disclosure",
    entityIds: [entity.entityId],
    sourceId: "source:claim-pilot:ir",
    sourceType: "company_ir",
    sourceLocator: "https://example.com/claim-pilot/ir/disclosure",
    sourceContentHash: "a".repeat(64),
    eventAtStatus: "known",
    eventAt: "2026-08-05T15:00:00+09:00",
    publishedAt: "2026-08-05T15:00:00+09:00",
    observedAt: "2026-08-05T15:01:00+09:00",
    retrievedAt: "2026-08-05T15:02:00+09:00",
    effectiveFrom: "2026-08-05T15:00:00+09:00",
    firstExecutableAt: "2026-08-06T09:00:00+09:00",
    evidenceTier: "primary_company",
    status: "active",
    license: "metadata_only",
    storagePolicy: "metadata_only",
    title: "Claim pilot disclosure",
    summary: "Pilot disclosure confirms a schedule change.",
    retrievalRunId: "retrieval-run-claim-pilot",
    parserVersion: "parser-v1",
  });
  const claim = withClaimRecordHash({
    schemaVersion: 1,
    recordId: "claim:claim-pilot:schedule:record:001",
    claimId: "claim:claim-pilot:schedule",
    entityIds: [entity.entityId],
    claimClass: "fact",
    statement: "The implementation schedule changed.",
    status: "active",
    informationCutoff: "2026-08-05T15:02:00+09:00",
    effectiveFrom: "2026-08-05T15:02:00+09:00",
    observedAt: "2026-08-05T15:03:00+09:00",
    retrievedAt: "2026-08-05T15:04:00+09:00",
    falsificationConditions: [],
    unknownRefs: [],
    modelVersion: "claim-model-v1",
    ruleVersion: "claim-graph-v1",
  });
  const edge = withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: "claim-edge:claim-pilot:support:record:001",
    edgeId: "claim-edge:claim-pilot:support",
    fromKind: "evidence",
    fromId: evidence.evidenceId,
    toKind: "claim",
    toId: claim.claimId,
    relationType: "supports",
    strength: "material",
    effectiveFrom: "2026-08-05T15:03:00+09:00",
    observedAt: "2026-08-05T15:03:00+09:00",
    retrievedAt: "2026-08-05T15:04:00+09:00",
    sourceEvidenceIds: [evidence.evidenceId],
  });

  writeJsonl(paths.securityEntities, [entity]);
  writeJsonl(paths.securityRelationships, []);
  writeJsonl(paths.evidence, [evidence]);
  writeJsonl(paths.evidenceRelations, []);
  writeJsonl(paths.claims, [claim]);
  writeJsonl(paths.edges, [edge]);
  return paths;
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-repository-empty-"));
  try {
    const result = validateClaimGraphRepository({
      claimsPath: join(dir, "claims.jsonl"),
      edgesPath: join(dir, "edges.jsonl"),
      evidencePath: join(dir, "evidence.jsonl"),
      evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T10:00:00+09:00",
    });
    assert.equal(result.issues.some((item) => item.severity === "error"), false);
    assert.equal(result.claimRecordCount, 0);
    assert.equal(result.snapshotClaimCount, 0);
    assert.ok(result.snapshot, "empty governed snapshot is valid but milestone remains unproven");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-repository: absent local data OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-repository-pilot-"));
  try {
    const paths = writePilot(dir);
    const result = validateClaimGraphRepository({
      claimsPath: paths.claims,
      edgesPath: paths.edges,
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
    assert.equal(result.snapshotClaimCount, 1);
    assert.equal(result.recommendationEligibleClaimCount, 1);
    assert.equal(result.assessments[0].eligible, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-repository: minimal pilot snapshot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-repository-hidden-dependency-"));
  try {
    const paths = writePilot(dir);
    writeFileSync(`${paths.evidence}.batch-journal.json`, "{}\n", "utf-8");
    const result = validateClaimGraphRepository({
      claimsPath: paths.claims,
      edgesPath: paths.edges,
      evidencePath: paths.evidence,
      evidenceRelationsPath: paths.evidenceRelations,
      securityEntitiesPath: paths.securityEntities,
      securityRelationshipsPath: paths.securityRelationships,
      asOf: "2026-08-06T10:00:00+09:00",
      includeDependencyIssues: false,
    });
    assert.ok(result.issues.some((item) => item.code === "claim_graph_dependency_invalid"));
    assert.equal(result.snapshot, null);
    assert.equal(result.recommendationEligibleClaimCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-repository: hidden invalid dependency blocks snapshot OK");
}

{
  const dir = mkdtempSync(join(tmpdir(), "claim-graph-repository-partial-"));
  const claimsPath = join(dir, "claims.jsonl");
  try {
    writeFileSync(claimsPath, '{"partial":true}', "utf-8");
    const result = validateClaimGraphRepository({
      claimsPath,
      edgesPath: join(dir, "edges.jsonl"),
      evidencePath: join(dir, "evidence.jsonl"),
      evidenceRelationsPath: join(dir, "evidence-relations.jsonl"),
      securityEntitiesPath: join(dir, "security-entities.jsonl"),
      securityRelationshipsPath: join(dir, "security-relationships.jsonl"),
      asOf: "2026-08-06T10:00:00+09:00",
    });
    assert.ok(result.issues.some((item) => item.code === "partial_claim_graph_tail"));
    assert.equal(result.snapshot, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("claim-contradiction-graph-repository: partial tail block OK");
}

console.log("claim-contradiction-graph-repository: 全テスト成功");
