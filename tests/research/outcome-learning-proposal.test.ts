import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewRecord,
} from "../../src/research/outcome-semantic-review.js";
import {
  appendOutcomeLearningProposalRecords,
  parseOutcomeLearningProposalJsonl,
  validateOutcomeLearningProposalRecord,
  validateOutcomeLearningProposalRecords,
  withOutcomeLearningProposalHash,
  type OutcomeLearningProposalContext,
  type OutcomeLearningProposalRecord,
} from "../../src/research/outcome-learning-proposal.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-proposal.schema.json", "utf-8"),
) as JsonSchema;

const PROPOSED_CHANGE = "統制改善EvidenceをconfirmationConditionsへ独立追加する";

function semanticReview(input: {
  reviewId: string;
  authority: "provisional_ai" | "human_confirmed";
  reviewedAt: string;
}): OutcomeSemanticReviewRecord {
  return withOutcomeSemanticReviewHash({
    schemaVersion: 1,
    reviewId: input.reviewId,
    recommendationId: "rec:learning-proposal:001",
    recommendationContentHash: "a".repeat(64),
    quantitativeOutcomeId: "outcome:learning-proposal:001",
    quantitativeOutcomeContentHash: "b".repeat(64),
    reviewedAt: input.reviewedAt,
    evidenceCutoff: input.reviewedAt,
    reviewAuthority: input.authority,
    reviewerRef: input.authority === "human_confirmed" ? "reviewer:human" : "reviewer:ai",
    learningUse: input.authority === "human_confirmed" ? "human_confirmed" : "proposal_only",
    invalidationAssessment: "inconclusive",
    triggeredInvalidationRules: [],
    invalidationEvidenceRefs: [],
    verdict: "partly_correct",
    assumptionAssessments: [
      {
        assumption: "改善策が予定どおり進む",
        assessment: "inconclusive",
        evidenceRefs: ["evidence:review:001"],
      },
    ],
    missingEvidence: ["統制改善の長期実績"],
    unexpectedConfounders: [],
    lessons: ["イベント通過と統制改善を別々に評価する"],
    proposedRuleChanges: [PROPOSED_CHANGE],
    sourceEvidence: [
      { tier: "A", ref: "evidence:review:001" },
      { tier: "B", ref: "evidence:review:002" },
    ],
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const aiReview = semanticReview({
  reviewId: "semantic:learning:ai",
  authority: "provisional_ai",
  reviewedAt: "2026-08-20T12:00:00+09:00",
});
const humanReview = semanticReview({
  reviewId: "semantic:learning:human",
  authority: "human_confirmed",
  reviewedAt: "2026-08-21T12:00:00+09:00",
});

function context(input: {
  reviews?: OutcomeSemanticReviewRecord[];
  validated?: string[];
} = {}): OutcomeLearningProposalContext {
  const reviews = input.reviews ?? [aiReview, humanReview];
  return {
    semanticReviewsById: new Map(reviews.map((record) => [record.reviewId, record])),
    validatedSemanticReviewHashes: new Set(input.validated ?? reviews.map((record) => record.contentHash)),
  };
}

function baseProposal(input: {
  semanticReview?: OutcomeSemanticReviewRecord;
  proposalId?: string;
  stage?: "draft_proposal" | "human_review_ready" | "rejected";
  createdAt?: string;
  supersedesProposalId?: string;
} = {}): Omit<OutcomeLearningProposalRecord, "contentHash"> {
  const review = input.semanticReview ?? aiReview;
  return {
    schemaVersion: 1,
    proposalId: input.proposalId ?? "learning-proposal:001",
    createdAt: input.createdAt ?? "2026-08-20T13:00:00+09:00",
    semanticReviewId: review.reviewId,
    semanticReviewContentHash: review.contentHash,
    proposalStage: input.stage ?? "draft_proposal",
    targetKind: "evidence_requirement",
    targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
    problemStatement: "イベント通過と統制改善確認が同一条件に混ざり、失敗理由を分離しにくい",
    proposedChange: PROPOSED_CHANGE,
    rationale: "Semantic Reviewで統制改善Evidence不足が独立した学習点として残ったため",
    expectedEffect: "確認条件の不足原因を分解し、同じ失敗の再発を検証可能にする",
    evaluationPlan: {
      method: "次の独立holdout案件で旧条件と新条件を並行shadow比較する",
      successCriteria: ["統制改善不足をイベント通過とは別のblocking reasonとして再現できる"],
      failureCriteria: ["追加条件が判定を変えずEvidenceコストだけ増やす"],
      minimumEvidence: ["異なるissuerを含む複数の独立案件"],
    },
    falsificationConditions: ["独立holdoutで追加条件が識別力を改善しない"],
    rollbackPlan: "新条件をProductionへ適用せずproposalをrejectedにし、既存ruleを維持する",
    evidenceRefs: ["evidence:review:001"],
    ...(input.supersedesProposalId ? { supersedesProposalId: input.supersedesProposalId } : {}),
    humanApprovalRequired: true,
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateOutcomeLearningProposalRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withOutcomeLearningProposalHash(baseProposal());
  assert.deepEqual(validateOutcomeLearningProposalRecord(record, schema, context()), []);
  console.log("outcome-learning-proposal: validated AI semantic review may create draft proposal only OK");
}

{
  const input = baseProposal({ stage: "human_review_ready" });
  const issues = validateOutcomeLearningProposalRecord(
    withOutcomeLearningProposalHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("provisional_review_stage_violation"));
  console.log("outcome-learning-proposal: provisional AI review cannot produce human-review-ready proposal OK");
}

{
  const input = baseProposal();
  const issues = validateOutcomeLearningProposalRecord(
    withOutcomeLearningProposalHash(input),
    schema,
    context({ validated: [humanReview.contentHash] }),
  );
  assert.ok(codes(issues).includes("semantic_review_not_validated"));
  console.log("outcome-learning-proposal: hash-correct but unwitnessed semantic review is rejected OK");
}

{
  const input = baseProposal();
  input.proposedChange = "後から追加した都合のよいrule change";
  const issues = validateOutcomeLearningProposalRecord(
    withOutcomeLearningProposalHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("proposal_change_not_in_semantic_review"));
  console.log("outcome-learning-proposal: hindsight rule-change injection is rejected OK");
}

{
  const input = baseProposal();
  input.evidenceRefs = ["evidence:not-in-review"];
  const issues = validateOutcomeLearningProposalRecord(
    withOutcomeLearningProposalHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("proposal_evidence_not_in_semantic_review"));
  console.log("outcome-learning-proposal: proposal Evidence must come from source Semantic Review OK");
}

{
  const input = baseProposal();
  input.targetRef = "https://example.invalid/rule?token=secret";
  const issues = validateOutcomeLearningProposalRecord(
    withOutcomeLearningProposalHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("secret_like_target_ref"));
  console.log("outcome-learning-proposal: secret-like target refs are rejected OK");
}

{
  const ready = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:human-ready",
    stage: "human_review_ready",
    createdAt: "2026-08-21T13:00:00+09:00",
  }));
  assert.deepEqual(validateOutcomeLearningProposalRecord(ready, schema, context()), []);
  console.log("outcome-learning-proposal: human-confirmed semantic review may create review-ready proposal OK");
}

{
  const rootRejected = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:root-rejected",
    stage: "rejected",
    createdAt: "2026-08-21T13:00:00+09:00",
  }));
  const issues = validateOutcomeLearningProposalRecord(rootRejected, schema, context());
  assert.ok(codes(issues).includes("root_proposal_rejected"));
  console.log("outcome-learning-proposal: root proposal cannot start rejected OK");
}

{
  const draft = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:revision:001",
    stage: "draft_proposal",
    createdAt: "2026-08-21T13:00:00+09:00",
  }));
  const ready = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:revision:002",
    stage: "human_review_ready",
    createdAt: "2026-08-21T14:00:00+09:00",
    supersedesProposalId: draft.proposalId,
  }));
  assert.deepEqual(
    validateOutcomeLearningProposalRecords([draft, ready], schema, context()),
    [],
  );

  const rejected = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:revision:003",
    stage: "rejected",
    createdAt: "2026-08-21T15:00:00+09:00",
    supersedesProposalId: ready.proposalId,
  }));
  assert.deepEqual(
    validateOutcomeLearningProposalRecords([draft, ready, rejected], schema, context()),
    [],
  );
  console.log("outcome-learning-proposal: human-confirmed proposal may progress draft -> review-ready -> rejected OK");

  const regression = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:revision:regression",
    stage: "draft_proposal",
    createdAt: "2026-08-21T15:00:00+09:00",
    supersedesProposalId: ready.proposalId,
  }));
  const regressionIssues = validateOutcomeLearningProposalRecords(
    [draft, ready, regression],
    schema,
    context(),
  );
  assert.ok(regressionIssues.some((candidate) => candidate.code === "learning_proposal_stage_regressed"));
  console.log("outcome-learning-proposal: proposal stage regression is rejected OK");

  const fork = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:revision:fork",
    stage: "human_review_ready",
    createdAt: "2026-08-21T14:30:00+09:00",
    supersedesProposalId: draft.proposalId,
  }));
  const forkIssues = validateOutcomeLearningProposalRecords(
    [draft, ready, fork],
    schema,
    context(),
  );
  assert.ok(forkIssues.some((candidate) => candidate.code === "learning_proposal_revision_fork"));
  console.log("outcome-learning-proposal: proposal revision fork is rejected OK");

  const afterRejected = withOutcomeLearningProposalHash(baseProposal({
    semanticReview: humanReview,
    proposalId: "learning-proposal:after-rejected",
    stage: "rejected",
    createdAt: "2026-08-21T16:00:00+09:00",
    supersedesProposalId: rejected.proposalId,
  }));
  const terminalIssues = validateOutcomeLearningProposalRecords(
    [draft, ready, rejected, afterRejected],
    schema,
    context(),
  );
  assert.ok(terminalIssues.some((candidate) => candidate.code === "rejected_proposal_is_terminal"));
  console.log("outcome-learning-proposal: rejected proposal is terminal OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-learning-proposal-"));
  const path = join(sandbox, "proposals.jsonl");
  appendOutcomeLearningProposalRecords({ path, incoming: [draft], schema, context: context() });
  appendOutcomeLearningProposalRecords({ path, incoming: [ready], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseOutcomeLearningProposalJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendOutcomeLearningProposalRecords({ path, incoming: [fork], schema, context: context() }),
    /learning_proposal_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("outcome-learning-proposal: rejected append leaves proposal history byte-for-byte unchanged OK");
}

console.log("outcome-learning-proposal.test.ts passed");