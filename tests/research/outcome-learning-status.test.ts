import assert from "node:assert/strict";
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
  withOutcomeLearningAdoptionDecisionHash,
  type OutcomeLearningAdoptionDecisionRecord,
} from "../../src/research/outcome-learning-adoption-decision.js";
import {
  withOutcomeLearningChangePreparationHash,
  type OutcomeLearningChangePreparationRecord,
} from "../../src/research/outcome-learning-change-preparation.js";
import {
  deriveOutcomeLearningStatuses,
  summarizeOutcomeLearningStatuses,
  type OutcomeLearningStatusContext,
} from "../../src/research/outcome-learning-status.js";

function proposal(input: {
  id: string;
  stage?: "draft_proposal" | "human_review_ready" | "rejected";
  supersedesProposalId?: string;
}): OutcomeLearningProposalRecord {
  return withOutcomeLearningProposalHash({
    schemaVersion: 1,
    proposalId: input.id,
    createdAt: "2026-08-21T13:00:00+09:00",
    semanticReviewId: `semantic:${input.id}`,
    semanticReviewContentHash: "a".repeat(64),
    proposalStage: input.stage ?? "human_review_ready",
    targetKind: "evidence_requirement",
    targetRef: `edge:${input.id}:confirmation`,
    problemStatement: "不足原因を分離できない",
    proposedChange: `proposal-change:${input.id}`,
    rationale: "synthetic learning status fixture",
    expectedEffect: "不足原因を再現可能に分離する",
    evaluationPlan: {
      method: "独立holdoutでshadow比較する",
      successCriteria: ["識別力が改善する"],
      failureCriteria: ["Evidenceコストだけ増える"],
      minimumEvidence: ["複数の独立案件"],
    },
    falsificationConditions: ["独立holdoutで改善しない"],
    rollbackPlan: "既存ruleを維持する",
    evidenceRefs: [`evidence:${input.id}`],
    ...(input.supersedesProposalId ? { supersedesProposalId: input.supersedesProposalId } : {}),
    humanApprovalRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function decision(input: {
  id: string;
  source: OutcomeLearningProposalRecord;
  kind: "defer" | "advance_to_shadow" | "reject";
  supersedesDecisionId?: string;
}): OutcomeLearningDecisionRecord {
  return withOutcomeLearningDecisionHash({
    schemaVersion: 1,
    decisionId: input.id,
    decidedAt: "2026-08-22T10:00:00+09:00",
    proposalId: input.source.proposalId,
    proposalContentHash: input.source.contentHash,
    reviewerRef: "reviewer:human",
    decision: input.kind,
    decisionRationale: "synthetic status fixture",
    conditions: input.kind === "defer" ? ["追加確認"] : [],
    evidenceRefs: [...input.source.evidenceRefs],
    ...(input.supersedesDecisionId ? { supersedesDecisionId: input.supersedesDecisionId } : {}),
    proposalReviewed: true,
    evaluationPlanAcknowledged: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    shadowEvaluationAuthorized: input.kind === "advance_to_shadow",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function shadow(input: {
  id: string;
  source: OutcomeLearningDecisionRecord;
  proposal: OutcomeLearningProposalRecord;
  stage: "interim" | "final";
  verdict?: "supports_change" | "rejects_change" | "inconclusive";
  supersedesEvaluationId?: string;
}): OutcomeLearningShadowEvaluationRecord {
  const verdict = input.verdict ?? (input.stage === "final" ? "supports_change" : "inconclusive");
  return withOutcomeLearningShadowEvaluationHash({
    schemaVersion: 1,
    evaluationId: input.id,
    evaluatedAt: "2026-09-15T12:00:00+09:00",
    evidenceCutoff: "2026-09-15T11:00:00+09:00",
    decisionId: input.source.decisionId,
    decisionContentHash: input.source.contentHash,
    proposalId: input.proposal.proposalId,
    proposalContentHash: input.proposal.contentHash,
    evaluationStage: input.stage,
    evaluationMethod: input.proposal.evaluationPlan.method,
    successCriteriaAssessments: [{ criterion: input.proposal.evaluationPlan.successCriteria[0]!, assessment: verdict === "supports_change" ? "met" : "inconclusive", evidenceRefs: [`shadow:${input.id}:success`] }],
    failureCriteriaAssessments: [{ criterion: input.proposal.evaluationPlan.failureCriteria[0]!, assessment: verdict === "rejects_change" ? "met" : verdict === "supports_change" ? "not_met" : "inconclusive", evidenceRefs: [`shadow:${input.id}:failure`] }],
    minimumEvidenceAssessments: [{ criterion: input.proposal.evaluationPlan.minimumEvidence[0]!, assessment: verdict === "supports_change" ? "met" : "inconclusive", evidenceRefs: [`shadow:${input.id}:minimum`] }],
    falsificationAssessments: [{ criterion: input.proposal.falsificationConditions[0]!, assessment: verdict === "supports_change" ? "not_met" : "inconclusive", evidenceRefs: [`shadow:${input.id}:falsification`] }],
    evidenceRefs: [`shadow:${input.id}:success`, `shadow:${input.id}:failure`, `shadow:${input.id}:minimum`, `shadow:${input.id}:falsification`],
    verdict,
    ...(input.supersedesEvaluationId ? { supersedesEvaluationId: input.supersedesEvaluationId } : {}),
    humanReviewRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function adoption(input: {
  id: string;
  source: OutcomeLearningShadowEvaluationRecord;
  proposal: OutcomeLearningProposalRecord;
  kind: "defer" | "approve_change_preparation" | "reject";
  supersedesAdoptionDecisionId?: string;
}): OutcomeLearningAdoptionDecisionRecord {
  return withOutcomeLearningAdoptionDecisionHash({
    schemaVersion: 1,
    adoptionDecisionId: input.id,
    decidedAt: "2026-09-16T10:00:00+09:00",
    shadowEvaluationId: input.source.evaluationId,
    shadowEvaluationContentHash: input.source.contentHash,
    proposalId: input.proposal.proposalId,
    proposalContentHash: input.proposal.contentHash,
    reviewerRef: "reviewer:human",
    decision: input.kind,
    decisionRationale: "synthetic status fixture",
    conditions: input.kind === "defer" ? ["追加holdout"] : ["別PRで再レビュー"],
    evidenceRefs: [input.source.evidenceRefs[0]!],
    ...(input.supersedesAdoptionDecisionId ? { supersedesAdoptionDecisionId: input.supersedesAdoptionDecisionId } : {}),
    shadowEvaluationReviewed: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    governedChangePreparationAuthorized: input.kind === "approve_change_preparation",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function preparation(input: {
  id: string;
  source: OutcomeLearningAdoptionDecisionRecord;
  proposal: OutcomeLearningProposalRecord;
  stage: "draft" | "ready_for_pr";
  supersedesManifestId?: string;
}): OutcomeLearningChangePreparationRecord {
  return withOutcomeLearningChangePreparationHash({
    schemaVersion: 1,
    manifestId: input.id,
    createdAt: "2026-09-16T11:00:00+09:00",
    preparedByRef: "agent:chatgpt",
    preparedByKind: "ai",
    adoptionDecisionId: input.source.adoptionDecisionId,
    adoptionDecisionContentHash: input.source.contentHash,
    proposalId: input.proposal.proposalId,
    proposalContentHash: input.proposal.contentHash,
    preparationStage: input.stage,
    targetKind: input.proposal.targetKind,
    targetRef: input.proposal.targetRef,
    proposedChange: input.proposal.proposedChange,
    rollbackPlan: input.proposal.rollbackPlan,
    adoptionConditions: [...input.source.conditions],
    plannedArtifacts: [
      { kind: "code", path: `src/research/${input.id}.ts`, purpose: "synthetic code" },
      { kind: "test", path: `tests/research/${input.id}.test.ts`, purpose: "synthetic test" },
    ],
    validationRequirements: ["central validation green"],
    explicitNonGoals: ["Production適用しない"],
    ...(input.supersedesManifestId ? { supersedesManifestId: input.supersedesManifestId } : {}),
    implementationMode: "manual_pr_only",
    humanReviewRequired: true,
    pullRequestPreparationAuthorized: true,
    automaticApplyAuthorized: false,
    workflowMutationAuthorized: false,
    secretMutationAuthorized: false,
    billingMutationAuthorized: false,
    productionMutationAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

function context(input: {
  proposals: OutcomeLearningProposalRecord[];
  decisions?: OutcomeLearningDecisionRecord[];
  shadows?: OutcomeLearningShadowEvaluationRecord[];
  adoptions?: OutcomeLearningAdoptionDecisionRecord[];
  preparations?: OutcomeLearningChangePreparationRecord[];
  omitWitness?: { kind: "proposal" | "decision" | "shadow" | "adoption" | "preparation"; hash: string };
}): OutcomeLearningStatusContext {
  const decisions = input.decisions ?? [];
  const shadows = input.shadows ?? [];
  const adoptions = input.adoptions ?? [];
  const preparations = input.preparations ?? [];
  const witness = <T extends { contentHash: string }>(records: T[], kind: NonNullable<typeof input.omitWitness>["kind"]) =>
    new Set(records.map((record) => record.contentHash).filter((hash) => !(input.omitWitness?.kind === kind && input.omitWitness.hash === hash)));
  return {
    proposals: input.proposals,
    validatedProposalHashes: witness(input.proposals, "proposal"),
    decisions,
    validatedDecisionHashes: witness(decisions, "decision"),
    shadowEvaluations: shadows,
    validatedShadowEvaluationHashes: witness(shadows, "shadow"),
    adoptionDecisions: adoptions,
    validatedAdoptionDecisionHashes: witness(adoptions, "adoption"),
    changePreparations: preparations,
    validatedChangePreparationHashes: witness(preparations, "preparation"),
  };
}

function only(input: OutcomeLearningStatusContext) {
  const statuses = deriveOutcomeLearningStatuses(input);
  assert.equal(statuses.length, 1);
  return statuses[0]!;
}

{
  const p = proposal({ id: "p-ai", stage: "draft_proposal" });
  const status = only(context({ proposals: [p] }));
  assert.equal(status.nextAction, "review_provisional_ai_proposal");
  assert.equal(status.requiresHumanAction, true);
  console.log("outcome-learning-status: provisional AI proposal surfaces human review action OK");
}

{
  const p = proposal({ id: "p-ai-reject", stage: "draft_proposal" });
  const d = decision({ id: "d-ai-reject", source: p, kind: "reject" });
  const status = only(context({ proposals: [p], decisions: [d] }));
  assert.equal(status.terminal, true);
  assert.equal(status.terminalReason, "learning_rejected");
  console.log("outcome-learning-status: human-rejected AI draft closes terminally OK");
}

{
  const p = proposal({ id: "p-ready" });
  assert.equal(only(context({ proposals: [p] })).nextAction, "make_learning_decision");
  const deferred = decision({ id: "d-defer", source: p, kind: "defer" });
  assert.equal(only(context({ proposals: [p], decisions: [deferred] })).nextAction, "revisit_learning_decision");
  console.log("outcome-learning-status: human-ready and deferred decision actions derive correctly OK");
}

{
  const p = proposal({ id: "p-shadow" });
  const d = decision({ id: "d-shadow", source: p, kind: "advance_to_shadow" });
  assert.equal(only(context({ proposals: [p], decisions: [d] })).nextAction, "run_shadow_evaluation");
  const interim = shadow({ id: "s-interim", source: d, proposal: p, stage: "interim" });
  assert.equal(only(context({ proposals: [p], decisions: [d], shadows: [interim] })).nextAction, "continue_shadow_evaluation");
  const final = shadow({ id: "s-final", source: d, proposal: p, stage: "final", supersedesEvaluationId: interim.evaluationId });
  assert.equal(only(context({ proposals: [p], decisions: [d], shadows: [interim, final] })).nextAction, "make_adoption_decision");
  console.log("outcome-learning-status: shadow not-started/interim/final actions derive correctly OK");
}

{
  const p = proposal({ id: "p-adoption" });
  const d = decision({ id: "d-adoption", source: p, kind: "advance_to_shadow" });
  const s = shadow({ id: "s-adoption", source: d, proposal: p, stage: "final" });
  const deferred = adoption({ id: "a-defer", source: s, proposal: p, kind: "defer" });
  assert.equal(only(context({ proposals: [p], decisions: [d], shadows: [s], adoptions: [deferred] })).nextAction, "revisit_adoption_decision");
  const rejected = adoption({ id: "a-reject", source: s, proposal: p, kind: "reject" });
  const rejectedStatus = only(context({ proposals: [p], decisions: [d], shadows: [s], adoptions: [rejected] }));
  assert.equal(rejectedStatus.terminalReason, "adoption_rejected");
  console.log("outcome-learning-status: deferred/rejected adoption states derive correctly OK");
}

{
  const p = proposal({ id: "p-prep" });
  const d = decision({ id: "d-prep", source: p, kind: "advance_to_shadow" });
  const s = shadow({ id: "s-prep", source: d, proposal: p, stage: "final" });
  const a = adoption({ id: "a-prep", source: s, proposal: p, kind: "approve_change_preparation" });
  assert.equal(only(context({ proposals: [p], decisions: [d], shadows: [s], adoptions: [a] })).nextAction, "create_change_preparation_draft");
  const draft = preparation({ id: "prep-draft", source: a, proposal: p, stage: "draft" });
  assert.equal(only(context({ proposals: [p], decisions: [d], shadows: [s], adoptions: [a], preparations: [draft] })).nextAction, "finalize_change_preparation");
  const ready = preparation({ id: "prep-ready", source: a, proposal: p, stage: "ready_for_pr", supersedesManifestId: draft.manifestId });
  const readyStatus = only(context({ proposals: [p], decisions: [d], shadows: [s], adoptions: [a], preparations: [draft, ready] }));
  assert.equal(readyStatus.nextAction, "prepare_pull_request_for_human_review");
  assert.equal(readyStatus.requiresHumanAction, false);
  console.log("outcome-learning-status: adoption through ready-for-PR actions derive correctly OK");
}

{
  const p1 = proposal({ id: "p-stale-1" });
  const p2Base = proposal({ id: "p-stale-2", supersedesProposalId: p1.proposalId });
  const p2 = withOutcomeLearningProposalHash({
    ...p2Base,
    semanticReviewId: p1.semanticReviewId,
    semanticReviewContentHash: p1.semanticReviewContentHash,
    targetKind: p1.targetKind,
    targetRef: p1.targetRef,
    proposedChange: p1.proposedChange,
    rollbackPlan: p1.rollbackPlan,
  });
  const oldDecision = decision({ id: "d-stale-old", source: p1, kind: "reject" });
  const status = only(context({ proposals: [p1, p2], decisions: [oldDecision] }));
  assert.equal(status.currentProposalId, p2.proposalId);
  assert.equal(status.nextAction, "make_learning_decision");
  assert.deepEqual(status.staleDownstreamRecordIds, [oldDecision.decisionId]);
  console.log("outcome-learning-status: downstream decisions on superseded proposal are surfaced as stale OK");
}

{
  const p = proposal({ id: "p-witness" });
  assert.throws(
    () => deriveOutcomeLearningStatuses(context({ proposals: [p], omitWitness: { kind: "proposal", hash: p.contentHash } })),
    /validated hash witness missing/,
  );
  console.log("outcome-learning-status: unwitnessed records are rejected before status derivation OK");
}

{
  const p = proposal({ id: "p-fork" });
  const d1 = decision({ id: "d-fork-root", source: p, kind: "defer" });
  const d2 = decision({ id: "d-fork-a", source: p, kind: "reject", supersedesDecisionId: d1.decisionId });
  const d3 = decision({ id: "d-fork-b", source: p, kind: "reject", supersedesDecisionId: d1.decisionId });
  assert.throws(
    () => deriveOutcomeLearningStatuses(context({ proposals: [p], decisions: [d1, d2, d3] })),
    /revision fork/,
  );
  console.log("outcome-learning-status: forked histories are rejected before read-model output OK");
}

{
  const human = proposal({ id: "p-summary-human" });
  const ai = proposal({ id: "p-summary-ai", stage: "draft_proposal" });
  const rejectedProposalBase = proposal({ id: "p-summary-rejected", stage: "rejected" });
  const statuses = deriveOutcomeLearningStatuses(context({ proposals: [human, ai, rejectedProposalBase] }));
  const summary = summarizeOutcomeLearningStatuses(statuses);
  assert.equal(summary.total, 3);
  assert.equal(summary.requiresHumanAction, 2);
  assert.equal(summary.terminal, 1);
  assert.equal(summary.byNextAction.make_learning_decision, 1);
  assert.equal(summary.byNextAction.review_provisional_ai_proposal, 1);
  assert.equal(summary.byNextAction.none, 1);
  console.log("outcome-learning-status: deterministic summary counts current actions OK");
}

console.log("outcome-learning-status.test.ts passed");
