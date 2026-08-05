import assert from "node:assert/strict";
import {
  buildEvidenceSnapshot,
  withEvidenceRecordHash,
} from "../../src/research/bitemporal-evidence-store.js";
import {
  withClaimGraphEdgeHash,
  withClaimRecordHash,
  type ClaimGraphSchemas,
} from "../../src/research/claim-contradiction-graph.js";
import {
  buildClaimGraphSnapshotGovernedAtCutoff,
  validateClaimGraphGovernedAtCutoff,
  validateIncomingClaimGraphCutoff,
} from "../../src/research/claim-contradiction-graph-governed.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: ClaimGraphSchemas = {
  claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
  edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
};
const knownEntityIds = new Set(["entity:issuer:pit"]);
const evidence = withEvidenceRecordHash({
  schemaVersion: 1,
  recordId: "evidence:pit:record:001",
  evidenceId: "evidence:pit:early",
  entityIds: ["entity:issuer:pit"],
  sourceId: "source:pit:ir",
  sourceType: "company_ir",
  sourceLocator: "https://example.com/pit/early",
  sourceContentHash: "a".repeat(64),
  eventAtStatus: "known",
  eventAt: "2026-08-05T14:00:00+09:00",
  publishedAt: "2026-08-05T15:00:00+09:00",
  observedAt: "2026-08-05T15:01:00+09:00",
  retrievedAt: "2026-08-05T15:02:00+09:00",
  effectiveFrom: "2026-08-05T15:00:00+09:00",
  firstExecutableAt: "2026-08-06T09:00:00+09:00",
  evidenceTier: "primary_company",
  status: "active",
  license: "metadata_only",
  storagePolicy: "metadata_only",
  title: "Early PIT disclosure",
  summary: "Evidence available before the historical cutoff.",
  retrievalRunId: "retrieval-run-pit",
  parserVersion: "parser-v1",
});
const evidenceSnapshot = buildEvidenceSnapshot(
  [evidence],
  [],
  "2026-08-05T16:00:00+09:00",
  "system_replay",
  "knowledge",
);

const earlyClaim = withClaimRecordHash({
  schemaVersion: 1,
  recordId: "claim:pit:early:record:001",
  claimId: "claim:pit:early",
  entityIds: ["entity:issuer:pit"],
  claimClass: "fact",
  statement: "The early disclosure was available before cutoff.",
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
const earlyEdge = withClaimGraphEdgeHash({
  schemaVersion: 1,
  recordId: "claim-edge:pit:early:record:001",
  edgeId: "claim-edge:pit:early",
  fromKind: "evidence",
  fromId: evidence.evidenceId,
  toKind: "claim",
  toId: earlyClaim.claimId,
  relationType: "supports",
  strength: "material",
  effectiveFrom: "2026-08-05T15:03:00+09:00",
  observedAt: "2026-08-05T15:03:00+09:00",
  retrievedAt: "2026-08-05T15:04:00+09:00",
  sourceEvidenceIds: [evidence.evidenceId],
});
const futureClaim = withClaimRecordHash({
  schemaVersion: 1,
  recordId: "claim:pit:future:record:001",
  claimId: "claim:pit:future",
  entityIds: ["entity:issuer:pit"],
  claimClass: "fact",
  statement: "This claim was created after the historical cutoff.",
  status: "active",
  informationCutoff: "2026-08-05T18:00:00+09:00",
  effectiveFrom: "2026-08-05T18:00:00+09:00",
  observedAt: "2026-08-05T18:01:00+09:00",
  retrievedAt: "2026-08-05T18:02:00+09:00",
  falsificationConditions: [],
  unknownRefs: [],
  modelVersion: "claim-model-v1",
  ruleVersion: "claim-graph-v1",
});
const futureEdge = withClaimGraphEdgeHash({
  schemaVersion: 1,
  recordId: "claim-edge:pit:future:record:001",
  edgeId: "claim-edge:pit:future",
  fromKind: "evidence",
  fromId: "evidence:pit:future-not-in-snapshot",
  toKind: "claim",
  toId: futureClaim.claimId,
  relationType: "supports",
  strength: "material",
  effectiveFrom: "2026-08-05T18:01:00+09:00",
  observedAt: "2026-08-05T18:01:00+09:00",
  retrievedAt: "2026-08-05T18:02:00+09:00",
  sourceEvidenceIds: ["evidence:pit:future-not-in-snapshot"],
});

{
  const issues = validateClaimGraphGovernedAtCutoff(
    [earlyClaim, futureClaim],
    [earlyEdge, futureEdge],
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  assert.deepEqual(issues.filter((item) => item.severity === "error"), []);
  const snapshot = buildClaimGraphSnapshotGovernedAtCutoff(
    [earlyClaim, futureClaim],
    [earlyEdge, futureEdge],
    schemas,
    evidenceSnapshot,
    knownEntityIds,
  );
  assert.deepEqual(snapshot.claimIds, [earlyClaim.claimId]);
  assert.deepEqual(snapshot.edgeIds, [earlyEdge.edgeId]);
  console.log("claim-contradiction-graph-pit: future records excluded from historical snapshot OK");
}

{
  const issues = validateIncomingClaimGraphCutoff(
    [futureClaim],
    [futureEdge],
    evidenceSnapshot,
  );
  assert.ok(issues.some((item) => item.code === "incoming_claim_after_snapshot_cutoff"));
  assert.ok(issues.some((item) => item.code === "incoming_claim_edge_after_snapshot_cutoff"));
  console.log("claim-contradiction-graph-pit: future append against old snapshot blocked OK");
}

console.log("claim-contradiction-graph-pit: 全テスト成功");
