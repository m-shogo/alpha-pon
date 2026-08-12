import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withPriceRecordHash,
  type PitPriceRecord,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import {
  appendRecommendationRecords,
  parseRecommendationJsonl,
  validateRecommendationRecord,
  validateRecommendationRecords,
  withRecommendationHash,
  type RecommendationRecord,
  type RecommendationValidationContext,
} from "../../src/research/recommendation-persistence.js";
import type { JsonSchema } from "../../src/research/schema.js";

const schema = JSON.parse(
  readFileSync("research/schemas/recommendation-record.schema.json", "utf-8"),
) as JsonSchema;

function priceInput(overrides: Partial<PitPriceRecordInput> = {}): PitPriceRecordInput {
  return {
    schemaVersion: 1,
    seriesKind: "security",
    code: "81360",
    market: "TSE",
    tradingDate: "2026-08-06",
    dataAsOf: "2026-08-06T15:30:00+09:00",
    observedAt: "2026-08-07T08:40:00+09:00",
    retrievedAt: "2026-08-07T08:45:00+09:00",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
    source: "synthetic-fixture",
    sourceVersion: "v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "recommendation-fixture",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 980, high: 1020, low: 970, close: 1000, volume: 100000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    benchmarkCode: "TOPIX",
    sectorBenchmarkCode: "TOPIX-17-RETAIL",
    license: "local_only",
    ...overrides,
  };
}

const price = withPriceRecordHash(priceInput());
const benchmarkPrice = withPriceRecordHash(priceInput({
  seriesKind: "benchmark",
  code: "TOPIX",
  ohlcv: { open: 2000, high: 2020, low: 1990, close: 2010, volume: 0 },
  benchmarkCode: undefined,
  sectorBenchmarkCode: undefined,
}));
const sectorBenchmarkPrice = withPriceRecordHash(priceInput({
  seriesKind: "benchmark",
  code: "TOPIX-17-RETAIL",
  ohlcv: { open: 3000, high: 3030, low: 2980, close: 3010, volume: 0 },
  benchmarkCode: undefined,
  sectorBenchmarkCode: undefined,
}));

function context(overrides: Partial<RecommendationValidationContext> = {}): RecommendationValidationContext {
  return {
    priceRecordsByHash: new Map([
      [price.contentHash, price],
      [benchmarkPrice.contentHash, benchmarkPrice],
      [sectorBenchmarkPrice.contentHash, sectorBenchmarkPrice],
    ]),
    evidenceByRef: new Map([
      ["evidence:ir:001", { tier: "A", observedAt: "2026-08-07T08:30:00+09:00" }],
      ["evidence:market:001", { tier: "B", observedAt: "2026-08-07T08:35:00+09:00" }],
    ]),
    edgeStageById: new Map([["known-bad-event-repricing", "active-research"]]),
    ...overrides,
  };
}

function baseInput(): Omit<RecommendationRecord, "contentHash"> {
  return {
    schemaVersion: 1,
    recommendationId: "rec:sanrio:2026-08-07:001",
    issuedAt: "2026-08-07T09:10:00+09:00",
    informationCutoff: "2026-08-07T09:00:00+09:00",
    code: "8136",
    companyName: "株式会社サンリオ",
    currentPrice: 1000,
    currentPriceRecordHash: price.contentHash,
    currentPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
    decision: "BUY",
    buyRange: [950, 1000],
    buyRangeBasisRefs: ["model:buy-range:v1"],
    targetRange: [1100, 1200],
    targetRangeBasisRefs: ["model:target-range:v1"],
    timeHorizon: "3 months primary horizon",
    confidence: 0.6,
    confidenceBasisRefs: ["calibration:confidence:v1"],
    bullScenario: "改善策が実行され、既知悪材料の追加悪化がない。",
    baseScenario: "既知材料の消化が進むが、再評価は緩やか。",
    bearScenario: "追加の新規悪材料または統制不備が判明する。",
    scenarioProbabilities: { bull: 0.3, base: 0.5, bear: 0.2 },
    scenarioProbabilityBasisRefs: ["calibration:scenario:v1"],
    catalysts: ["正式イベント通過後の追加悪材料なし"],
    risks: ["新規会計・統制問題の判明"],
    confirmationConditions: ["一次情報で追加重大問題がないことを確認"],
    invalidationRules: ["新規重大不正または監査上の重大懸念が確認された場合"],
    exitConditions: ["invalidationRules発火またはreview期限到達"],
    evidenceSummary: {
      newFacts: ["当日一次資料で確認した新規事実"],
      knownFacts: ["発表前から公開済みの既知事実"],
      assumptions: ["改善策が予定どおり進むという仮定"],
      forecasts: ["3か月で市場評価が正常化する可能性を検証する"],
      opinions: ["現時点では自動発注を行わない"],
    },
    sourceEvidence: [
      { tier: "A", ref: "evidence:ir:001" },
      { tier: "B", ref: "evidence:market:001" },
    ],
    edgeIds: ["known-bad-event-repricing"],
    benchmark: "TOPIX",
    benchmarkPriceRecordHash: benchmarkPrice.contentHash,
    benchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
    sectorBenchmark: "TOPIX-17-RETAIL",
    sectorBenchmarkPriceRecordHash: sectorBenchmarkPrice.contentHash,
    sectorBenchmarkPriceFirstExecutableAt: "2026-08-07T09:00:00+09:00",
    positionSizingRationale: "synthetic fixture only; no live sizing authority",
    outcomeReviewDate: "2026-11-07",
    status: "open",
    automaticTradingAuthorized: false,
  };
}

function codes(issues: ReturnType<typeof validateRecommendationRecord>): string[] {
  return issues.map((issue) => issue.code);
}

{
  const record = withRecommendationHash(baseInput());
  assert.deepEqual(validateRecommendationRecord(record, schema, context()), []);
  console.log("recommendation-persistence: valid issue-time recommendation passes OK");
}

{
  const input = baseInput();
  input.buyRangeBasisRefs = undefined;
  const issues = validateRecommendationRecord(withRecommendationHash(input), schema, context());
  assert.ok(codes(issues).includes("quantitative_basis_missing"));
  console.log("recommendation-persistence: ungrounded buy range is rejected OK");
}

{
  const input = baseInput();
  input.confidenceBasisRefs = undefined;
  const issues = validateRecommendationRecord(withRecommendationHash(input), schema, context());
  assert.ok(codes(issues).includes("confidence_basis_missing"));
  console.log("recommendation-persistence: confidence without basis is rejected OK");
}

{
  const input = baseInput();
  input.scenarioProbabilities = { bull: 0.5, base: 0.5, bear: 0.5 };
  const issues = validateRecommendationRecord(withRecommendationHash(input), schema, context());
  assert.ok(codes(issues).includes("scenario_probability_sum"));
  console.log("recommendation-persistence: fabricated probability sum is rejected OK");
}

{
  const input = baseInput();
  input.evidenceSummary.assumptions = [input.evidenceSummary.newFacts[0]!];
  const issues = validateRecommendationRecord(withRecommendationHash(input), schema, context());
  assert.ok(codes(issues).includes("evidence_category_overlap"));
  console.log("recommendation-persistence: fact/assumption overlap is rejected OK");
}

{
  const futureEvidenceContext = context({
    evidenceByRef: new Map([
      ["evidence:ir:001", { tier: "A", observedAt: "2026-08-07T09:05:00+09:00" }],
      ["evidence:market:001", { tier: "B", observedAt: "2026-08-07T08:35:00+09:00" }],
    ]),
  });
  const issues = validateRecommendationRecord(
    withRecommendationHash(baseInput()),
    schema,
    futureEvidenceContext,
  );
  assert.ok(codes(issues).includes("future_evidence"));
  console.log("recommendation-persistence: post-cutoff evidence is rejected OK");
}

{
  const invalidInstantContexts: RecommendationValidationContext[] = [
    context({
      evidenceByRef: new Map([
        ["evidence:ir:001", { tier: "A", observedAt: "2026-08-07T08:30:00" }],
        ["evidence:market:001", { tier: "B", observedAt: "2026-08-07T08:35:00+09:00" }],
      ]),
    }),
    context({
      evidenceByRef: new Map([
        ["evidence:ir:001", { tier: "A", observedAt: "2026-02-30T08:30:00+09:00" }],
        ["evidence:market:001", { tier: "B", observedAt: "2026-08-07T08:35:00+09:00" }],
      ]),
    }),
  ];
  for (const invalidContext of invalidInstantContexts) {
    const issues = validateRecommendationRecord(
      withRecommendationHash(baseInput()),
      schema,
      invalidContext,
    );
    assert.ok(codes(issues).includes("invalid_recommendation_evidence_observed_at"));
    assert.equal(codes(issues).includes("future_evidence"), false);
  }
  console.log("recommendation-persistence: implicit/impossible evidence observedAt fails closed OK");
}

{
  const catalogContext = context({
    edgeStageById: new Map([["known-bad-event-repricing", "catalog"]]),
  });
  const issues = validateRecommendationRecord(withRecommendationHash(baseInput()), schema, catalogContext);
  assert.ok(codes(issues).includes("ineligible_edge_stage"));
  assert.ok(codes(issues).includes("buy_without_eligible_edge"));
  console.log("recommendation-persistence: catalog-only BUY is rejected OK");
}

{
  const input = baseInput();
  input.currentPrice = 1001;
  const issues = validateRecommendationRecord(withRecommendationHash(input), schema, context());
  assert.ok(codes(issues).includes("current_price_mismatch"));
  console.log("recommendation-persistence: current price must match PIT pin OK");
}

{
  const missingBenchmarkContext = context({
    priceRecordsByHash: new Map([
      [price.contentHash, price],
      [sectorBenchmarkPrice.contentHash, sectorBenchmarkPrice],
    ]),
  });
  const issues = validateRecommendationRecord(
    withRecommendationHash(baseInput()),
    schema,
    missingBenchmarkContext,
  );
  assert.ok(codes(issues).includes("missing_benchmark_price_provenance"));
  console.log("recommendation-persistence: missing TOPIX baseline pin is rejected OK");
}

{
  const wrongBenchmark: PitPriceRecord = { ...benchmarkPrice, code: "NIKKEI225" };
  const wrongBenchmarkContext = context({
    priceRecordsByHash: new Map([
      [price.contentHash, price],
      [benchmarkPrice.contentHash, wrongBenchmark],
      [sectorBenchmarkPrice.contentHash, sectorBenchmarkPrice],
    ]),
  });
  const issues = validateRecommendationRecord(
    withRecommendationHash(baseInput()),
    schema,
    wrongBenchmarkContext,
  );
  assert.ok(codes(issues).includes("invalid_pinned_price_content_hash"));
  assert.ok(codes(issues).includes("benchmark_identity_mismatch"));
  console.log("recommendation-persistence: mutated/wrong benchmark record is rejected OK");
}

{
  const futureSector = withPriceRecordHash(priceInput({
    seriesKind: "benchmark",
    code: "TOPIX-17-RETAIL",
    ohlcv: { open: 3000, high: 3030, low: 2980, close: 3010, volume: 0 },
    benchmarkCode: undefined,
    sectorBenchmarkCode: undefined,
    observedAt: "2026-08-07T09:05:00+09:00",
    retrievedAt: "2026-08-07T09:06:00+09:00",
    firstExecutableAt: "2026-08-07T09:15:00+09:00",
  }));
  const input = baseInput();
  input.sectorBenchmarkPriceRecordHash = futureSector.contentHash;
  input.sectorBenchmarkPriceFirstExecutableAt = futureSector.firstExecutableAt;
  const futureSectorContext = context({
    priceRecordsByHash: new Map([
      [price.contentHash, price],
      [benchmarkPrice.contentHash, benchmarkPrice],
      [futureSector.contentHash, futureSector],
    ]),
  });
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    futureSectorContext,
  );
  assert.ok(codes(issues).includes("future_benchmark_observation"));
  assert.ok(codes(issues).includes("benchmark_not_yet_executable"));
  console.log("recommendation-persistence: post-cutoff sector baseline is rejected OK");
}

{
  const mutatedPrice: PitPriceRecord = {
    ...price,
    ohlcv: { ...price.ohlcv!, close: 999 },
  };
  const mutatedContext = context({
    priceRecordsByHash: new Map([
      [price.contentHash, mutatedPrice],
      [benchmarkPrice.contentHash, benchmarkPrice],
      [sectorBenchmarkPrice.contentHash, sectorBenchmarkPrice],
    ]),
  });
  const issues = validateRecommendationRecord(
    withRecommendationHash(baseInput()),
    schema,
    mutatedContext,
  );
  assert.ok(codes(issues).includes("invalid_pinned_price_content_hash"));
  console.log("recommendation-persistence: mutated issuer record with stale hash is rejected OK");
}

{
  const input = baseInput();
  input.issuedAt = "2026-11-07T23:59:59.999999999+09:00";
  input.informationCutoff = "2026-08-07T09:00:00+09:00";
  input.currentPriceFirstExecutableAt = "2026-08-07T09:00:00+09:00";
  input.outcomeReviewDate = "2026-11-07";
  const issues = validateRecommendationRecord(withRecommendationHash(input), schema, context());
  assert.equal(codes(issues).includes("outcome_review_before_issue"), false);
  console.log("recommendation-persistence: review date includes final JST nanosecond OK");
}

{
  const root = withRecommendationHash(baseInput());
  const revisionInput = baseInput();
  revisionInput.recommendationId = "rec:sanrio:2026-08-07:002";
  revisionInput.supersedesId = root.recommendationId;
  revisionInput.issuedAt = "2026-08-07T10:00:00+09:00";
  revisionInput.informationCutoff = "2026-08-07T09:45:00+09:00";
  revisionInput.decision = "WATCH";
  const revision = withRecommendationHash(revisionInput);
  assert.deepEqual(validateRecommendationRecords([root, revision], schema, context()), []);

  const forkInput = { ...revisionInput, recommendationId: "rec:sanrio:2026-08-07:003" };
  const fork = withRecommendationHash(forkInput);
  const forkIssues = validateRecommendationRecords([root, revision, fork], schema, context());
  assert.ok(forkIssues.some((issue) => issue.code === "revision_fork"));
  console.log("recommendation-persistence: linear supersession passes and fork is rejected OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-recommendation-"));
  const path = join(sandbox, "recommendations.jsonl");
  appendRecommendationRecords({ path, incoming: [root], schema, context: context() });
  appendRecommendationRecords({ path, incoming: [revision], schema, context: context() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseRecommendationJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendRecommendationRecords({ path, incoming: [fork], schema, context: context() }),
    /revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("recommendation-persistence: append-only writer leaves file unchanged on rejected fork OK");
}

console.log("recommendation-persistence.test.ts passed");