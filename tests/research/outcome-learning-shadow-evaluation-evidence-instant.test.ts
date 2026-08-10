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
  validateOutcomeLearningShadowEvaluationRecord,
  withOutcomeLearningShadowEvaluationHash,
  type OutcomeLearningShadowEvaluationContext,
} from "../../src/research/outcome-learning-shadow-evaluation.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-shadow-evaluation.schema.json", "utf-8"),
) as JsonSchema;

const proposal: OutcomeLearningProposalRecord = withOutcomeLearningProposalHash({
  schemaVersion: 1,
  proposalId: "learning-proposal:shadow-evidence-instant:001",
  createdAt: "2026-08-21T13:00:00+09:00",
  semanticReviewId: "semantic:shadow-evidence-instant:001",
  semanticReviewContentHash: "a".repeat(64),
  proposalStage: "human_review_ready",
  targetKind: "evidence_requirement",
  targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
  problemStatement: "synthetic fixture",
  proposedChange: "synthetic fixture",
  rationale: "synthetic fixture",
  expectedEffect: "synthetic fixture",
  evaluationPlan: {
    method: "synthetic independent shadow evaluation",
    successCriteria: ["success criterion"],
    failureCriteria: ["failure criterion"],
    minimumEvidence: ["minimum evidence criterion"],
  },
  falsificationConditions: ["falsification criterion"],
  rollbackPlan: "do not apply",
  evidenceRefs: ["evidence:proposal:shadow-instant"],
  humanApprovalRequired: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

const decision: OutcomeLearningDecisionRecord = withOutcomeLearningDecisionHash({
  schemaVersion: 1,
  decisionId: "learning-decision:shadow-evidence-instant:001",
  decidedAt: "2026-08-22T10:00:00+09:00",
  proposalId: proposal.proposalId,
  proposalContentHash: proposal.contentHash,
  reviewerRef: "reviewer:human",
  decision: "advance_to_shadow",
  decisionRationale: "synthetic fixture",
  conditions: [],
  evidenceRefs: ["evidence:proposal:shadow-instant"],
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

const shadowEvidenceRef = "evidence:shadow:instant";

const evaluation = withOutcomeLearningShadowEvaluationHash({
  schemaVersion: 1,
  evaluationId: "shadow-evaluation:evidence-instant:001",
  evaluatedAt: "2026-09-15T12:00:00+09:00",
  evidenceCutoff: "2026-09-15T11:00:00+09:00",
  decisionId: decision.decisionId,
  decisionContentHash: decision.contentHash,
  proposalId: proposal.proposalId,
  proposalContentHash: proposal.contentHash,
  evaluationStage: "final",
  evaluationMethod: proposal.evaluationPlan.method,
  successCriteriaAssessments: [{
    criterion: proposal.evaluationPlan.successCriteria[0]!,
    assessment: "met",
    evidenceRefs: [shadowEvidenceRef],
  }],
  failureCriteriaAssessments: [{
    criterion: proposal.evaluationPlan.failureCriteria[0]!,
    assessment: "not_met",
    evidenceRefs: [shadowEvidenceRef],
  }],
  minimumEvidenceAssessments: [{
    criterion: proposal.evaluationPlan.minimumEvidence[0]!,
    assessment: "met",
    evidenceRefs: [shadowEvidenceRef],
  }],
  falsificationAssessments: [{
    criterion: proposal.falsificationConditions[0]!,
    assessment: "not_met",
    evidenceRefs: [shadowEvidenceRef],
  }],
  evidenceRefs: [shadowEvidenceRef],
  verdict: "supports_change",
  humanReviewRequired: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

function context(observedAt: string): OutcomeLearningShadowEvaluationContext {
  return {
    decisionsById: new Map([[decision.decisionId, decision]]),
    validatedDecisionHashes: new Set([decision.contentHash]),
    proposalsById: new Map([[proposal.proposalId, proposal]]),
    validatedProposalHashes: new Set([proposal.contentHash]),
    evidenceByRef: new Map([[shadowEvidenceRef, { observedAt }]]),
    validatedEvidenceRefs: new Set([shadowEvidenceRef]),
  };
}

function codes(observedAt: string): string[] {
  return validateOutcomeLearningShadowEvaluationRecord(
    evaluation,
    schema,
    context(observedAt),
  ).map((candidate) => candidate.code);
}

assert.deepEqual(codes("2026-09-15T10:00:00+09:00"), []);
assert.ok(codes("2026-09-15T10:00:00").includes("invalid_shadow_evidence_observed_at"));
assert.ok(codes("2026-02-29T10:00:00+09:00").includes("invalid_shadow_evidence_observed_at"));
assert.ok(codes("2026-09-15T11:30:00+09:00").includes("post_cutoff_shadow_evidence"));
assert.ok(codes("2026-09-15T11:00:00.000000001+09:00").includes("post_cutoff_shadow_evidence"));

console.log("outcome-learning-shadow-evaluation-evidence-instant.test.ts passed");
