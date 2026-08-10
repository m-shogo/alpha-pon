import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  withOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "../../src/research/outcome-learning-proposal.js";
import {
  validateOutcomeLearningDecisionRecord,
  withOutcomeLearningDecisionHash,
  type OutcomeLearningDecisionContext,
  type OutcomeLearningDecisionRecord,
} from "../../src/research/outcome-learning-decision.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-decision.schema.json", "utf-8"),
) as JsonSchema;

function proposal(evidenceRef: string): OutcomeLearningProposalRecord {
  return withOutcomeLearningProposalHash({
    schemaVersion: 1,
    proposalId: `learning-proposal:decision-secret-ref:${evidenceRef.includes("userinfo") ? "userinfo" : "fragment"}`,
    createdAt: "2026-08-21T13:00:00+09:00",
    semanticReviewId: "semantic:decision-secret-ref:001",
    semanticReviewContentHash: "a".repeat(64),
    proposalStage: "human_review_ready",
    targetKind: "evidence_requirement",
    targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
    problemStatement: "synthetic secret-ref regression fixture",
    proposedChange: "keep the decision boundary fail-closed",
    rationale: "synthetic regression only",
    expectedEffect: "secret-bearing refs cannot enter decision provenance",
    evaluationPlan: {
      method: "synthetic validation",
      successCriteria: ["secret ref rejected"],
      failureCriteria: ["secret ref accepted"],
      minimumEvidence: ["synthetic fixture"],
    },
    falsificationConditions: ["validator accepts secret ref"],
    rollbackPlan: "no production mutation",
    evidenceRefs: [evidenceRef],
    humanApprovalRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function decision(source: OutcomeLearningProposalRecord, evidenceRef: string): OutcomeLearningDecisionRecord {
  return withOutcomeLearningDecisionHash({
    schemaVersion: 1,
    decisionId: `learning-decision:secret-ref:${evidenceRef.includes("userinfo") ? "userinfo" : "fragment"}`,
    decidedAt: "2026-08-21T14:00:00+09:00",
    proposalId: source.proposalId,
    proposalContentHash: source.contentHash,
    reviewerRef: "reviewer:human",
    decision: "advance_to_shadow",
    decisionRationale: "synthetic regression only",
    conditions: ["shadow only"],
    evidenceRefs: [evidenceRef],
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
}

function context(source: OutcomeLearningProposalRecord): OutcomeLearningDecisionContext {
  return {
    proposalsById: new Map([[source.proposalId, source]]),
    validatedProposalHashes: new Set([source.contentHash]),
    reviewersByRef: new Map([["reviewer:human", { kind: "human" as const }]]),
  };
}

for (const evidenceRef of [
  "evidence:review:001#token=synthetic",
  "https://userinfo:synthetic@example.test/evidence",
]) {
  const source = proposal(evidenceRef);
  const record = decision(source, evidenceRef);
  const issues = validateOutcomeLearningDecisionRecord(record, schema, context(source));
  assert.ok(
    issues.some((candidate) => candidate.code === "secret_like_decision_evidence_ref"),
    `secret-bearing evidence ref must fail closed: ${evidenceRef}`,
  );
}

console.log("outcome-learning-decision-secret-ref.test.ts passed");
