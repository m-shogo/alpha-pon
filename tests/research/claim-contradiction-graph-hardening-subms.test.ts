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
import { validateClaimGraphGovernance } from "../../src/research/claim-contradiction-graph-hardening.js";
import { loadCouncilSchema } from "../../src/research/stock-pro-council-v2-validation.js";

const schemas: ClaimGraphSchemas = {
  claim: loadCouncilSchema("research/schemas/claim-record.schema.json"),
  edge: loadCouncilSchema("research/schemas/claim-graph-edge-record.schema.json"),
};
const entityId = "entity:issuer:claim-edge-subms";
const evidenceId = "evidence:claim-edge-subms:primary";

const evidence = withEvidenceRecordHash({
  schemaVersion: 1,
  recordId: "evidence:claim-edge-subms:record:001",
  evidenceId,
  entityIds: [entityId],
  sourceId: "source:claim-edge-subms:company-ir",
  sourceType: "company_ir",
  sourceLocator: "https://example.com/ir/claim-edge-subms",
  sourceContentHash: "a".repeat(64),
  eventAtStatus: "known",
  eventAt: "2026-08-05T15:00:00+09:00",
  publishedAt: "2026-08-05T15:01:00+09:00",
  observedAt: "2026-08-05T15:01:30+09:00",
  retrievedAt: "2026-08-05T15:02:00+09:00",
  effectiveFrom: "2026-08-05T15:01:00+09:00",
  firstExecutableAt: "2026-08-06T09:00:00+09:00",
  evidenceTier: "primary_company",
  status: "active",
  license: "metadata_only",
  storagePolicy: "metadata_only",
  title: "Claim edge sub-ms fixture",
  summary: "Synthetic primary evidence for chronology validation.",
  retrievalRunId: "retrieval-run-claim-edge-subms",
  parserVersion: "parser-v1",
});
const snapshot = buildEvidenceSnapshot(
  [evidence],
  [],
  "2026-08-06T10:00:00+09:00",
  "system_replay",
  "knowledge",
);

const sourceClaim = withClaimRecordHash({
  schemaVersion: 1,
  recordId: "claim:claim-edge-subms:source:record:001",
  claimId: "claim:claim-edge-subms:source",
  entityIds: [entityId],
  claimClass: "fact",
  statement: "The issuer disclosed the original implementation state.",
  status: "active",
  informationCutoff: "2026-08-05T15:02:00+09:00",
  effectiveFrom: "2026-08-05T15:02:00+09:00",
  observedAt: "2026-08-05T15:03:00.000000001+09:00",
  retrievedAt: "2026-08-05T15:04:00+09:00",
  falsificationConditions: [],
  unknownRefs: [],
  modelVersion: "claim-model-v1",
  ruleVersion: "claim-graph-v1",
});
const targetClaim = withClaimRecordHash({
  schemaVersion: 1,
  recordId: "claim:claim-edge-subms:target:record:001",
  claimId: "claim:claim-edge-subms:target",
  entityIds: [entityId],
  claimClass: "fact",
  statement: "The prior implementation state is superseded by corrected evidence.",
  status: "active",
  informationCutoff: "2026-08-05T15:02:00+09:00",
  effectiveFrom: "2026-08-05T15:02:00+09:00",
  observedAt: "2026-08-05T15:03:30+09:00",
  retrievedAt: "2026-08-05T15:04:00+09:00",
  falsificationConditions: [],
  unknownRefs: [],
  modelVersion: "claim-model-v1",
  ruleVersion: "claim-graph-v1",
});
const edge = withClaimGraphEdgeHash({
  schemaVersion: 1,
  recordId: "claim-edge:claim-edge-subms:record:001",
  edgeId: "claim-edge:claim-edge-subms:corrects",
  fromKind: "claim",
  fromId: sourceClaim.claimId,
  toKind: "claim",
  toId: targetClaim.claimId,
  relationType: "corrects",
  strength: "material",
  effectiveFrom: "2026-08-05T15:03:00+09:00",
  observedAt: "2026-08-05T15:03:00.000000000+09:00",
  retrievedAt: "2026-08-05T15:04:00+09:00",
  sourceEvidenceIds: [evidenceId],
});

const issues = validateClaimGraphGovernance(
  [sourceClaim, targetClaim],
  [edge],
  schemas,
  snapshot,
  new Set([entityId]),
);
assert.ok(issues.some((item) => item.code === "claim_edge_before_source_claim"));
console.log("claim-contradiction-graph-hardening-subms: 1ns pre-source disposition edge blocked OK");
