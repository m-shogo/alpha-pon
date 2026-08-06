import assert from "node:assert/strict";
import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
  withEvidenceRelationHash,
  type EvidenceRecord,
  type EvidenceRecordInput,
  type EvidenceRelationRecord,
  type EvidenceSnapshot,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  buildClaimGraphSnapshot,
  validateClaimContradictionGraph,
  withClaimGraphEdgeHash,
  withClaimRecordHash,
  type ClaimGraphEdgeRecord,
  type ClaimGraphEdgeRecordInput,
  type ClaimGraphSchemas,
  type ClaimRecord,
  type ClaimRecordInput,
} from "../../src/research/claim-contradiction-graph.js";
import {
  assessClaimForRecommendationGoverned,
  buildGovernedClaimGraphSnapshot,
  validateClaimGraphGovernance,
} from "../../src/research/claim-contradiction-graph-hardening.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: ClaimGraphSchemas = {
  claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
  edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
};
const knownEntityIds = new Set(["entity:issuer:fixture"]);

function evidence(
  overrides: Partial<EvidenceRecordInput> = {},
): EvidenceRecord {
  const evidenceId = overrides.evidenceId ?? "evidence:fixture:primary";
  return withEvidenceRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${evidenceId}:record:001`,
    evidenceId,
    entityIds: overrides.entityIds ?? ["entity:issuer:fixture"],
    sourceId: overrides.sourceId ?? "source:company-ir:fixture",
    sourceType: overrides.sourceType ?? "company_ir",
    sourceLocator: overrides.sourceLocator ?? "https://example.com/ir/fixture",
    sourceContentHash: overrides.sourceContentHash ?? "a".repeat(64),
    eventAtStatus: overrides.eventAtStatus ?? "known",
    eventAt: overrides.eventAt ?? "2026-08-05T14:00:00+09:00",
    publishedAt: overrides.publishedAt ?? "2026-08-05T15:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:01:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:02:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T15:00:00+09:00",
    firstExecutableAt: overrides.firstExecutableAt ?? "2026-08-06T09:00:00+09:00",
    evidenceTier: overrides.evidenceTier ?? "primary_company",
    status: overrides.status ?? "active",
    license: overrides.license ?? "metadata_only",
    storagePolicy: overrides.storagePolicy ?? "metadata_only",
    title: overrides.title ?? "Fixture disclosure",
    summary: overrides.summary ?? "Fixture primary evidence summary",
    retrievalRunId: overrides.retrievalRunId ?? "retrieval-run-fixture",
    parserVersion: overrides.parserVersion ?? "parser-v1",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.documentId ? { documentId: overrides.documentId } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function relation(
  overrides: Partial<Omit<EvidenceRelationRecord, "contentHash">> = {},
): EvidenceRelationRecord {
  return withEvidenceRelationHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? "evidence-relation:fixture:record:001",
    relationId: overrides.relationId ?? "evidence-relation:fixture:correction",
    relationType: overrides.relationType ?? "corrects",
    fromEvidenceId: overrides.fromEvidenceId ?? "evidence:fixture:correction",
    toEvidenceId: overrides.toEvidenceId ?? "evidence:fixture:primary",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T17:00:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T17:01:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T17:02:00+09:00",
    sourceRefs: overrides.sourceRefs ?? ["source:correction:fixture"],
    supersessionStrength: overrides.supersessionStrength ?? "binding",
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function claim(overrides: Partial<ClaimRecordInput> = {}): ClaimRecord {
  const claimId = overrides.claimId ?? "claim:fixture:revenue-impact";
  return withClaimRecordHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${claimId}:record:001`,
    claimId,
    entityIds: overrides.entityIds ?? ["entity:issuer:fixture"],
    claimClass: overrides.claimClass ?? "fact",
    statement: overrides.statement ?? "The disclosed event affects revenue timing.",
    status: overrides.status ?? "active",
    informationCutoff: overrides.informationCutoff ?? "2026-08-05T15:02:00+09:00",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T15:02:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:03:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:04:00+09:00",
    falsificationConditions: overrides.falsificationConditions ?? [],
    unknownRefs: overrides.unknownRefs ?? [],
    modelVersion: overrides.modelVersion ?? "claim-model-v1",
    ruleVersion: overrides.ruleVersion ?? "claim-graph-v1",
    ...(overrides.horizon ? { horizon: overrides.horizon } : {}),
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function edge(overrides: Partial<ClaimGraphEdgeRecordInput> = {}): ClaimGraphEdgeRecord {
  const edgeId = overrides.edgeId ?? "claim-edge:fixture:support";
  return withClaimGraphEdgeHash({
    schemaVersion: 1,
    recordId: overrides.recordId ?? `${edgeId}:record:001`,
    edgeId,
    fromKind: overrides.fromKind ?? "evidence",
    fromId: overrides.fromId ?? "evidence:fixture:primary",
    toKind: overrides.toKind ?? "claim",
    toId: overrides.toId ?? "claim:fixture:revenue-impact",
    relationType: overrides.relationType ?? "supports",
    strength: overrides.strength ?? "material",
    effectiveFrom: overrides.effectiveFrom ?? "2026-08-05T15:03:00+09:00",
    observedAt: overrides.observedAt ?? "2026-08-05T15:03:00+09:00",
    retrievedAt: overrides.retrievedAt ?? "2026-08-05T15:04:00+09:00",
    sourceEvidenceIds: overrides.sourceEvidenceIds ?? ["evidence:fixture:primary"],
    ...(overrides.effectiveTo ? { effectiveTo: overrides.effectiveTo } : {}),
    ...(overrides.supersedesRecordId
      ? { supersedesRecordId: overrides.supersedesRecordId }
      : {}),
  });
}

function snapshot(
  evidenceRecords: EvidenceRecord[] = [evidence()],
  relations: EvidenceRelationRecord[] = [],
  asOf = "2026-08-06T10:00:00+09:00",
): EvidenceSnapshot {
  return buildEvidenceSnapshot(
    evidenceRecords,
    relations,
    asOf,
    "system_replay",
    "knowledge",
  );
}

{
  const claims = [claim()];
  const edges = [edge()];
  const evidenceSnapshot = snapshot();
  const errors = validateClaimContradictionGraph(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  ).filter((item) => item.severity === "error");
  assert.deepEqual(errors, []);

  const governed = buildGovernedClaimGraphSnapshot(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  const replayed = buildGovernedClaimGraphSnapshot(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  assert.equal(governed.contentHash, replayed.contentHash);
  const assessment = assessClaimForRecommendationGoverned(
    claims,
    edges,
    schemas,
    evidenceSnapshot,
    claims[0].claimId,
    knownEntityIds,
  );
  assert.equal(assessment.eligible, true);
  assert.deepEqual(assessment.supportEvidenceIds, ["evidence:fixture:primary"]);
  console.log("claim-contradiction-graph: deterministic eligible fact OK");
}

{
  const original = evidence();
  const correction = evidence({
    evidenceId: "evidence:fixture:correction",
    recordId: "evidence:fixture:correction:record:001",
    sourceContentHash: "b".repeat(64),
    publishedAt: "2026-08-05T17:00:00+09:00",
    observedAt: "2026-08-05T17:01:00+09:00",
    retrievedAt: "2026-08-05T17:02:00+09:00",
    effectiveFrom: "2026-08-05T17:00:00+09:00",
    firstExecutableAt: "2026-08-06T09:00:00+09:00",
    title: "Correction disclosure",
    summary: "Correction replaces the prior disclosure.",
  });
  const evidenceSnapshot = snapshot([original, correction], [relation()]);
  const assessment = assessClaimForRecommendationGoverned(
    [claim()],
    [edge()],
    schemas,
    evidenceSnapshot,
    "claim:fixture:revenue-impact",
    knownEntityIds,
  );
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.blockers.includes("claim_without_eligible_supporting_evidence"));
  console.log("claim-contradiction-graph: corrected Evidence cannot re-enter support OK");
}

{
  const secondary = evidence({
    evidenceId: "evidence:fixture:news",
    recordId: "evidence:fixture:news:record:001",
    sourceType: "reliable_news",
    evidenceTier: "secondary_reliable",
    sourceContentHash: "c".repeat(64),
  });
  const binding = edge({
    edgeId: "claim-edge:fixture:binding-contradiction",
    recordId: "claim-edge:fixture:binding-contradiction:record:001",
    fromId: secondary.evidenceId,
    relationType: "contradicts",
    strength: "binding",
    sourceEvidenceIds: [secondary.evidenceId],
  });
  assert.ok(validateClaimGraphGovernance(
    [claim()],
    [binding],
    schemas,
    snapshot([secondary]),
    knownEntityIds,
  ).some((item) => item.code === "binding_claim_edge_requires_primary_evidence"));
  console.log("claim-contradiction-graph: secondary source cannot create binding edge OK");
}

{
  const first = claim({ claimId: "claim:fixture:a", recordId: "claim-a-record" });
  const second = claim({ claimId: "claim:fixture:b", recordId: "claim-b-record" });
  const cycleA = edge({
    edgeId: "claim-edge:a-to-b",
    recordId: "claim-edge:a-to-b:record",
    fromKind: "claim",
    fromId: first.claimId,
    toId: second.claimId,
    relationType: "supports",
    strength: "material",
  });
  const cycleB = edge({
    edgeId: "claim-edge:b-to-a",
    recordId: "claim-edge:b-to-a:record",
    fromKind: "claim",
    fromId: second.claimId,
    toId: first.claimId,
    relationType: "supports",
    strength: "material",
  });
  assert.ok(validateClaimContradictionGraph(
    [first, second],
    [cycleA, cycleB],
    schemas,
    snapshot(),
    knownEntityIds,
  ).some((item) => item.code === "claim_support_cycle"));
  console.log("claim-contradiction-graph: circular support block OK");
}

{
  const invalidated = claim({
    recordId: "claim-terminal-record-001",
    status: "invalidated",
  });
  const reactivated = claim({
    recordId: "claim-terminal-record-002",
    status: "active",
    informationCutoff: "2026-08-05T16:00:00+09:00",
    observedAt: "2026-08-05T16:01:00+09:00",
    retrievedAt: "2026-08-05T16:02:00+09:00",
    supersedesRecordId: invalidated.recordId,
  });
  assert.ok(validateClaimContradictionGraph(
    [invalidated, reactivated],
    [],
    schemas,
    snapshot(),
    knownEntityIds,
  ).some((item) => item.code === "invalid_claim_status_transition"));
  console.log("claim-contradiction-graph: terminal claim reactivation block OK");
}

{
  const opinion = claim({
    claimId: "claim:fixture:opinion",
    recordId: "claim:fixture:opinion:record:001",
    claimClass: "opinion",
    statement: "Management appears trustworthy.",
  });
  const support = edge({
    edgeId: "claim-edge:fixture:opinion-support",
    recordId: "claim-edge:fixture:opinion-support:record:001",
    toId: opinion.claimId,
  });
  const claimSnapshot = buildClaimGraphSnapshot(
    [opinion],
    [support],
    snapshot(),
    "2026-08-06T10:00:00+09:00",
  );
  assert.equal(claimSnapshot.claimDisposition[opinion.claimId], "active");
  const assessment = assessClaimForRecommendationGoverned(
    [opinion],
    [support],
    schemas,
    snapshot(),
    opinion.claimId,
    knownEntityIds,
  );
  assert.equal(assessment.eligible, false);
  assert.ok(assessment.blockers.includes("claim_class_not_recommendation_evidence:opinion"));
  console.log("claim-contradiction-graph: opinion persistence without promotion OK");
}

console.log("claim-contradiction-graph: 全テスト成功");
