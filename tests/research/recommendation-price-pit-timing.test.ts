import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  withPriceRecordHash,
  type PitPriceRecord,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import {
  validateRecommendationRecord,
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
    ingestionRunId: "recommendation-pit-timing-fixture",
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
const benchmark = withPriceRecordHash(priceInput({
  seriesKind: "benchmark",
  code: "TOPIX",
  ohlcv: { open: 2000, high: 2020, low: 1990, close: 2010, volume: 0 },
  benchmarkCode: undefined,
  sectorBenchmarkCode: undefined,
}));
const sector = withPriceRecordHash(priceInput({
  seriesKind: "benchmark",
  code: "TOPIX-17-RETAIL",
  ohlcv: { open: 3000, high: 3030, low: 2980, close: 3010, volume: 0 },
  benchmarkCode: undefined,
  sectorBenchmarkCode: undefined,
}));

function baseInput(): Omit<RecommendationRecord, "contentHash"> {
  return {
    schemaVersion: 1,
    recommendationId: "rec:sanrio:2026-08-07:pit-timing",
    issuedAt: "2026-08-07T09:10:00+09:00",
    informationCutoff: "2026-08-07T09:00:00+09:00",
    code: "8136",
    companyName: "株式会社サンリオ",
    currentPrice: 1000,
    currentPriceRecordHash: price.contentHash,
    currentPriceFirstExecutableAt: price.firstExecutableAt,
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
    benchmarkPriceRecordHash: benchmark.contentHash,
    benchmarkPriceFirstExecutableAt: benchmark.firstExecutableAt,
    sectorBenchmark: "TOPIX-17-RETAIL",
    sectorBenchmarkPriceRecordHash: sector.contentHash,
    sectorBenchmarkPriceFirstExecutableAt: sector.firstExecutableAt,
    positionSizingRationale: "synthetic fixture only; no live sizing authority",
    outcomeReviewDate: "2026-11-07",
    status: "open",
    automaticTradingAuthorized: false,
  };
}

function context(records: PitPriceRecord[] = [price, benchmark, sector]): RecommendationValidationContext {
  return {
    priceRecordsByHash: new Map(records.map(record => [record.contentHash, record] as const)),
    evidenceByRef: new Map([
      ["evidence:ir:001", { tier: "A", observedAt: "2026-08-07T08:30:00+09:00" }],
      ["evidence:market:001", { tier: "B", observedAt: "2026-08-07T08:35:00+09:00" }],
    ]),
    edgeStageById: new Map([["known-bad-event-repricing", "active-research"]]),
  };
}

{
  const record = withRecommendationHash(baseInput());
  assert.deepEqual(validateRecommendationRecord(record, schema, context()), []);
  console.log("recommendation-price-pit-timing: valid pinned timelines pass OK");
}

{
  const impossibleIssuer = withPriceRecordHash(priceInput({
    retrievedAt: "2026-08-07T09:05:00+09:00",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
  }));
  const input = baseInput();
  input.currentPriceRecordHash = impossibleIssuer.contentHash;
  input.currentPriceFirstExecutableAt = impossibleIssuer.firstExecutableAt;
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    context([impossibleIssuer, benchmark, sector]),
  );
  assert.ok(issues.some(issue => issue.code === "invalid_pinned_price_timeline"));
  assert.equal(issues.some(issue => issue.code === "invalid_pinned_price_content_hash"), false);
  console.log("recommendation-price-pit-timing: rehashed issuer with execution before retrieval is rejected OK");
}

{
  const implicitZoneIssuer = withPriceRecordHash(priceInput({
    retrievedAt: "2026-08-07T08:45:00",
  }));
  const input = baseInput();
  input.currentPriceRecordHash = implicitZoneIssuer.contentHash;
  input.currentPriceFirstExecutableAt = implicitZoneIssuer.firstExecutableAt;
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    context([implicitZoneIssuer, benchmark, sector]),
  );
  assert.ok(issues.some(issue =>
    issue.code === "invalid_pinned_price_timeline"
    && issue.message.includes("explicit timezone")
  ));
  assert.equal(issues.some(issue => issue.code === "invalid_pinned_price_content_hash"), false);
  console.log("recommendation-price-pit-timing: rehashed issuer with implicit timestamp zone is rejected OK");
}

{
  const impossibleBenchmark = withPriceRecordHash(priceInput({
    seriesKind: "benchmark",
    code: "TOPIX",
    ohlcv: { open: 2000, high: 2020, low: 1990, close: 2010, volume: 0 },
    benchmarkCode: undefined,
    sectorBenchmarkCode: undefined,
    observedAt: "2026-08-07T08:40:00+09:00",
    retrievedAt: "2026-08-07T09:05:00+09:00",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
  }));
  const input = baseInput();
  input.benchmarkPriceRecordHash = impossibleBenchmark.contentHash;
  input.benchmarkPriceFirstExecutableAt = impossibleBenchmark.firstExecutableAt;
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    context([price, impossibleBenchmark, sector]),
  );
  assert.ok(issues.some(issue => issue.code === "invalid_pinned_price_timeline"));
  console.log("recommendation-price-pit-timing: rehashed benchmark with invalid PIT timeline is rejected OK");
}

{
  const subMillisecondFutureIssuer = withPriceRecordHash(priceInput({
    observedAt: "2026-08-07T09:00:00.000000001+09:00",
    retrievedAt: "2026-08-07T09:00:00.000000002+09:00",
    firstExecutableAt: "2026-08-07T09:00:00.000000003+09:00",
  }));
  const input = baseInput();
  input.informationCutoff = "2026-08-07T09:00:00.000000000+09:00";
  input.currentPriceRecordHash = subMillisecondFutureIssuer.contentHash;
  input.currentPriceFirstExecutableAt = subMillisecondFutureIssuer.firstExecutableAt;
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    context([subMillisecondFutureIssuer, benchmark, sector]),
  );
  assert.ok(issues.some(issue => issue.code === "future_price_observation"));
  console.log("recommendation-price-pit-timing: sub-millisecond future price observation is rejected OK");
}

{
  const subMillisecondLateIssuer = withPriceRecordHash(priceInput({
    observedAt: "2026-08-07T09:09:59.999999998+09:00",
    retrievedAt: "2026-08-07T09:09:59.999999999+09:00",
    firstExecutableAt: "2026-08-07T09:10:00.000000001+09:00",
  }));
  const input = baseInput();
  input.issuedAt = "2026-08-07T09:10:00.000000000+09:00";
  input.informationCutoff = "2026-08-07T09:09:59.999999999+09:00";
  input.currentPriceRecordHash = subMillisecondLateIssuer.contentHash;
  input.currentPriceFirstExecutableAt = subMillisecondLateIssuer.firstExecutableAt;
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    context([subMillisecondLateIssuer, benchmark, sector]),
  );
  assert.ok(issues.some(issue => issue.code === "current_price_after_issue"));
  assert.ok(issues.some(issue => issue.code === "price_not_yet_executable"));
  console.log("recommendation-price-pit-timing: sub-millisecond post-issue executable price is rejected OK");
}

{
  const input = baseInput();
  input.informationCutoff = "2026-08-07T09:00:00.000000000+09:00";
  const evidenceContext = context();
  evidenceContext.evidenceByRef = new Map([
    ["evidence:ir:001", { tier: "A", observedAt: "2026-08-07T09:00:00.000000001+09:00" }],
    ["evidence:market:001", { tier: "B", observedAt: "2026-08-07T08:35:00+09:00" }],
  ]);
  const issues = validateRecommendationRecord(
    withRecommendationHash(input),
    schema,
    evidenceContext,
  );
  assert.ok(issues.some(issue => issue.code === "future_evidence"));
  console.log("recommendation-price-pit-timing: sub-millisecond future evidence is rejected OK");
}

console.log("recommendation-price-pit-timing.test.ts passed");
