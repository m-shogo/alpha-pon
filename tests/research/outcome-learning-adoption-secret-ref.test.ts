import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  withOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "../../src/research/outcome-learning-proposal.js";
import {
  withOutcomeLearningDecisionHash,
  type OutcomeLearningDecisionRecord,
} from "../../src/research/outcome-learning-decision.js";
import {
  withOutcomeLearningShadowEvaluationHash,
  type OutcomeLearningShadowEvaluationRecord,
} from "../../src/research/outcome-learning-shadow-evaluation.js";
import {
  validateOutcomeLearningAdoptionDecisionRecord,
  withOutcomeLearningAdoptionDecisionHash,
  type OutcomeLearningAdoptionDecisionContext,
} from "../../src/research/outcome-learning-adoption-decision.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-adoption-decision.schema.json", "utf-8"),
) as JsonSchema;

const proposal: OutcomeLearningProposalRecord = withOutcomeLearningProposalHash({
  schemaVersion: 1,
  proposalId: "learning-proposal:adoption-secret-ref:001",
  createdAt: "2026-08-21T13:00:00+09:00",
  semanticReviewId: "semantic:adoption-secret-ref:001",
  semanticReviewContentHash: "a".repeat(64),
  proposalStage: "human_review_ready",
  targetKind: "evidence_requirement",
  targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
  problemStatement: "synthetic secret-ref regression fixture",
  proposedChange: "keep the adoption provenance boundary fail-closed",
  rationale: "synthetic regression only",
  expectedEffect: "secret-bearing refs cannot enter adoption provenance",
  evaluationPlan: {
    method: "synthetic shadow validation",
    successCriteria: ["secret ref rejected"],
    failureCriteria: ["secret ref accepted"],
    minimumEvidence: ["synthetic fixture"],
  },
  falsificationConditions: ["validator accepts secret ref"],
  rollbackPlan: "no production mutation",
  evidenceRefs: ["evidence:proposal:001"],
  humanApprovalRequired: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

const advanceDecision: OutcomeLearningDecisionRecord = withOutcomeLearningDecisionHash({
  schemaVersion: 1,
  decisionId: "learning-decision:adoption-secret-ref:001",
  decidedAt: "2026-08-22T10:00:00+09:00",
  proposalId: proposal.proposalId,
  proposalContentHash: proposal.contentHash,
  reviewerRef: "reviewer:human",
  decision: "advance_to_shadow",
  decisionRationale: "synthetic regression only",
  conditions: ["shadow only"],
  evidenceRefs: ["evidence:proposal:001"],
  proposalReviewed: true,
  evaluationPlanAcknowledged: true,
  rollbackPlanAcknowledged: true,
  humanDecisionConfirmed: true,
  shadowEvaluationAuthorized: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

function shadow(evidenceRef: string): OutcomeLearningShadowEvaluationRecord {
  return withOutcomeLearningShadowEvaluationHash({
    schemaVersion: 1,
    evaluationId: `shadow-evaluation:adoption-secret-ref:${evidenceRef.includes("userinfo") ? "userinfo" : "fragment"}`,
    evaluatedAt: "2026-09-15T12:00:00+09:00",
    evidenceCutoff: "2026-09-15T11:00:00+09:00",
    decisionId: advanceDecision.decisionId,
    decisionContentHash: advanceDecision.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    evaluationStage: "final",
    evaluationMethod: proposal.evaluationPlan.method,
    successCriteriaAssessments: [{ criterion: proposal.evaluationPlan.successCriteria[0]!, assessment: "met", evidenceRefs: [evidenceRef] }],
    failureCriteriaAssessments: [{ criterion: proposal.evaluationPlan.failureCriteria[0]!, assessment: "not_met", evidenceRefs: [evidenceRef] }],
    minimumEvidenceAssessments: [{ criterion: proposal.evaluationPlan.minimumEvidence[0]!, assessment: "met", evidenceRefs: [evidenceRef] }],
    falsificationAssessments: [{ criterion: proposal.falsificationConditions[0]!, assessment: "not_met", evidenceRefs: [evidenceRef] }],
    evidenceRefs: [evidenceRef],
    verdict: "supports_change",
    humanReviewRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

for (const evidenceRef of [
  "evidence:shadow:001#token=synthetic",
  "https://userinfo:synthetic@example.test/evidence",
]) {
  const source = shadow(evidenceRef);
  const context: OutcomeLearningAdoptionDecisionContext = {
    shadowEvaluationsById: new Map([[source.evaluationId, source]]),
    validatedShadowEvaluationHashes: new Set([source.contentHash]),
    proposalsById: new Map([[proposal.proposalId, proposal]]),
    validatedProposalHashes: new Set([proposal.contentHash]),
    reviewersByRef: new Map([["reviewer:human", { kind: "human" as const }]]),
  };
  const record = withOutcomeLearningAdoptionDecisionHash({
    schemaVersion: 1,
    adoptionDecisionId: `adoption-decision:secret-ref:${evidenceRef.includes("userinfo") ? "userinfo" : "fragment"}`,
    decidedAt: "2026-09-16T10:00:00+09:00",
    shadowEvaluationId: source.evaluationId,
    shadowEvaluationContentHash: source.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    reviewerRef: "reviewer:human",
    decision: "approve_change_preparation",
    decisionRationale: "synthetic regression only",
    conditions: ["no production mutation"],
    evidenceRefs: [evidenceRef],
    shadowEvaluationReviewed: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    governedChangePreparationAuthorized: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
  const issues = validateOutcomeLearningAdoptionDecisionRecord(record, schema, context);
  assert.ok(
    issues.some((candidate) => candidate.code === "secret_like_adoption_evidence_ref"),
    `secret-bearing adoption evidence ref must fail closed: ${evidenceRef}`,
  );
}

console.log("outcome-learning-adoption-secret-ref.test.ts passed");
