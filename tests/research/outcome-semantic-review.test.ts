import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendOutcomeSemanticReviewRecords,
  parseOutcomeSemanticReviewJsonl,
  validateOutcomeSemanticReviewRecord,
  validateOutcomeSemanticReviewRecords,
  withOutcomeSemanticReviewHash,
  type OutcomeSemanticReviewContext,
  type OutcomeSemanticReviewRecord,
} from "../../src/research/outcome-semantic-review.js";
import {
  withQuantitativeOutcomeHash,
  type QuantitativeOutcomeRecord,
} from "../../src/research/quantitative-outcome.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/outcome-semantic-review.schema.json", "utf-8"),
) as JsonSchema;

const recommendation: RecommendationRecord = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:semantic-review:001",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  code: "8136",
  companyName: "株式会社サンリオ",
  currentPrice: 1000,
  currentPriceRecordHash: "a".repeat(64),
  currentPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  decision: "BUY",
  buyRange: [950, 1000],
  buyRangeBasisRefs: ["model:buy-range:v1"],
  targetRange: [1150, 1250],
  targetRangeBasisRefs: ["model:target-range:v1"],
  timeHorizon: "3 months",
  confidence: 0.6,
  confidenceBasisRefs: ["calibration:confidence:v1"],
  bullScenario: "synthetic bull",
  baseScenario: "synthetic base",
  bearScenario: "synthetic bear",
  scenarioProbabilities: { bull: 0.3, base: 0.5, bear: 0.2 },
  scenarioProbabilityBasisRefs: ["calibration:scenario:v1"],
  catalysts: ["synthetic catalyst"],
  risks: ["synthetic risk"],
  confirmationConditions: ["一次情報で追加重大問題がないことを確認"],
  invalidationRules: [
    "新規重大不正が確認された場合",
    "監査上の重大懸念が確認された場合",
  ],
  exitConditions: ["invalidation発火またはreview期限到達"],
  evidenceSummary: {
    newFacts: ["synthetic new fact"],
    knownFacts: ["synthetic known fact"],
    assumptions: [
      "改善策が予定どおり進む",
      "追加重大問題は発生しない",
    ],
    forecasts: ["3か月で市場評価が正常化する可能性"],
    opinions: ["synthetic opinion"],
  },
  sourceEvidence: [{ tier: "A", ref: "evidence:issue:001" }],
  edgeIds: ["known-bad-event-repricing"],
  benchmark: "TOPIX",
  benchmarkPriceRecordHash: "b".repeat(64),
  benchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  sectorBenchmark: "TOPIX-17-RETAIL",
  sectorBenchmarkPriceRecordHash: "c".repeat(64),
  sectorBenchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
  outcomeReviewDate: "2026-11-07",
  status: "open",
  automaticTradingAuthorized: false,
});

const quantitativeOutcome: QuantitativeOutcomeRecord = withQuantitativeOutcomeHash({
  schemaVersion: 1,
  outcomeId: "outcome:semantic-review:001",
  recommendationId: recommendation.recommendationId,
  recommendationContentHash: recommendation.contentHash,
  reviewedAt: "2026-08-19T12:00:00+09:00",
  measurementCutoff: "2026-08-19T12:00:00+09:00",
  measurementMethod: "pit-close-common-date-v1",
  returnBasis: "unadjusted-close-price-return-corporate-action-cleared-v1",
  issuerCorporateActionClearanceHash: "d".repeat(64),
  baselineTradingDate: "2026-08-06",
  terminalTradingDate: "2026-08-18",
  issuerBaselineRecordHash: "a".repeat(64),
  benchmarkBaselineRecordHash: "b".repeat(64),
  sectorBenchmarkBaselineRecordHash: "c".repeat(64),
  issuerTerminalRecordHash: "e".repeat(64),
  benchmarkTerminalRecordHash: "f".repeat(64),
  sectorBenchmarkTerminalRecordHash: "1".repeat(64),
  issuerMeasurementRecordHashes: ["a".repeat(64), "e".repeat(64)],
  benchmarkMeasurementRecordHashes: ["b".repeat(64), "f".repeat(64)],
  sectorBenchmarkMeasurementRecordHashes: ["c".repeat(64), "1".repeat(64)],
  maxReturn: 0.2,
  maxDrawdown: -0.1,
  terminalReturn: 0.15,
  benchmarkReturn: 0.03,
  sectorBenchmarkReturn: 0.05,
  benchmarkExcessReturn: 0.12,
  sectorBenchmarkExcessReturn: 0.1,
  targetAssessment: "reached",
  targetReachedAt: "2026-08-18",
  reviewStage: "quantitative_measurement",
  invalidationAssessment: "not_assessed",
  verdict: "inconclusive",
  correctAssumptions: [],
  incorrectAssumptions: [],
  missingEvidence: [],
  unexpectedConfounders: [],
  lessons: [],
  nextRuleChanges: [],
  automaticTradingAuthorized: false,
});

function context(): OutcomeSemanticReviewContext {
  return {
    recommendationsById: new Map([[recommendation.recommendationId, recommendation]]),
    quantitativeOutcomesById: new Map([[quantitativeOutcome.outcomeId, quantitativeOutcome]]),
    evidenceByRef: new Map([
      ["evidence:review:001", { tier: "A", observedAt: "2026-08-20T09:00:00+09:00" }],
      ["evidence:review:002", { tier: "B", observedAt: "2026-08-20T09:30:00+09:00" }],
      ["evidence:review:future", { tier: "A", observedAt: "2026-08-20T11:30:00+09:00" }],
    ]),
    reviewersByRef: new Map([
      ["reviewer:ai:alpha-pon", { kind: "ai" }],
      ["reviewer:human:confirmed", { kind: "human" }],
    ]),
  };
}

function provisionalInput(): Omit<OutcomeSemanticReviewRecord, "contentHash"> {
  return {
    schemaVersion: 1,
    reviewId: "semantic-review:001",
    recommendationId: recommendation.recommendationId,
    recommendationContentHash: recommendation.contentHash,
    quantitativeOutcomeId: quantitativeOutcome.outcomeId,
    quantitativeOutcomeContentHash: quantitativeOutcome.contentHash,
    reviewedAt: "2026-08-20T12:00:00+09:00",
    evidenceCutoff: "2026-08-20T11:00:00+09:00",
    reviewAuthority: "provisional_ai",
    reviewerRef: "reviewer:ai:alpha-pon",
    learningUse: "proposal_only",
    invalidationAssessment: "not_triggered",
    triggeredInvalidationRules: [],
    invalidationEvidenceRefs: ["evidence:review:001"],
    verdict: "partly_correct",
    assumptionAssessments: [
      {
        assumption: "改善策が予定どおり進む",
        assessment: "correct",
        evidenceRefs: ["evidence:review:001"],
      },
      {
        assumption: "追加重大問題は発生しない",
        assessment: "inconclusive",
        evidenceRefs: ["evidence:review:002"],
      },
    ],
    missingEvidence: ["長期の統制改善効果はまだ確認できない"],
    unexpectedConfounders: [
      {
        statement: "市場全体のリスクオンが同時進行した",
        evidenceRefs: ["evidence:review:002"],
      },
    ],
    lessons: ["イベント通過だけでなく改善策の実装確認を分離する"],
    proposedRuleChanges: ["次回は統制改善Evidenceを確認条件へ追加する"],
    sourceEvidence: [
      { tier: "A", ref: "evidence:review:001" },
      { tier: "B", ref: "evidence:review:002" },
    ],
    ruleMutationAuthorized: false,
    edgeGateMutationAuthorized: false,
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateOutcomeSemanticReviewRecord>): string[] {
  return issues.map((candidate) => candidate.code);
}

{
  const record = withOutcomeSemanticReviewHash(provisionalInput());
  assert.deepEqual(validateOutcomeSemanticReviewRecord(record, schema, context()), []);
  console.log("outcome-semantic-review: valid provisional AI review passes as proposal-only OK");
}

{
  const input = provisionalInput();
  input.learningUse = "human_confirmed";
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("provisional_learning_scope_violation"));
  console.log("outcome-semantic-review: provisional AI cannot claim human-confirmed learning scope OK");
}

{
  const input = provisionalInput();
  input.reviewerRef = "reviewer:human:confirmed";
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("reviewer_authority_mismatch"));
  console.log("outcome-semantic-review: reviewer registry must match declared authority OK");
}

{
  const input = provisionalInput();
  input.sourceEvidence = [{ tier: "A", ref: "evidence:review:future" }];
  input.invalidationEvidenceRefs = ["evidence:review:future"];
  input.assumptionAssessments = [];
  input.unexpectedConfounders = [];
  input.verdict = "inconclusive";
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("future_review_evidence"));
  console.log("outcome-semantic-review: post-cutoff Evidence is rejected OK");
}

{
  const input = provisionalInput();
  input.assumptionAssessments = [{
    assumption: "後から追加した都合のよい仮定",
    assessment: "correct",
    evidenceRefs: ["evidence:review:001"],
  }];
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("unknown_assumption"));
  console.log("outcome-semantic-review: hindsight assumption injection is rejected OK");
}

{
  const input = provisionalInput();
  input.invalidationAssessment = "triggered";
  input.triggeredInvalidationRules = ["Recommendationに存在しない後付けルール"];
  input.invalidationEvidenceRefs = [];
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("unknown_invalidation_rule"));
  assert.ok(codes(issues).includes("invalidation_evidence_missing"));
  console.log("outcome-semantic-review: triggered invalidation needs original rule and Evidence OK");
}

{
  const input = provisionalInput();
  input.assumptionAssessments[0] = {
    ...input.assumptionAssessments[0]!,
    evidenceRefs: ["evidence:not-declared"],
  };
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(input),
    schema,
    context(),
  );
  assert.ok(codes(issues).includes("undeclared_finding_evidence"));
  console.log("outcome-semantic-review: finding refs must be declared in sourceEvidence OK");
}

{
  const mutatedOutcome: QuantitativeOutcomeRecord = {
    ...quantitativeOutcome,
    terminalReturn: quantitativeOutcome.terminalReturn + 0.5,
  };
  const mutatedContext = context();
  mutatedContext.quantitativeOutcomesById = new Map([[mutatedOutcome.outcomeId, mutatedOutcome]]);
  const issues = validateOutcomeSemanticReviewRecord(
    withOutcomeSemanticReviewHash(provisionalInput()),
    schema,
    mutatedContext,
  );
  assert.ok(codes(issues).includes("quantitative_outcome_hash_mismatch"));
  console.log("outcome-semantic-review: mutated Quantitative Outcome with stale hash is rejected OK");
}

{
  const provisional = withOutcomeSemanticReviewHash(provisionalInput());
  const humanInput: Omit<OutcomeSemanticReviewRecord, "contentHash"> = {
    ...provisionalInput(),
    reviewId: "semantic-review:002-human",
    reviewedAt: "2026-08-21T12:00:00+09:00",
    evidenceCutoff: "2026-08-21T11:00:00+09:00",
    reviewAuthority: "human_confirmed",
    reviewerRef: "reviewer:human:confirmed",
    learningUse: "human_confirmed",
    supersedesReviewId: provisional.reviewId,
  };
  const human = withOutcomeSemanticReviewHash(humanInput);
  assert.deepEqual(
    validateOutcomeSemanticReviewRecords([provisional, human], schema, context()),
    [],
  );
  console.log("outcome-semantic-review: provisional AI review may be superseded by human confirmation OK");

  const downgradeInput: Omit<OutcomeSemanticReviewRecord, "contentHash"> = {
    ...provisionalInput(),
    reviewId: "semantic-review:003-downgrade",
    reviewedAt: "2026-08-22T12:00:00+09:00",
    evidenceCutoff: "2026-08-22T11:00:00+09:00",
    supersedesReviewId: human.reviewId,
  };
  const downgrade = withOutcomeSemanticReviewHash(downgradeInput);
  const downgradeIssues = validateOutcomeSemanticReviewRecords(
    [provisional, human, downgrade],
    schema,
    context(),
  );
  assert.ok(downgradeIssues.some((candidate) => candidate.code === "semantic_review_authority_regressed"));
  console.log("outcome-semantic-review: human-confirmed review cannot regress to AI provisional OK");

  const forkInput: Omit<OutcomeSemanticReviewRecord, "contentHash"> = {
    ...humanInput,
    reviewId: "semantic-review:002-fork",
    reviewedAt: "2026-08-21T13:00:00+09:00",
  };
  const fork = withOutcomeSemanticReviewHash(forkInput);
  const forkIssues = validateOutcomeSemanticReviewRecords(
    [provisional, human, fork],
    schema,
    context(),
  );
  assert.ok(forkIssues.some((candidate) => candidate.code === "semantic_review_revision_fork"));
  console.log("outcome-semantic-review: semantic review revision fork is rejected OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-semantic-review-"));
  const path = join(sandbox, "semantic-reviews.jsonl");
  appendOutcomeSemanticReviewRecords({ path, incoming: [provisional], schema, context: context() });
  appendOutcomeSemanticReviewRecords({ path, incoming: [human], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseOutcomeSemanticReviewJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendOutcomeSemanticReviewRecords({ path, incoming: [downgrade], schema, context: context() }),
    /semantic_review_authority_regressed/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("outcome-semantic-review: rejected downgrade leaves history byte-for-byte unchanged OK");
}

console.log("outcome-semantic-review.test.ts passed");