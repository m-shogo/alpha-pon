import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "../../src/research/outcome-learning-proposal.js";
import {
  withOutcomeLearningDecisionHash,
  type OutcomeLearningDecisionRecord,
} from "../../src/research/outcome-learning-decision.js";
import {
  appendOutcomeLearningShadowEvaluationRecords,
  parseOutcomeLearningShadowEvaluationJsonl,
  validateOutcomeLearningShadowEvaluationRecord,
  validateOutcomeLearningShadowEvaluationRecords,
  withOutcomeLearningShadowEvaluationHash,
  type OutcomeLearningShadowEvaluationContext,
  type OutcomeLearningShadowEvaluationRecord,
} from "../../src/research/outcome-learning-shadow-evaluation.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-shadow-evaluation.schema.json", "utf-8"),
) as JsonSchema;

const proposal: OutcomeLearningProposalRecord = withOutcomeLearningProposalHash({
  schemaVersion: 1,
  proposalId: "learning-proposal:shadow:001",
  createdAt: "2026-08-21T13:00:00+09:00",
  semanticReviewId: "semantic:shadow:001",
  semanticReviewContentHash: "a".repeat(64),
  proposalStage: "human_review_ready",
  targetKind: "evidence_requirement",
  targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
  problemStatement: "確認条件の不足原因を分離できない",
  proposedChange: "統制改善Evidenceを独立したconfirmation conditionとして検証する",
  rationale: "human-confirmed reviewでEvidence不足が独立論点として残ったため",
  expectedEffect: "不足原因を再現可能に分離する",
  evaluationPlan: {
    method: "独立holdoutで旧条件と新条件をshadow比較する",
    successCriteria: ["追加条件が不足原因を再現可能に分離する"],
    failureCriteria: ["識別力を改善せずEvidenceコストだけ増える"],
    minimumEvidence: ["異なるissuerを含む複数の独立案件"],
  },
  falsificationConditions: ["独立holdoutで追加条件が識別力を改善しない"],
  rollbackPlan: "Productionへ適用せず既存ruleを維持する",
  evidenceRefs: ["evidence:proposal:001"],
  humanApprovalRequired: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

function learningDecision(input: {
  decisionId?: string;
  kind?: "defer" | "advance_to_shadow" | "reject";
} = {}): OutcomeLearningDecisionRecord {
  const kind = input.kind ?? "advance_to_shadow";
  return withOutcomeLearningDecisionHash({
    schemaVersion: 1,
    decisionId: input.decisionId ?? "learning-decision:shadow:001",
    decidedAt: "2026-08-22T10:00:00+09:00",
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    reviewerRef: "reviewer:human",
    decision: kind,
    decisionRationale: "shadowでのみ検証する",
    conditions: [],
    evidenceRefs: ["evidence:proposal:001"],
    proposalReviewed: true,
    evaluationPlanAcknowledged: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    shadowEvaluationAuthorized: kind === "advance_to_shadow",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const advanceDecision = learningDecision();
const rejectDecision = learningDecision({ decisionId: "learning-decision:shadow:reject", kind: "reject" });

const evidenceObservedAt = new Map([
  ["evidence:shadow:success", "2026-09-10T10:00:00+09:00"],
  ["evidence:shadow:failure", "2026-09-10T10:05:00+09:00"],
  ["evidence:shadow:minimum", "2026-09-10T10:10:00+09:00"],
  ["evidence:shadow:falsification", "2026-09-10T10:15:00+09:00"],
  ["evidence:shadow:late", "2026-09-20T10:00:00+09:00"],
]);

function context(input: {
  decisions?: OutcomeLearningDecisionRecord[];
  validatedDecisions?: string[];
  validatedEvidence?: string[];
} = {}): OutcomeLearningShadowEvaluationContext {
  const decisions = input.decisions ?? [advanceDecision, rejectDecision];
  const evidenceRefs = [...evidenceObservedAt.keys()];
  return {
    decisionsById: new Map(decisions.map((record) => [record.decisionId, record])),
    validatedDecisionHashes: new Set(input.validatedDecisions ?? decisions.map((record) => record.contentHash)),
    proposalsById: new Map([[proposal.proposalId, proposal]]),
    validatedProposalHashes: new Set([proposal.contentHash]),
    evidenceByRef: new Map(
      [...evidenceObservedAt].map(([ref, observedAt]) => [ref, { observedAt }]),
    ),
    validatedEvidenceRefs: new Set(input.validatedEvidence ?? evidenceRefs),
  };
}

function assessment(
  criterion: string,
  assessmentValue: "met" | "not_met" | "inconclusive",
  evidenceRef: string,
) {
  return { criterion, assessment: assessmentValue, evidenceRefs: [evidenceRef] };
}

function evaluation(input: {
  evaluationId?: string;
  decision?: OutcomeLearningDecisionRecord;
  stage?: "interim" | "final";
  verdict?: "supports_change" | "rejects_change" | "inconclusive";
  evaluatedAt?: string;
  evidenceCutoff?: string;
  supersedesEvaluationId?: string;
} = {}): Omit<OutcomeLearningShadowEvaluationRecord, "contentHash"> {
  const decision = input.decision ?? advanceDecision;
  const stage = input.stage ?? "final";
  return {
    schemaVersion: 1,
    evaluationId: input.evaluationId ?? "shadow-evaluation:001",
    evaluatedAt: input.evaluatedAt ?? "2026-09-15T12:00:00+09:00",
    evidenceCutoff: input.evidenceCutoff ?? "2026-09-15T11:00:00+09:00",
    decisionId: decision.decisionId,
    decisionContentHash: decision.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    evaluationStage: stage,
    evaluationMethod: proposal.evaluationPlan.method,
    successCriteriaAssessments: [assessment(
      proposal.evaluationPlan.successCriteria[0]!,
      stage === "final" ? "met" : "inconclusive",
      "evidence:shadow:success",
    )],
    failureCriteriaAssessments: [assessment(
      proposal.evaluationPlan.failureCriteria[0]!,
      stage === "final" ? "not_met" : "inconclusive",
      "evidence:shadow:failure",
    )],
    minimumEvidenceAssessments: [assessment(
      proposal.evaluationPlan.minimumEvidence[0]!,
      stage === "final" ? "met" : "inconclusive",
      "evidence:shadow:minimum",
    )],
    falsificationAssessments: [assessment(
      proposal.falsificationConditions[0]!,
      stage === "final" ? "not_met" : "inconclusive",
      "evidence:shadow:falsification",
    )],
    evidenceRefs: [
      "evidence:shadow:success",
      "evidence:shadow:failure",
      "evidence:shadow:minimum",
      "evidence:shadow:falsification",
    ],
    verdict: input.verdict ?? (stage === "final" ? "supports_change" : "inconclusive"),
    ...(input.supersedesEvaluationId ? { supersedesEvaluationId: input.supersedesEvaluationId } : {}),
    humanReviewRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateOutcomeLearningShadowEvaluationRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withOutcomeLearningShadowEvaluationHash(evaluation());
  assert.deepEqual(validateOutcomeLearningShadowEvaluationRecord(record, schema, context()), []);
  assert.equal(record.verdict, "supports_change");
  assert.equal(record.automaticApplyAuthorized, false);
  console.log("outcome-learning-shadow-evaluation: final supporting shadow result remains non-applying OK");
}

{
  const record = withOutcomeLearningShadowEvaluationHash(evaluation({ decision: rejectDecision }));
  assert.ok(codes(validateOutcomeLearningShadowEvaluationRecord(record, schema, context())).includes("shadow_lineage_not_authorized"));
  console.log("outcome-learning-shadow-evaluation: reject/defer decision cannot start shadow evaluation OK");
}

{
  const record = withOutcomeLearningShadowEvaluationHash(evaluation());
  const issues = validateOutcomeLearningShadowEvaluationRecord(
    record,
    schema,
    context({ validatedDecisions: [rejectDecision.contentHash] }),
  );
  assert.ok(codes(issues).includes("learning_decision_not_validated"));
  console.log("outcome-learning-shadow-evaluation: unwitnessed advance decision is rejected OK");
}

{
  const input = evaluation();
  input.successCriteriaAssessments[0]!.criterion = "hindsight success criterion";
  const record = withOutcomeLearningShadowEvaluationHash(input);
  assert.ok(codes(validateOutcomeLearningShadowEvaluationRecord(record, schema, context())).includes("shadow_criterion_mismatch"));
  console.log("outcome-learning-shadow-evaluation: hindsight criterion mutation is rejected OK");
}

{
  const input = evaluation();
  input.evidenceRefs.push("evidence:proposal:001");
  input.successCriteriaAssessments[0]!.evidenceRefs.push("evidence:proposal:001");
  const record = withOutcomeLearningShadowEvaluationHash(input);
  assert.ok(codes(validateOutcomeLearningShadowEvaluationRecord(record, schema, context())).includes("shadow_reuses_proposal_evidence"));
  console.log("outcome-learning-shadow-evaluation: proposal Evidence cannot be recycled as shadow validation OK");
}

{
  const input = evaluation({ evidenceCutoff: "2026-09-15T11:00:00+09:00" });
  input.evidenceRefs.push("evidence:shadow:late");
  input.successCriteriaAssessments[0]!.evidenceRefs.push("evidence:shadow:late");
  const record = withOutcomeLearningShadowEvaluationHash(input);
  assert.ok(codes(validateOutcomeLearningShadowEvaluationRecord(record, schema, context())).includes("post_cutoff_shadow_evidence"));
  console.log("outcome-learning-shadow-evaluation: post-cutoff shadow Evidence is rejected OK");
}

{
  const input = evaluation({ verdict: "rejects_change" });
  const record = withOutcomeLearningShadowEvaluationHash(input);
  assert.ok(codes(validateOutcomeLearningShadowEvaluationRecord(record, schema, context())).includes("shadow_verdict_mismatch"));
  console.log("outcome-learning-shadow-evaluation: rehashed fabricated verdict is rejected OK");
}

{
  const input = evaluation({ stage: "interim", verdict: "supports_change" });
  const record = withOutcomeLearningShadowEvaluationHash(input);
  assert.ok(codes(validateOutcomeLearningShadowEvaluationRecord(record, schema, context())).includes("shadow_verdict_mismatch"));
  console.log("outcome-learning-shadow-evaluation: interim evaluation cannot claim support/reject verdict OK");
}

{
  const interim = withOutcomeLearningShadowEvaluationHash(evaluation({
    evaluationId: "shadow-evaluation:revision:001",
    stage: "interim",
    evaluatedAt: "2026-09-12T12:00:00+09:00",
    evidenceCutoff: "2026-09-12T11:00:00+09:00",
  }));
  const final = withOutcomeLearningShadowEvaluationHash(evaluation({
    evaluationId: "shadow-evaluation:revision:002",
    stage: "final",
    evaluatedAt: "2026-09-15T12:00:00+09:00",
    evidenceCutoff: "2026-09-15T11:00:00+09:00",
    supersedesEvaluationId: interim.evaluationId,
  }));
  assert.deepEqual(
    validateOutcomeLearningShadowEvaluationRecords([interim, final], schema, context()),
    [],
  );
  console.log("outcome-learning-shadow-evaluation: interim may progress linearly to final OK");

  const fork = withOutcomeLearningShadowEvaluationHash(evaluation({
    evaluationId: "shadow-evaluation:revision:fork",
    stage: "final",
    evaluatedAt: "2026-09-16T12:00:00+09:00",
    evidenceCutoff: "2026-09-16T11:00:00+09:00",
    supersedesEvaluationId: interim.evaluationId,
  }));
  const forkIssues = validateOutcomeLearningShadowEvaluationRecords([interim, final, fork], schema, context());
  assert.ok(forkIssues.some((candidate) => candidate.code === "shadow_evaluation_revision_fork"));
  console.log("outcome-learning-shadow-evaluation: shadow revision fork is rejected OK");

  const afterFinal = withOutcomeLearningShadowEvaluationHash(evaluation({
    evaluationId: "shadow-evaluation:after-final",
    stage: "final",
    evaluatedAt: "2026-09-17T12:00:00+09:00",
    evidenceCutoff: "2026-09-17T11:00:00+09:00",
    supersedesEvaluationId: final.evaluationId,
  }));
  const terminalIssues = validateOutcomeLearningShadowEvaluationRecords([interim, final, afterFinal], schema, context());
  assert.ok(terminalIssues.some((candidate) => candidate.code === "final_shadow_evaluation_revised"));
  console.log("outcome-learning-shadow-evaluation: final shadow evaluation is terminal OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-shadow-evaluation-"));
  const path = join(sandbox, "shadow.jsonl");
  appendOutcomeLearningShadowEvaluationRecords({ path, incoming: [interim], schema, context: context() });
  appendOutcomeLearningShadowEvaluationRecords({ path, incoming: [final], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseOutcomeLearningShadowEvaluationJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendOutcomeLearningShadowEvaluationRecords({ path, incoming: [fork], schema, context: context() }),
    /shadow_evaluation_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("outcome-learning-shadow-evaluation: rejected append leaves shadow history byte-for-byte unchanged OK");
}

console.log("outcome-learning-shadow-evaluation.test.ts passed");
