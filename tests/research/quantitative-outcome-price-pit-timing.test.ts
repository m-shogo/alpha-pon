import assert from "node:assert/strict";
import { withCorporateActionClearanceHash } from "../../src/research/corporate-action-clearance.js";
import {
  withPriceRecordHash,
  type PitPriceRecord,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";
import { buildQuantitativeOutcomeRecord } from "../../src/research/quantitative-outcome.js";

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
    source: "synthetic-outcome-pit-fixture",
    sourceVersion: "v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "quantitative-outcome-pit-timing",
    currency: "JPY",
    status: "traded",
    ohlcv: { open: 980, high: 1020, low: 970, close: 1000, volume: 100000 },
    adjusted: false,
    adjustmentFactor: 1,
    corporateActions: [],
    license: "local_only",
    ...overrides,
  };
}

function measurement(
  baseline: PitPriceRecord,
  close: number,
  overrides: Partial<PitPriceRecordInput> = {},
): PitPriceRecord {
  return withPriceRecordHash(priceInput({
    seriesKind: baseline.seriesKind,
    code: baseline.code,
    market: baseline.market,
    tradingDate: "2026-08-07",
    dataAsOf: "2026-08-07T15:30:00+09:00",
    observedAt: "2026-08-07T16:00:00+09:00",
    retrievedAt: "2026-08-07T16:01:00+09:00",
    firstExecutableAt: "2026-08-10T09:00:00+09:00",
    source: baseline.source,
    sourceVersion: baseline.sourceVersion,
    providerPlan: baseline.providerPlan,
    ohlcv: {
      open: close,
      high: close,
      low: close,
      close,
      volume: baseline.seriesKind === "benchmark" ? 0 : 100000,
    },
    ...overrides,
  }));
}

function recommendationFor(
  issuer: PitPriceRecord,
  benchmark: PitPriceRecord,
  sector: PitPriceRecord,
): RecommendationRecord {
  return withRecommendationHash({
    schemaVersion: 1,
    recommendationId: "rec:sanrio:outcome-pit-timing",
    issuedAt: "2026-08-07T09:10:00+09:00",
    informationCutoff: "2026-08-07T09:00:00+09:00",
    code: "8136",
    companyName: "株式会社サンリオ",
    currentPrice: issuer.ohlcv!.close,
    currentPriceRecordHash: issuer.contentHash,
    currentPriceFirstExecutableAt: issuer.firstExecutableAt,
    decision: "WATCH",
    timeHorizon: "synthetic PIT timing fixture",
    bullScenario: "synthetic bull",
    baseScenario: "synthetic base",
    bearScenario: "synthetic bear",
    catalysts: ["synthetic catalyst"],
    risks: ["synthetic risk"],
    confirmationConditions: ["synthetic confirmation"],
    invalidationRules: ["synthetic invalidation"],
    exitConditions: ["synthetic exit"],
    evidenceSummary: {
      newFacts: ["synthetic new fact"],
      knownFacts: ["synthetic known fact"],
      assumptions: ["synthetic assumption"],
      forecasts: ["synthetic forecast"],
      opinions: ["synthetic opinion"],
    },
    sourceEvidence: [{ tier: "A", ref: "synthetic:evidence:pit-timing" }],
    edgeIds: ["synthetic-edge"],
    benchmark: "TOPIX",
    benchmarkPriceRecordHash: benchmark.contentHash,
    benchmarkPriceFirstExecutableAt: benchmark.firstExecutableAt,
    sectorBenchmark: "TOPIX-17-RETAIL",
    sectorBenchmarkPriceRecordHash: sector.contentHash,
    sectorBenchmarkPriceFirstExecutableAt: sector.firstExecutableAt,
    outcomeReviewDate: "2026-11-07",
    status: "open",
    automaticTradingAuthorized: false,
  });
}

function buildWith(input: {
  issuerBaseline: PitPriceRecord;
  benchmarkBaseline: PitPriceRecord;
  sectorBaseline: PitPriceRecord;
  issuerDay: PitPriceRecord;
  benchmarkDay: PitPriceRecord;
  sectorDay: PitPriceRecord;
}) {
  const recommendation = recommendationFor(
    input.issuerBaseline,
    input.benchmarkBaseline,
    input.sectorBaseline,
  );
  const clearance = withCorporateActionClearanceHash({
    schemaVersion: 1,
    clearanceId: "ca-clearance:8136:outcome-pit-timing",
    assessedAt: "2026-08-11T10:00:00+09:00",
    assessmentMethod: "official-corporate-action-clearance-v1",
    code: input.issuerBaseline.code,
    market: input.issuerBaseline.market,
    source: input.issuerBaseline.source,
    providerPlan: input.issuerBaseline.providerPlan,
    fromTradingDate: input.issuerBaseline.tradingDate,
    throughTradingDate: "2026-08-07",
    status: "clear",
    sourceEvidence: [{ tier: "A", ref: "synthetic:official:pit-timing" }],
    automaticTradingAuthorized: false,
  });
  const prices = [
    input.issuerBaseline,
    input.benchmarkBaseline,
    input.sectorBaseline,
    input.issuerDay,
    input.benchmarkDay,
    input.sectorDay,
  ];
  return buildQuantitativeOutcomeRecord({
    outcomeId: "outcome:sanrio:pit-timing",
    recommendation,
    reviewedAt: "2026-08-11T12:00:00+09:00",
    priceRecordsByHash: new Map(prices.map(record => [record.contentHash, record] as const)),
    corporateActionClearancesByHash: new Map([[clearance.contentHash, clearance]]),
    issuerCorporateActionClearanceHash: clearance.contentHash,
  });
}

const issuerBaseline = withPriceRecordHash(priceInput());
const benchmarkBaseline = withPriceRecordHash(priceInput({
  seriesKind: "benchmark",
  code: "TOPIX",
  ohlcv: { open: 1990, high: 2020, low: 1980, close: 2000, volume: 0 },
}));
const sectorBaseline = withPriceRecordHash(priceInput({
  seriesKind: "benchmark",
  code: "TOPIX-17-RETAIL",
  ohlcv: { open: 2990, high: 3020, low: 2980, close: 3000, volume: 0 },
}));
const issuerDay = measurement(issuerBaseline, 1050);
const benchmarkDay = measurement(benchmarkBaseline, 2010);
const sectorDay = measurement(sectorBaseline, 3020);

{
  const outcome = buildWith({
    issuerBaseline,
    benchmarkBaseline,
    sectorBaseline,
    issuerDay,
    benchmarkDay,
    sectorDay,
  });
  assert.equal(outcome.terminalTradingDate, "2026-08-07");
  console.log("quantitative-outcome-price-pit-timing: valid baseline and measurement timelines pass OK");
}

{
  const impossibleBaseline = withPriceRecordHash(priceInput({
    retrievedAt: "2026-08-07T09:05:00+09:00",
    firstExecutableAt: "2026-08-07T09:00:00+09:00",
  }));
  assert.throws(() => buildWith({
    issuerBaseline: impossibleBaseline,
    benchmarkBaseline,
    sectorBaseline,
    issuerDay: measurement(impossibleBaseline, 1050),
    benchmarkDay,
    sectorDay,
  }), /issuer baseline: invalid price PIT timeline.*execution_before_retrieval/);
  console.log("quantitative-outcome-price-pit-timing: rehashed invalid baseline timeline is rejected OK");
}

{
  const impossibleMeasurement = measurement(issuerBaseline, 1050, {
    retrievedAt: "2026-08-10T09:05:00+09:00",
    firstExecutableAt: "2026-08-10T09:00:00+09:00",
  });
  assert.throws(() => buildWith({
    issuerBaseline,
    benchmarkBaseline,
    sectorBaseline,
    issuerDay: impossibleMeasurement,
    benchmarkDay,
    sectorDay,
  }), /issuer measurement: invalid price PIT timeline.*execution_before_retrieval/);
  console.log("quantitative-outcome-price-pit-timing: rehashed invalid measurement timeline is rejected OK");
}

console.log("quantitative-outcome-price-pit-timing.test.ts passed");
