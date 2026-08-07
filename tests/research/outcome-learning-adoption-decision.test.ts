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
  withOutcomeLearningShadowEvaluationHash,
  type OutcomeLearningShadowEvaluationRecord,
} from "../../src/research/outcome-learning-shadow-evaluation.js";
import {
  appendOutcomeLearningAdoptionDecisionRecords,
  parseOutcomeLearningAdoptionDecisionJsonl,
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
  proposalId: "learning-proposal:adoption:001",
  createdAt: "2026-08-21T13:00:00+09:00",
  semanticReviewId: "semantic:adoption:001",
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

const advanceDecision: OutcomeLearningDecisionRecord = withOutcomeLearningDecisionHash({
  schemaVersion: 1,
  decisionId: "learning-decision:adoption:001",
  decidedAt: "2026-08-22T10:00:00+09:00",
  proposalId: proposal.proposalId,
  proposalContentHash: proposal.contentHash,
  reviewerRef: "reviewer:human",
  decision: "advance_to_shadow",
  decisionRationale: "shadow限定で検証する価値がある",
  conditions: ["Productionへ反映しない"],
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

function shadow(input: {
  id?: string;
  stage?: "interim" | "final";
  verdict?: "supports_change" | "rejects_change" | "inconclusive";
} = {}): OutcomeLearningShadowEvaluationRecord {
  const stage = input.stage ?? "final";
  const verdict = input.verdict ?? (stage === "final" ? "supports_change" : "inconclusive");
  return withOutcomeLearningShadowEvaluationHash({
    schemaVersion: 1,
    evaluationId: input.id ?? "shadow-evaluation:adoption:001",
    evaluatedAt: "2026-09-15T12:00:00+09:00",
    evidenceCutoff: "2026-09-15T11:00:00+09:00",
    decisionId: advanceDecision.decisionId,
    decisionContentHash: advanceDecision.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    evaluationStage: stage,
    evaluationMethod: proposal.evaluationPlan.method,
    successCriteriaAssessments: [{
      criterion: proposal.evaluationPlan.successCriteria[0]!,
      assessment: verdict === "supports_change" ? "met" : "inconclusive",
      evidenceRefs: ["evidence:shadow:success"],
    }],
    failureCriteriaAssessments: [{
      criterion: proposal.evaluationPlan.failureCriteria[0]!,
      assessment: verdict === "rejects_change" ? "met" : verdict === "supports_change" ? "not_met" : "inconclusive",
      evidenceRefs: ["evidence:shadow:failure"],
    }],
    minimumEvidenceAssessments: [{
      criterion: proposal.evaluationPlan.minimumEvidence[0]!,
      assessment: verdict === "supports_change" ? "met" : "inconclusive",
      evidenceRefs: ["evidence:shadow:minimum"],
    }],
    falsificationAssessments: [{
      criterion: proposal.falsificationConditions[0]!,
      assessment: verdict === "supports_change" ? "not_met" : "inconclusive",
      evidenceRefs: ["evidence:shadow:falsification"],
    }],
    evidenceRefs: [
      "evidence:shadow:success",
      "evidence:shadow:failure",
      "evidence:shadow:minimum",
      "evidence:shadow:falsification",
    ],
    verdict,
    humanReviewRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const supportingShadow = shadow();
const rejectingShadow = shadow({ id: "shadow-evaluation:adoption:rejecting", verdict: "rejects_change" });
const inconclusiveShadow = shadow({ id: "shadow-evaluation:adoption:inconclusive", verdict: "inconclusive" });
const interimShadow = shadow({ id: "shadow-evaluation:adoption:interim", stage: "interim", verdict: "inconclusive" });

function context(input: {
  shadows?: OutcomeLearningShadowEvaluationRecord[];
  validatedShadows?: string[];
} = {}): OutcomeLearningAdoptionDecisionContext {
  const shadows = input.shadows ?? [supportingShadow, rejectingShadow, inconclusiveShadow, interimShadow];
  return {
    shadowEvaluationsById: new Map(shadows.map((record) => [record.evaluationId, record])),
    validatedShadowEvaluationHashes: new Set(input.validatedShadows ?? shadows.map((record) => record.contentHash)),
    proposalsById: new Map([[proposal.proposalId, proposal]]),
    validatedProposalHashes: new Set([proposal.contentHash]),
    reviewersByRef: new Map([
      ["reviewer:human", { kind: "human" as const }],
      ["reviewer:ai", { kind: "ai" as const }],
    ]),
  };
}

function adoption(input: {
  id?: string;
  source?: OutcomeLearningShadowEvaluationRecord;
  reviewerRef?: string;
  decision?: "defer" | "approve_change_preparation" | "reject";
  decidedAt?: string;
  authorized?: boolean;
  supersedesAdoptionDecisionId?: string;
  conditions?: string[];
} = {}): Omit<OutcomeLearningAdoptionDecisionRecord, "contentHash"> {
  const source = input.source ?? supportingShadow;
  const decision = input.decision ?? "approve_change_preparation";
  return {
    schemaVersion: 1,
    adoptionDecisionId: input.id ?? "adoption-decision:001",
    decidedAt: input.decidedAt ?? "2026-09-16T10:00:00+09:00",
    shadowEvaluationId: source.evaluationId,
    shadowEvaluationContentHash: source.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    reviewerRef: input.reviewerRef ?? "reviewer:human",
    decision,
    decisionRationale: "独立Shadowで成功条件を満たしたため、実変更ではなくgoverned change artifactの準備へ進める",
    conditions: input.conditions ?? (decision === "defer" ? ["追加の独立holdoutを確認する"] : ["実適用前に別PRで再レビューする"]),
    evidenceRefs: ["evidence:shadow:success"],
    ...(input.supersedesAdoptionDecisionId ? { supersedesAdoptionDecisionId: input.supersedesAdoptionDecisionId } : {}),
    shadowEvaluationReviewed: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    governedChangePreparationAuthorized: input.authorized ?? decision === "approve_change_preparation",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateOutcomeLearningAdoptionDecisionRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption());
  assert.deepEqual(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context()), []);
  assert.equal(record.governedChangePreparationAuthorized, true);
  assert.equal(record.codeMutationAuthorized, false);
  console.log("outcome-learning-adoption-decision: supporting final shadow may authorize change preparation only OK");
}

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption({ reviewerRef: "reviewer:ai" }));
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("adoption_reviewer_not_human"));
  console.log("outcome-learning-adoption-decision: AI cannot create final adoption decision OK");
}

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption({ source: interimShadow, decision: "defer", authorized: false }));
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("shadow_evaluation_not_final"));
  console.log("outcome-learning-adoption-decision: interim shadow cannot enter final adoption decision OK");
}

for (const source of [rejectingShadow, inconclusiveShadow]) {
  const record = withOutcomeLearningAdoptionDecisionHash(adoption({ source }));
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("unsupported_change_preparation_approval"));
}
console.log("outcome-learning-adoption-decision: reject/inconclusive shadow cannot approve change preparation OK");

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption());
  const issues = validateOutcomeLearningAdoptionDecisionRecord(
    record,
    schema,
    context({ validatedShadows: [rejectingShadow.contentHash] }),
  );
  assert.ok(codes(issues).includes("shadow_evaluation_not_validated"));
  console.log("outcome-learning-adoption-decision: unwitnessed final shadow is rejected OK");
}

{
  const input = adoption();
  input.evidenceRefs = ["evidence:new-after-shadow"];
  const record = withOutcomeLearningAdoptionDecisionHash(input);
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("adoption_evidence_not_in_shadow"));
  console.log("outcome-learning-adoption-decision: adoption cannot inject new Evidence after final shadow OK");
}

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption({ authorized: false }));
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("change_preparation_authorization_missing"));
  console.log("outcome-learning-adoption-decision: approve requires explicit preparation authorization OK");
}

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption({ decision: "reject", authorized: true }));
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("change_preparation_authorization_scope_violation"));
  console.log("outcome-learning-adoption-decision: reject/defer cannot authorize change preparation OK");
}

{
  const record = withOutcomeLearningAdoptionDecisionHash(adoption({ decision: "defer", authorized: false, conditions: [] }));
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(record, schema, context())).includes("defer_conditions_required"));
  console.log("outcome-learning-adoption-decision: defer must state explicit reconsideration conditions OK");
}

{
  const mutated = { ...supportingShadow, verdict: "inconclusive" as const };
  const record = withOutcomeLearningAdoptionDecisionHash(adoption());
  assert.ok(codes(validateOutcomeLearningAdoptionDecisionRecord(
    record,
    schema,
    context({ shadows: [mutated, rejectingShadow, inconclusiveShadow, interimShadow] }),
  )).includes("shadow_evaluation_hash_mismatch"));
  console.log("outcome-learning-adoption-decision: tampered shadow with stale hash is rejected OK");
}

{
  const deferred = withOutcomeLearningAdoptionDecisionHash(adoption({
    id: "adoption-decision:revision:001",
    decision: "defer",
    authorized: false,
    decidedAt: "2026-09-16T10:00:00+09:00",
  }));
  const approved = withOutcomeLearningAdoptionDecisionHash(adoption({
    id: "adoption-decision:revision:002",
    decision: "approve_change_preparation",
    decidedAt: "2026-09-17T10:00:00+09:00",
    supersedesAdoptionDecisionId: deferred.adoptionDecisionId,
  }));
  assert.deepEqual(validateOutcomeLearningAdoptionDecisionRecords([deferred, approved], schema, context()), []);
  console.log("outcome-learning-adoption-decision: defer may progress linearly to terminal approval OK");

  const fork = withOutcomeLearningAdoptionDecisionHash(adoption({
    id: "adoption-decision:revision:fork",
    decision: "reject",
    authorized: false,
    decidedAt: "2026-09-17T11:00:00+09:00",
    supersedesAdoptionDecisionId: deferred.adoptionDecisionId,
  }));
  const forkIssues = validateOutcomeLearningAdoptionDecisionRecords([deferred, approved, fork], schema, context());
  assert.ok(forkIssues.some((candidate) => candidate.code === "adoption_decision_revision_fork"));
  console.log("outcome-learning-adoption-decision: adoption revision fork is rejected OK");

  const afterApproved = withOutcomeLearningAdoptionDecisionHash(adoption({
    id: "adoption-decision:after-approved",
    decision: "reject",
    authorized: false,
    decidedAt: "2026-09-18T10:00:00+09:00",
    supersedesAdoptionDecisionId: approved.adoptionDecisionId,
  }));
  const terminalIssues = validateOutcomeLearningAdoptionDecisionRecords([deferred, approved, afterApproved], schema, context());
  assert.ok(terminalIssues.some((candidate) => candidate.code === "terminal_adoption_decision_revised"));
  console.log("outcome-learning-adoption-decision: approve/reject are terminal OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-adoption-decision-"));
  const path = join(sandbox, "adoption.jsonl");
  appendOutcomeLearningAdoptionDecisionRecords({ path, incoming: [deferred], schema, context: context() });
  appendOutcomeLearningAdoptionDecisionRecords({ path, incoming: [approved], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseOutcomeLearningAdoptionDecisionJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendOutcomeLearningAdoptionDecisionRecords({ path, incoming: [fork], schema, context: context() }),
    /adoption_decision_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("outcome-learning-adoption-decision: rejected append leaves adoption history byte-for-byte unchanged OK");
}

console.log("outcome-learning-adoption-decision.test.ts passed");
