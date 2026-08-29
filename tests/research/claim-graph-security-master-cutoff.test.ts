import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateClaimGraphRepository } from "../../src/research/claim-contradiction-graph-repository.js";
import { withClaimRecordHash } from "../../src/research/claim-contradiction-graph.js";
import { withSecurityEntityHash } from "../../src/research/security-master.js";

function writeJsonl(path: string, records: unknown[]): void {
  writeFileSync(
    path,
    records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8",
  );
}

const dir = mkdtempSync(join(tmpdir(), "claim-graph-security-master-cutoff-"));
try {
  const paths = {
    claims: join(dir, "claims.jsonl"),
    edges: join(dir, "edges.jsonl"),
    evidence: join(dir, "evidence.jsonl"),
    evidenceRelations: join(dir, "evidence-relations.jsonl"),
    securityEntities: join(dir, "security-entities.jsonl"),
    securityRelationships: join(dir, "security-relationships.jsonl"),
  };
  const entityId = "entity:issuer:claim-future-same-day";
  const futureEntity = withSecurityEntityHash({
    schemaVersion: 1,
    recordId: "entity:issuer:claim-future-same-day:record:001",
    entityId,
    entityType: "legal_entity",
    canonicalName: "Claim Future Same Day株式会社",
    jurisdiction: "JP",
    validFrom: "2020-01-01",
    status: "active",
    names: [{
      name: "Claim Future Same Day株式会社",
      kind: "legal",
      language: "ja",
      validFrom: "2020-01-01",
      sourceRefs: ["source:security:name:claim-future-same-day"],
    }],
    identifiers: [{
      type: "internal",
      value: entityId,
      validFrom: "2020-01-01",
      confidence: "verified",
      sourceRefs: ["source:security:id:claim-future-same-day"],
    }],
    officialLinks: [],
    sourceRefs: ["source:security:claim-future-same-day"],
    observedAt: "2026-08-06T18:00:00+09:00",
    retrievedAt: "2026-08-06T18:01:00+09:00",
  });
  const claim = withClaimRecordHash({
    schemaVersion: 1,
    recordId: "claim:future-same-day-identity:record:001",
    claimId: "claim:future-same-day-identity",
    entityIds: [entityId],
    claimClass: "fact",
    statement: "This claim must not borrow an identity first learned later the same day.",
    status: "active",
    informationCutoff: "2026-08-06T10:00:00+09:00",
    effectiveFrom: "2026-08-06T10:00:00+09:00",
    observedAt: "2026-08-06T10:01:00+09:00",
    retrievedAt: "2026-08-06T10:02:00+09:00",
    falsificationConditions: [],
    unknownRefs: [],
    modelVersion: "claim-model-v1",
    ruleVersion: "claim-graph-v1",
  });

  writeJsonl(paths.securityEntities, [futureEntity]);
  writeJsonl(paths.securityRelationships, []);
  writeJsonl(paths.evidence, []);
  writeJsonl(paths.evidenceRelations, []);
  writeJsonl(paths.claims, [claim]);
  writeJsonl(paths.edges, []);

  const result = validateClaimGraphRepository({
    claimsPath: paths.claims,
    edgesPath: paths.edges,
    evidencePath: paths.evidence,
    evidenceRelationsPath: paths.evidenceRelations,
    securityEntitiesPath: paths.securityEntities,
    securityRelationshipsPath: paths.securityRelationships,
    asOf: "2026-08-06T12:00:00+09:00",
  });

  assert.ok(
    result.issues.some((item) => item.code === "unknown_claim_entity"),
    "Claim Graph must not borrow a Security Master entity first observed and retrieved after the exact cutoff",
  );
  assert.equal(result.snapshot, null);
  assert.equal(result.snapshotClaimCount, 0);

  for (const asOf of ["not-a-time", "2026-08-06T12:00:00", "2026-02-31T12:00:00+09:00"]) {
    const invalidResult = validateClaimGraphRepository({
      claimsPath: paths.claims,
      edgesPath: paths.edges,
      evidencePath: paths.evidence,
      evidenceRelationsPath: paths.evidenceRelations,
      securityEntitiesPath: paths.securityEntities,
      securityRelationshipsPath: paths.securityRelationships,
      asOf,
    });
    assert.ok(
      invalidResult.issues.some((item) => item.code === "invalid_claim_graph_as_of"),
      `Claim Graph must fail closed with a structured issue for invalid asOf: ${asOf}`,
    );
    assert.equal(invalidResult.snapshot, null);
    assert.equal(invalidResult.snapshotClaimCount, 0);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("claim-graph-security-master-cutoff: PIT cutoff and invalid asOf fail closed OK");
