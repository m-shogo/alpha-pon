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
  validateOutcomeLearningAdoptionDecisionRecords,
  withOutcomeLearningAdoptionDecisionHash,
  type OutcomeLearningAdoptionDecisionContext,
  type OutcomeLearningAdoptionDecisionRecord,
} from "../../src/research/outcome-learning-adoption-decision.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-adoption-decision.schema.json", "utf-8"),
) as JsonSchema;

const proposal: OutcomeLearningProposalRecord = withOutcomeLearningProposalHash({
  schemaVersion: 1,
  proposalId: "learning-proposal:adoption-fractional:001",
  createdAt: "2026-08-21T13:00:00+09:00",
  semanticReviewId: "semantic:adoption-fractional:001",
  semanticReviewContentHash: "a".repeat(64),
  proposalStage: "human_review_ready",
  targetKind: "evidence_requirement",
  targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
  problemStatement: "synthetic fractional-ordering regression fixture",
  proposedChange: "preserve full fractional instant ordering",
  rationale: "synthetic regression only",
  expectedEffect: "1ns chronology remains distinguishable",
  evaluationPlan: {
    method: "synthetic shadow validation",
    successCriteria: ["ordering preserved"],
    failureCriteria: ["ordering collapsed"],
    minimumEvidence: ["synthetic fixture"],
  },
  falsificationConditions: ["1ns order collapses"],
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
  decisionId: "learning-decision:adoption-fractional:001",
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

const shadow: OutcomeLearningShadowEvaluationRecord = withOutcomeLearningShadowEvaluationHash({
  schemaVersion: 1,
  evaluationId: "shadow-evaluation:adoption-fractional:001",
  evaluatedAt: "2026-09-15T12:00:00.000000000+09:00",
  evidenceCutoff: "2026-09-15T11:00:00+09:00",
  decisionId: advanceDecision.decisionId,
  decisionContentHash: advanceDecision.contentHash,
  proposalId: proposal.proposalId,
  proposalContentHash: proposal.contentHash,
  evaluationStage: "final",
  evaluationMethod: proposal.evaluationPlan.method,
  successCriteriaAssessments: [{ criterion: proposal.evaluationPlan.successCriteria[0]!, assessment: "met", evidenceRefs: ["evidence:shadow:001"] }],
  failureCriteriaAssessments: [{ criterion: proposal.evaluationPlan.failureCriteria[0]!, assessment: "not_met", evidenceRefs: ["evidence:shadow:001"] }],
  minimumEvidenceAssessments: [{ criterion: proposal.evaluationPlan.minimumEvidence[0]!, assessment: "met", evidenceRefs: ["evidence:shadow:001"] }],
  falsificationAssessments: [{ criterion: proposal.falsificationConditions[0]!, assessment: "not_met", evidenceRefs: ["evidence:shadow:001"] }],
  evidenceRefs: ["evidence:shadow:001"],
  verdict: "supports_change",
  humanReviewRequired: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

const context: OutcomeLearningAdoptionDecisionContext = {
  shadowEvaluationsById: new Map([[shadow.evaluationId, shadow]]),
  validatedShadowEvaluationHashes: new Set([shadow.contentHash]),
  proposalsById: new Map([[proposal.proposalId, proposal]]),
  validatedProposalHashes: new Set([proposal.contentHash]),
  reviewersByRef: new Map([["reviewer:human", { kind: "human" as const }]]),
};

function adoption(input: {
  id: string;
  decidedAt: string;
  decision: "defer" | "approve_change_preparation";
  supersedesAdoptionDecisionId?: string;
}): OutcomeLearningAdoptionDecisionRecord {
  return withOutcomeLearningAdoptionDecisionHash({
    schemaVersion: 1,
    adoptionDecisionId: input.id,
    decidedAt: input.decidedAt,
    shadowEvaluationId: shadow.evaluationId,
    shadowEvaluationContentHash: shadow.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    reviewerRef: "reviewer:human",
    decision: input.decision,
    decisionRationale: "synthetic fractional ordering regression",
    conditions: input.decision === "defer" ? ["recheck"] : ["prepare only"],
    evidenceRefs: ["evidence:shadow:001"],
    ...(input.supersedesAdoptionDecisionId ? { supersedesAdoptionDecisionId: input.supersedesAdoptionDecisionId } : {}),
    shadowEvaluationReviewed: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    governedChangePreparationAuthorized: input.decision === "approve_change_preparation",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const first = adoption({
  id: "adoption-decision:fractional:001",
  decidedAt: "2026-09-15T12:00:00.000000001+09:00",
  decision: "defer",
});
assert.equal(
  validateOutcomeLearningAdoptionDecisionRecord(first, schema, context)
    .some((candidate) => candidate.code === "adoption_time_not_after_shadow"),
  false,
);

const second = adoption({
  id: "adoption-decision:fractional:002",
  decidedAt: "2026-09-15T12:00:00.000000002+09:00",
  decision: "approve_change_preparation",
  supersedesAdoptionDecisionId: first.adoptionDecisionId,
});
assert.equal(
  validateOutcomeLearningAdoptionDecisionRecords([first, second], schema, context)
    .some((candidate) => candidate.code === "adoption_decision_time_not_monotonic"),
  false,
);

console.log("outcome-learning-adoption-fractional-ordering.test.ts passed");
