import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withOutcomeLearningProposalHash,
  type OutcomeLearningProposalRecord,
} from "../../src/research/outcome-learning-proposal.js";
import {
  withOutcomeLearningAdoptionDecisionHash,
  type OutcomeLearningAdoptionDecisionRecord,
} from "../../src/research/outcome-learning-adoption-decision.js";
import {
  appendOutcomeLearningChangePreparationRecords,
  parseOutcomeLearningChangePreparationJsonl,
  validateOutcomeLearningChangePreparationRecord,
  validateOutcomeLearningChangePreparationRecords,
  withOutcomeLearningChangePreparationHash,
  type OutcomeLearningChangePreparationContext,
  type OutcomeLearningChangePreparationRecord,
} from "../../src/research/outcome-learning-change-preparation.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-learning-change-preparation.schema.json", "utf-8"),
) as JsonSchema;

const proposal: OutcomeLearningProposalRecord = withOutcomeLearningProposalHash({
  schemaVersion: 1,
  proposalId: "learning-proposal:change-preparation:001",
  createdAt: "2026-08-21T13:00:00+09:00",
  semanticReviewId: "semantic:change-preparation:001",
  semanticReviewContentHash: "a".repeat(64),
  proposalStage: "human_review_ready",
  targetKind: "evidence_requirement",
  targetRef: "edge:known-bad-event-repricing:confirmation-conditions",
  problemStatement: "確認条件の不足原因を分離できない",
  proposedChange: "統制改善Evidenceを独立したconfirmation conditionとして検証する",
  rationale: "独立Shadowで有効性が支持されたため",
  expectedEffect: "不足原因を再現可能に分離する",
  evaluationPlan: {
    method: "独立holdoutで旧条件と新条件をshadow比較する",
    successCriteria: ["追加条件が不足原因を再現可能に分離する"],
    failureCriteria: ["識別力を改善せずEvidenceコストだけ増える"],
    minimumEvidence: ["異なるissuerを含む複数の独立案件"],
  },
  falsificationConditions: ["独立holdoutで追加条件が識別力を改善しない"],
  rollbackPlan: "新条件を採用せず既存ruleを維持する",
  evidenceRefs: ["evidence:proposal:001"],
  humanApprovalRequired: true,
  automaticApplyAuthorized: false,
  ruleMutationAuthorized: false,
  edgeGateMutationAuthorized: false,
  codeMutationAuthorized: false,
  automaticTradingAuthorized: false,
});

function adoption(input: {
  id?: string;
  decision?: "defer" | "approve_change_preparation" | "reject";
} = {}): OutcomeLearningAdoptionDecisionRecord {
  const decision = input.decision ?? "approve_change_preparation";
  return withOutcomeLearningAdoptionDecisionHash({
    schemaVersion: 1,
    adoptionDecisionId: input.id ?? "adoption-decision:change-preparation:001",
    decidedAt: "2026-09-16T10:00:00+09:00",
    shadowEvaluationId: "shadow-evaluation:change-preparation:001",
    shadowEvaluationContentHash: "b".repeat(64),
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    reviewerRef: "reviewer:human",
    decision,
    decisionRationale: "変更準備のみへ進める",
    conditions: ["実適用前に別PRでscopeと回帰を再確認する"],
    evidenceRefs: ["evidence:shadow:success"],
    shadowEvaluationReviewed: true,
    rollbackPlanAcknowledged: true,
    humanDecisionConfirmed: true,
    governedChangePreparationAuthorized: decision === "approve_change_preparation",
    automaticApplyAuthorized: false,
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    codeMutationAuthorized: false,
    automaticTradingAuthorized: false,
  });
}

const approvedAdoption = adoption();
const deferredAdoption = adoption({ id: "adoption-decision:change-preparation:defer", decision: "defer" });

function context(input: {
  adoptions?: OutcomeLearningAdoptionDecisionRecord[];
  validatedAdoptions?: string[];
} = {}): OutcomeLearningChangePreparationContext {
  const adoptions = input.adoptions ?? [approvedAdoption, deferredAdoption];
  return {
    adoptionDecisionsById: new Map(adoptions.map((record) => [record.adoptionDecisionId, record])),
    validatedAdoptionDecisionHashes: new Set(input.validatedAdoptions ?? adoptions.map((record) => record.contentHash)),
    proposalsById: new Map([[proposal.proposalId, proposal]]),
    validatedProposalHashes: new Set([proposal.contentHash]),
  };
}

function manifest(input: {
  id?: string;
  source?: OutcomeLearningAdoptionDecisionRecord;
  stage?: "draft" | "ready_for_pr";
  createdAt?: string;
  preparedByRef?: string;
  supersedesManifestId?: string;
  plannedArtifacts?: OutcomeLearningChangePreparationRecord["plannedArtifacts"];
} = {}): Omit<OutcomeLearningChangePreparationRecord, "contentHash"> {
  const source = input.source ?? approvedAdoption;
  return {
    schemaVersion: 1,
    manifestId: input.id ?? "change-preparation:001",
    createdAt: input.createdAt ?? "2026-09-16T11:00:00+09:00",
    preparedByRef: input.preparedByRef ?? "agent:chatgpt",
    preparedByKind: "ai",
    adoptionDecisionId: source.adoptionDecisionId,
    adoptionDecisionContentHash: source.contentHash,
    proposalId: proposal.proposalId,
    proposalContentHash: proposal.contentHash,
    preparationStage: input.stage ?? "draft",
    targetKind: proposal.targetKind,
    targetRef: proposal.targetRef,
    proposedChange: proposal.proposedChange,
    rollbackPlan: proposal.rollbackPlan,
    adoptionConditions: [...source.conditions],
    plannedArtifacts: input.plannedArtifacts ?? [
      { kind: "code", path: "src/research/example-learned-condition.ts", purpose: "学習済みconfirmation conditionを明示的な研究関数として準備する" },
      { kind: "test", path: "tests/research/example-learned-condition.test.ts", purpose: "既存条件との回帰境界を固定する" },
      { kind: "docs", path: "docs/research/example-learned-condition.md", purpose: "変更理由とrollbackを記録する" },
    ],
    validationRequirements: ["Research OS central validationがgreenであること", "既存Edge Gateを自動変更しないこと"],
    explicitNonGoals: ["Production適用しない", "自動売買を許可しない", "workflow/runnerを変更しない"],
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
  };
}

function codes(issues: ReturnType<typeof validateOutcomeLearningChangePreparationRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withOutcomeLearningChangePreparationHash(manifest());
  assert.deepEqual(validateOutcomeLearningChangePreparationRecord(record, schema, context()), []);
  assert.equal(record.pullRequestPreparationAuthorized, true);
  assert.equal(record.codeMutationAuthorized, false);
  console.log("outcome-learning-change-preparation: approved adoption may create non-mutating draft manifest OK");
}

for (const preparedByRef of [
  "https://example.invalid/preparer#token=synthetic",
  "https://synthetic:secret@example.invalid/preparer",
]) {
  const record = withOutcomeLearningChangePreparationHash(manifest({
    id: `change-preparation:secret-preparer:${preparedByRef.includes("#") ? "fragment" : "userinfo"}`,
    preparedByRef,
  }));
  assert.ok(codes(validateOutcomeLearningChangePreparationRecord(record, schema, context())).includes("secret_like_preparer_ref"));
}
{
  const record = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:safe-preparer-fragment",
    preparedByRef: "https://example.invalid/preparer#profile",
  }));
  assert.deepEqual(validateOutcomeLearningChangePreparationRecord(record, schema, context()), []);
}
console.log("outcome-learning-change-preparation: fragment/userinfo credentials are rejected while ordinary fragments remain valid OK");

{
  const record = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:fractional-after-adoption",
    createdAt: "2026-09-16T10:00:00.000000001+09:00",
  }));
  assert.deepEqual(validateOutcomeLearningChangePreparationRecord(record, schema, context()), []);
  console.log("outcome-learning-change-preparation: 1ns after adoption remains chronologically valid OK");
}

{
  const record = withOutcomeLearningChangePreparationHash(manifest({ source: deferredAdoption }));
  assert.ok(codes(validateOutcomeLearningChangePreparationRecord(record, schema, context())).includes("change_preparation_not_authorized"));
  console.log("outcome-learning-change-preparation: defer/reject adoption cannot authorize change preparation OK");
}

{
  const record = withOutcomeLearningChangePreparationHash(manifest());
  const issues = validateOutcomeLearningChangePreparationRecord(
    record,
    schema,
    context({ validatedAdoptions: [deferredAdoption.contentHash] }),
  );
  assert.ok(codes(issues).includes("adoption_decision_not_validated"));
  console.log("outcome-learning-change-preparation: unwitnessed adoption decision is rejected OK");
}

{
  const input = manifest();
  input.proposedChange = "hindsight scope expansion";
  const record = withOutcomeLearningChangePreparationHash(input);
  assert.ok(codes(validateOutcomeLearningChangePreparationRecord(record, schema, context())).includes("preparation_scope_drift"));
  console.log("outcome-learning-change-preparation: adopted change scope cannot drift OK");
}

{
  const input = manifest();
  input.adoptionConditions = ["条件を都合よく削除"];
  const record = withOutcomeLearningChangePreparationHash(input);
  assert.ok(codes(validateOutcomeLearningChangePreparationRecord(record, schema, context())).includes("adoption_conditions_drift"));
  console.log("outcome-learning-change-preparation: final adoption conditions cannot drift OK");
}

for (const path of ["../escape.ts", ".github/workflows/research.yml", ".env", "wrangler.toml"]) {
  const input = manifest({ plannedArtifacts: [{ kind: "code", path, purpose: "unsafe" }] });
  const issues = validateOutcomeLearningChangePreparationRecord(withOutcomeLearningChangePreparationHash(input), schema, context());
  assert.ok(issues.some((candidate) => candidate.code === "unsafe_planned_artifact_path" || candidate.code === "protected_planned_artifact_path"));
}
console.log("outcome-learning-change-preparation: traversal/workflow/secret/cloudflare config scopes are rejected OK");

{
  const input = manifest({
    plannedArtifacts: [
      { kind: "code", path: "src/research/x.ts", purpose: "code" },
      { kind: "code", path: "src/research/x.ts", purpose: "duplicate" },
    ],
  });
  const record = withOutcomeLearningChangePreparationHash(input);
  assert.ok(codes(validateOutcomeLearningChangePreparationRecord(record, schema, context())).includes("duplicate_planned_artifact_path"));
  console.log("outcome-learning-change-preparation: duplicate planned paths are rejected OK");
}

{
  const rootReady = withOutcomeLearningChangePreparationHash(manifest({ stage: "ready_for_pr" }));
  assert.ok(codes(validateOutcomeLearningChangePreparationRecord(rootReady, schema, context())).includes("root_preparation_must_be_draft"));
  console.log("outcome-learning-change-preparation: root manifest must start draft OK");
}

{
  const fractionalDraft = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:fractional-revision:001",
    stage: "draft",
    createdAt: "2026-09-16T11:00:00.000000001+09:00",
  }));
  const fractionalReady = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:fractional-revision:002",
    stage: "ready_for_pr",
    createdAt: "2026-09-16T11:00:00.000000002+09:00",
    supersedesManifestId: fractionalDraft.manifestId,
  }));
  assert.deepEqual(
    validateOutcomeLearningChangePreparationRecords([fractionalDraft, fractionalReady], schema, context()),
    [],
  );
  console.log("outcome-learning-change-preparation: 1ns revision progression remains chronologically valid OK");
}

{
  const draft = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:revision:001",
    stage: "draft",
    createdAt: "2026-09-16T11:00:00+09:00",
  }));
  const ready = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:revision:002",
    stage: "ready_for_pr",
    createdAt: "2026-09-16T12:00:00+09:00",
    supersedesManifestId: draft.manifestId,
  }));
  assert.deepEqual(validateOutcomeLearningChangePreparationRecords([draft, ready], schema, context()), []);
  console.log("outcome-learning-change-preparation: draft may progress linearly to ready_for_pr OK");

  const noTest = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:no-test",
    stage: "ready_for_pr",
    createdAt: "2026-09-16T12:00:00+09:00",
    supersedesManifestId: draft.manifestId,
    plannedArtifacts: [{ kind: "code", path: "src/research/x.ts", purpose: "code only" }],
  }));
  const noTestIssues = validateOutcomeLearningChangePreparationRecords([draft, noTest], schema, context());
  assert.ok(noTestIssues.some((candidate) => candidate.code === "ready_preparation_missing_test_artifact"));
  console.log("outcome-learning-change-preparation: ready implementation scope requires test artifact OK");

  const fork = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:revision:fork",
    stage: "ready_for_pr",
    createdAt: "2026-09-16T13:00:00+09:00",
    supersedesManifestId: draft.manifestId,
  }));
  const forkIssues = validateOutcomeLearningChangePreparationRecords([draft, ready, fork], schema, context());
  assert.ok(forkIssues.some((candidate) => candidate.code === "change_preparation_revision_fork"));
  console.log("outcome-learning-change-preparation: preparation revision fork is rejected OK");

  const afterReady = withOutcomeLearningChangePreparationHash(manifest({
    id: "change-preparation:after-ready",
    stage: "ready_for_pr",
    createdAt: "2026-09-16T14:00:00+09:00",
    supersedesManifestId: ready.manifestId,
  }));
  const terminalIssues = validateOutcomeLearningChangePreparationRecords([draft, ready, afterReady], schema, context());
  assert.ok(terminalIssues.some((candidate) => candidate.code === "ready_change_preparation_revised"));
  console.log("outcome-learning-change-preparation: ready_for_pr manifest is terminal OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-change-preparation-"));
  const path = join(sandbox, "preparations.jsonl");
  appendOutcomeLearningChangePreparationRecords({ path, incoming: [draft], schema, context: context() });
  appendOutcomeLearningChangePreparationRecords({ path, incoming: [ready], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseOutcomeLearningChangePreparationJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendOutcomeLearningChangePreparationRecords({ path, incoming: [fork], schema, context: context() }),
    /change_preparation_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("outcome-learning-change-preparation: rejected append leaves preparation history byte-for-byte unchanged OK");
}

console.log("outcome-learning-change-preparation.test.ts passed");