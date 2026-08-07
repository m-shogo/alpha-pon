import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "../../src/research/outcome-learning-proposal.js";
import {
  appendOutcomeLearningDecisionRecords,
  parseOutcomeLearningDecisionJsonl,
  validateOutcomeLearningDecisionRecord,
  validateOutcomeLearningDecisionRecords,
  withOutcomeLearningDecisionHash,
  type OutcomeLearningDecisionContext,
  type OutcomeLearningDecisionRecord,
} from "../../src/research/outcome-learning-decision.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-decision.schema.json", "utf-8"),
) as JsonSchema;

function proposal(input: {
  proposalId?: string;
  stage?: "draft_proposal" | "human_review_ready" | "rejected";
} = {}): OutcomeLearningProposalRecord {
  return withOutcomeLearningProposalHash({
    schemaVersion: 1,
    proposalId: input.proposalId ?? "learning-proposal:human-decision:001",
    createdAt: "2026-08-21T13:00:00+09:00",
    semanticReviewId: "semantic:human-decision:001",
    semanticReviewContentHash: "a".repeat(64),
    proposalStage: input.stage ?? "human_review_ready",
    targetKind: "evidence_requirement",
    targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
    problemStatement: "確認条件の不足原因を分離できない",
    proposedChange: "統制改善Evidenceを独立したconfirmation conditionとして検証する",
    rationale: "human-confirmed semantic reviewでEvidence不足が独立論点として残ったため",
    expectedEffect: "イベント通過と統制改善不足を別のblocking reasonとして評価できる",
    evaluationPlan: {
      method: "独立holdoutで旧条件と新条件をshadow比較する",
      successCriteria: ["追加条件が不足原因を再現可能に分離する"],
      failureCriteria: ["識別力を改善せずEvidenceコストだけ増える"],
      minimumEvidence: ["異なるissuerを含む複数の独立案件"],
    },
    falsificationConditions: ["独立holdoutで追加条件が識別力を改善しない"],
    rollbackPlan: "Productionへ適用せず既存ruleを維持する",
    evidenceRefs: ["evidence:review:001", "evidence:review:002"],
    humanApprovalRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const readyProposal = proposal();
const draftProposal = proposal({
  proposalId: "learning-proposal:human-decision:draft",
  stage: "draft_proposal",
});

function context(input: {
  proposals?: OutcomeLearningProposalRecord[];
  validated?: string[];
} = {}): OutcomeLearningDecisionContext {
  const proposals = input.proposals ?? [readyProposal, draftProposal];
  return {
    proposalsById: new Map(proposals.map((record) => [record.proposalId, record])),
    validatedProposalHashes: new Set(input.validated ?? proposals.map((record) => record.contentHash)),
    reviewersByRef: new Map([
      ["reviewer:human", { kind: "human" as const }],
      ["reviewer:ai", { kind: "ai" as const }],
    ]),
  };
}

function decision(input: {
  decisionId?: string;
  proposal?: OutcomeLearningProposalRecord;
  reviewerRef?: string;
  kind?: "defer" | "advance_to_shadow" | "reject";
  decidedAt?: string;
  supersedesDecisionId?: string;
  shadowEvaluationAuthorized?: boolean;
} = {}): Omit<OutcomeLearningDecisionRecord, "contentHash"> {
  const source = input.proposal ?? readyProposal;
  const kind = input.kind ?? "advance_to_shadow";
  return {
    schemaVersion: 1,
    decisionId: input.decisionId ?? "learning-decision:001",
    decidedAt: input.decidedAt ?? "2026-08-21T14:00:00+09:00",
    proposalId: source.proposalId,
    proposalContentHash: source.contentHash,
    reviewerRef: input.reviewerRef ?? "reviewer:human",
    decision: kind,
    decisionRationale: "評価計画とrollback条件が明示され、shadowでのみ検証する価値がある",
    conditions: kind === "advance_to_shadow" ? ["Production/Gateへ反映せずshadow限定"] : [],
    evidenceRefs: ["evidence:review:001"],
    ...(input.supersedesDecisionId ? { supersedesDecisionId: input.supersedesDecisionId } : {}),
    proposalReviewed: true,
    evaluationPlanAcknowledged: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    shadowEvaluationAuthorized: input.shadowEvaluationAuthorized ?? kind === "advance_to_shadow",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateOutcomeLearningDecisionRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withOutcomeLearningDecisionHash(decision());
  assert.deepEqual(validateOutcomeLearningDecisionRecord(record, schema, context()), []);
  assert.equal(record.shadowEvaluationAuthorized, true);
  assert.equal(record.automaticApplyAuthorized, false);
  console.log("outcome-learning-decision: validated human decision may authorize shadow evaluation only OK");
}

{
  const record = withOutcomeLearningDecisionHash(decision({ reviewerRef: "reviewer:ai" }));
  assert.ok(codes(validateOutcomeLearningDecisionRecord(record, schema, context())).includes("decision_reviewer_not_human"));
  console.log("outcome-learning-decision: AI cannot create human learning decision OK");
}

{
  const record = withOutcomeLearningDecisionHash(decision());
  const issues = validateOutcomeLearningDecisionRecord(
    record,
    schema,
    context({ validated: [draftProposal.contentHash] }),
  );
  assert.ok(codes(issues).includes("learning_proposal_not_validated"));
  console.log("outcome-learning-decision: unwitnessed proposal is rejected OK");
}

{
  const record = withOutcomeLearningDecisionHash(decision({ proposal: draftProposal }));
  assert.ok(codes(validateOutcomeLearningDecisionRecord(record, schema, context())).includes("proposal_not_human_review_ready"));
  console.log("outcome-learning-decision: draft proposal cannot receive human decision OK");
}

{
  const input = decision();
  input.evidenceRefs = ["evidence:not-in-proposal"];
  const record = withOutcomeLearningDecisionHash(input);
  assert.ok(codes(validateOutcomeLearningDecisionRecord(record, schema, context())).includes("decision_evidence_not_in_proposal"));
  console.log("outcome-learning-decision: decision Evidence must come from frozen proposal OK");
}

{
  const record = withOutcomeLearningDecisionHash(decision({ shadowEvaluationAuthorized: false }));
  assert.ok(codes(validateOutcomeLearningDecisionRecord(record, schema, context())).includes("shadow_authorization_missing"));
  console.log("outcome-learning-decision: advance decision requires explicit shadow authorization OK");
}

{
  const record = withOutcomeLearningDecisionHash(decision({
    kind: "defer",
    shadowEvaluationAuthorized: true,
  }));
  assert.ok(codes(validateOutcomeLearningDecisionRecord(record, schema, context())).includes("shadow_authorization_scope_violation"));
  console.log("outcome-learning-decision: defer/reject cannot authorize shadow evaluation OK");
}

{
  const mutated = { ...readyProposal, rationale: "tampered rationale" } as OutcomeLearningProposalRecord;
  const record = withOutcomeLearningDecisionHash(decision());
  const mutatedContext = context({ proposals: [mutated, draftProposal] });
  assert.ok(codes(validateOutcomeLearningDecisionRecord(record, schema, mutatedContext)).includes("learning_proposal_hash_mismatch"));
  console.log("outcome-learning-decision: mutated proposal with stale hash is rejected OK");
}

{
  const deferred = withOutcomeLearningDecisionHash(decision({
    decisionId: "learning-decision:revision:001",
    kind: "defer",
    decidedAt: "2026-08-21T14:00:00+09:00",
  }));
  const advanced = withOutcomeLearningDecisionHash(decision({
    decisionId: "learning-decision:revision:002",
    kind: "advance_to_shadow",
    decidedAt: "2026-08-22T10:00:00+09:00",
    supersedesDecisionId: deferred.decisionId,
  }));
  assert.deepEqual(
    validateOutcomeLearningDecisionRecords([deferred, advanced], schema, context()),
    [],
  );
  console.log("outcome-learning-decision: defer may be revised once into terminal advance decision OK");

  const fork = withOutcomeLearningDecisionHash(decision({
    decisionId: "learning-decision:revision:fork",
    kind: "reject",
    decidedAt: "2026-08-22T11:00:00+09:00",
    supersedesDecisionId: deferred.decisionId,
  }));
  const forkIssues = validateOutcomeLearningDecisionRecords([deferred, advanced, fork], schema, context());
  assert.ok(forkIssues.some((candidate) => candidate.code === "learning_decision_revision_fork"));
  console.log("outcome-learning-decision: decision revision fork is rejected OK");

  const afterAdvance = withOutcomeLearningDecisionHash(decision({
    decisionId: "learning-decision:after-advance",
    kind: "reject",
    decidedAt: "2026-08-23T10:00:00+09:00",
    supersedesDecisionId: advanced.decisionId,
  }));
  const terminalIssues = validateOutcomeLearningDecisionRecords([deferred, advanced, afterAdvance], schema, context());
  assert.ok(terminalIssues.some((candidate) => candidate.code === "terminal_learning_decision_revised"));
  console.log("outcome-learning-decision: advance/reject decisions are terminal OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-learning-decision-"));
  const path = join(sandbox, "decisions.jsonl");
  appendOutcomeLearningDecisionRecords({ path, incoming: [deferred], schema, context: context() });
  appendOutcomeLearningDecisionRecords({ path, incoming: [advanced], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseOutcomeLearningDecisionJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendOutcomeLearningDecisionRecords({ path, incoming: [fork], schema, context: context() }),
    /learning_decision_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("outcome-learning-decision: rejected append leaves decision history byte-for-byte unchanged OK");
}

console.log("outcome-learning-decision.test.ts passed");
