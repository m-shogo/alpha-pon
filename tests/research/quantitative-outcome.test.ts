import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  withCorporateActionClearanceHash,
  type CorporateActionClearanceRecord,
} from "../../src/research/corporate-action-clearance.js";
import {
  withPriceRecordHash,
  type PitPriceRecord,
  type PitPriceRecordInput,
} from "../../src/research/price-store.js";
import {
  withRecommendationHash,
  type RecommendationRecord,
} from "../../src/research/recommendation-persistence.js";
import {
  appendQuantitativeOutcomeRecords,
  buildQuantitativeOutcomeRecord,
  parseQuantitativeOutcomeJsonl,
  validateQuantitativeOutcomeRecord,
  validateQuantitativeOutcomeRecords,
  withQuantitativeOutcomeHash,
  type QuantitativeOutcomeContext,
} from "../../src/research/quantitative-outcome.js";
import type { JsonSchema } from "../../src/research/schema.js";

const outcomeSchema = JSON.parse(
  readFileSync("research/schemas/quantitative-outcome-record.schema.json", "utf-8"),
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
    source: "synthetic-outcome-fixture",
    sourceVersion: "v1",
    providerPlan: "synthetic",
    delayDays: 0,
    isDelayed: false,
    ingestionRunId: "quantitative-outcome-fixture",
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

function futurePrice(input: {
  baseline: PitPriceRecord;
  tradingDate: string;
  observedAt: string;
  firstExecutableAt: string;
  close: number;
  volume?: number;
  adjusted?: boolean;
  adjustmentFactor?: number;
}): PitPriceRecord {
  const close = input.close;
  return withPriceRecordHash(priceInput({
    seriesKind: input.baseline.seriesKind,
    code: input.baseline.code,
    market: input.baseline.market,
    tradingDate: input.tradingDate,
    dataAsOf: `${input.tradingDate}T15:30:00+09:00`,
    observedAt: input.observedAt,
    retrievedAt: input.observedAt,
    firstExecutableAt: input.firstExecutableAt,
    source: input.baseline.source,
    sourceVersion: input.baseline.sourceVersion,
    providerPlan: input.baseline.providerPlan,
    adjusted: input.adjusted ?? false,
    adjustmentFactor: input.adjustmentFactor ?? 1,
    ohlcv: {
      open: close,
      high: close,
      low: close,
      close,
      volume: input.volume ?? (input.baseline.seriesKind === "benchmark" ? 0 : 100000),
    },
  }));
}

const issuerDay1 = futurePrice({
  baseline: issuerBaseline,
  tradingDate: "2026-08-07",
  observedAt: "2026-08-07T15:30:00+09:00",
  firstExecutableAt: "2026-08-10T09:00:00+09:00",
  close: 1100,
});
const issuerDay2 = futurePrice({
  baseline: issuerBaseline,
  tradingDate: "2026-08-10",
  observedAt: "2026-08-10T15:30:00+09:00",
  firstExecutableAt: "2026-08-12T09:00:00+09:00",
  close: 900,
});
const issuerDay3 = futurePrice({
  baseline: issuerBaseline,
  tradingDate: "2026-08-12",
  observedAt: "2026-08-12T15:30:00+09:00",
  firstExecutableAt: "2026-08-13T09:00:00+09:00",
  close: 1200,
});
const issuerExtra = futurePrice({
  baseline: issuerBaseline,
  tradingDate: "2026-08-13",
  observedAt: "2026-08-13T15:30:00+09:00",
  firstExecutableAt: "2026-08-14T09:00:00+09:00",
  close: 1300,
});

const benchmarkDay1 = futurePrice({
  baseline: benchmarkBaseline,
  tradingDate: "2026-08-07",
  observedAt: "2026-08-07T15:30:00+09:00",
  firstExecutableAt: "2026-08-10T09:00:00+09:00",
  close: 2020,
});
const benchmarkDay2 = futurePrice({
  baseline: benchmarkBaseline,
  tradingDate: "2026-08-10",
  observedAt: "2026-08-10T15:30:00+09:00",
  firstExecutableAt: "2026-08-12T09:00:00+09:00",
  close: 1980,
});
const benchmarkDay3 = futurePrice({
  baseline: benchmarkBaseline,
  tradingDate: "2026-08-12",
  observedAt: "2026-08-12T15:30:00+09:00",
  firstExecutableAt: "2026-08-13T09:00:00+09:00",
  close: 2040,
});

const sectorDay1 = futurePrice({
  baseline: sectorBaseline,
  tradingDate: "2026-08-07",
  observedAt: "2026-08-07T15:30:00+09:00",
  firstExecutableAt: "2026-08-10T09:00:00+09:00",
  close: 3030,
});
const sectorDay2 = futurePrice({
  baseline: sectorBaseline,
  tradingDate: "2026-08-10",
  observedAt: "2026-08-10T15:30:00+09:00",
  firstExecutableAt: "2026-08-12T09:00:00+09:00",
  close: 2970,
});
const sectorDay3 = futurePrice({
  baseline: sectorBaseline,
  tradingDate: "2026-08-12",
  observedAt: "2026-08-12T15:30:00+09:00",
  firstExecutableAt: "2026-08-13T09:00:00+09:00",
  close: 3150,
});

const recommendation: RecommendationRecord = withRecommendationHash({
  schemaVersion: 1,
  recommendationId: "rec:sanrio:outcome-fixture",
  issuedAt: "2026-08-07T09:10:00+09:00",
  informationCutoff: "2026-08-07T09:00:00+09:00",
  code: "8136",
  companyName: "株式会社サンリオ",
  currentPrice: 1000,
  currentPriceRecordHash: issuerBaseline.contentHash,
  currentPriceFirstExecutableAt: issuerBaseline.firstExecutableAt,
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
  sourceEvidence: [{ tier: "A", ref: "synthetic:evidence:001" }],
  edgeIds: ["synthetic-edge"],
  benchmark: "TOPIX",
  benchmarkPriceRecordHash: benchmarkBaseline.contentHash,
  benchmarkPriceFirstExecutableAt: benchmarkBaseline.firstExecutableAt,
  sectorBenchmark: "TOPIX-17-RETAIL",
  sectorBenchmarkPriceRecordHash: sectorBaseline.contentHash,
  sectorBenchmarkPriceFirstExecutableAt: sectorBaseline.firstExecutableAt,
  outcomeReviewDate: "2026-11-07",
  status: "open",
  automaticTradingAuthorized: false,
});

const earlyClearance = withCorporateActionClearanceHash({
  schemaVersion: 1,
  clearanceId: "ca-clearance:8136:outcome-fixture:early",
  assessedAt: "2026-08-12T10:00:00+09:00",
  assessmentMethod: "official-corporate-action-clearance-v1",
  code: issuerBaseline.code,
  market: issuerBaseline.market,
  source: issuerBaseline.source,
  providerPlan: issuerBaseline.providerPlan,
  fromTradingDate: issuerBaseline.tradingDate,
  throughTradingDate: "2026-08-10",
  status: "clear",
  sourceEvidence: [{ tier: "A", ref: "synthetic:official:corporate-action:early" }],
  automaticTradingAuthorized: false,
});

const clearance = withCorporateActionClearanceHash({
  schemaVersion: 1,
  clearanceId: "ca-clearance:8136:outcome-fixture",
  assessedAt: "2026-08-14T10:00:00+09:00",
  assessmentMethod: "official-corporate-action-clearance-v1",
  code: issuerBaseline.code,
  market: issuerBaseline.market,
  source: issuerBaseline.source,
  providerPlan: issuerBaseline.providerPlan,
  fromTradingDate: issuerBaseline.tradingDate,
  throughTradingDate: "2026-08-12",
  status: "clear",
  sourceEvidence: [{ tier: "A", ref: "synthetic:official:corporate-action:001" }],
  supersedesClearanceId: earlyClearance.clearanceId,
  automaticTradingAuthorized: false,
});

const allPrices = [
  issuerBaseline,
  benchmarkBaseline,
  sectorBaseline,
  issuerDay1,
  issuerDay2,
  issuerDay3,
  issuerExtra,
  benchmarkDay1,
  benchmarkDay2,
  benchmarkDay3,
  sectorDay1,
  sectorDay2,
  sectorDay3,
];

function outcomeContext(
  prices: PitPriceRecord[] = allPrices,
  clearances: CorporateActionClearanceRecord[] = [earlyClearance, clearance],
): QuantitativeOutcomeContext {
  return {
    recommendationsById: new Map([[recommendation.recommendationId, recommendation]]),
    priceRecordsByHash: new Map(prices.map((record) => [record.contentHash, record])),
    corporateActionClearancesByHash: new Map(clearances.map((record) => [record.contentHash, record])),
  };
}

function build(input: {
  outcomeId: string;
  reviewedAt: string;
  recommendation?: RecommendationRecord;
  context?: QuantitativeOutcomeContext;
  clearanceHash?: string;
  supersedesOutcomeId?: string;
}) {
  const ctx = input.context ?? outcomeContext();
  return buildQuantitativeOutcomeRecord({
    outcomeId: input.outcomeId,
    recommendation: input.recommendation ?? recommendation,
    reviewedAt: input.reviewedAt,
    priceRecordsByHash: ctx.priceRecordsByHash,
    corporateActionClearancesByHash: ctx.corporateActionClearancesByHash,
    issuerCorporateActionClearanceHash: input.clearanceHash ?? clearance.contentHash,
    ...(input.supersedesOutcomeId ? { supersedesOutcomeId: input.supersedesOutcomeId } : {}),
  });
}

function approx(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

{
  const outcome = build({
    outcomeId: "outcome:sanrio:2026-08-14",
    reviewedAt: "2026-08-14T12:00:00+09:00",
  });
  assert.equal(outcome.returnBasis, "unadjusted-close-price-return-corporate-action-cleared-v1");
  assert.equal(outcome.issuerCorporateActionClearanceHash, clearance.contentHash);
  assert.equal(outcome.baselineTradingDate, "2026-08-06");
  assert.equal(outcome.terminalTradingDate, "2026-08-12");
  assert.equal(outcome.issuerTerminalRecordHash, issuerDay3.contentHash);
  assert.equal(outcome.benchmarkTerminalRecordHash, benchmarkDay3.contentHash);
  assert.equal(outcome.sectorBenchmarkTerminalRecordHash, sectorDay3.contentHash);
  approx(outcome.maxReturn, 0.2);
  approx(outcome.maxDrawdown, 900 / 1100 - 1);
  approx(outcome.terminalReturn, 0.2);
  approx(outcome.benchmarkReturn, 0.02);
  approx(outcome.sectorBenchmarkReturn, 0.05);
  approx(outcome.benchmarkExcessReturn, 0.18);
  approx(outcome.sectorBenchmarkExcessReturn, 0.15);
  assert.equal(outcome.targetAssessment, "reached");
  assert.equal(outcome.targetReachedAt, "2026-08-12");
  assert.ok(!outcome.issuerMeasurementRecordHashes.includes(issuerExtra.contentHash));
  assert.deepEqual(validateQuantitativeOutcomeRecord(outcome, outcomeSchema, outcomeContext()), []);
  console.log("quantitative-outcome: aligned PIT metrics with corporate-action clearance pass OK");
}

{
  const contextWithoutClearance = outcomeContext(allPrices, []);
  assert.throws(
    () => build({
      outcomeId: "outcome:sanrio:no-clearance",
      reviewedAt: "2026-08-14T12:00:00+09:00",
      context: contextWithoutClearance,
    }),
    /corporate action clearance not found/,
  );
  console.log("quantitative-outcome: raw issuer outcome without clearance is rejected OK");
}

{
  const detected = withCorporateActionClearanceHash({
    ...clearance,
    clearanceId: "ca-clearance:8136:detected",
    status: "action_detected",
  });
  const detectedContext = outcomeContext(allPrices, [detected]);
  assert.throws(
    () => build({
      outcomeId: "outcome:sanrio:action-detected",
      reviewedAt: "2026-08-14T12:00:00+09:00",
      context: detectedContext,
      clearanceHash: detected.contentHash,
    }),
    /must be clear/,
  );
  console.log("quantitative-outcome: action_detected clearance blocks raw return measurement OK");
}

{
  const short = withCorporateActionClearanceHash({
    ...clearance,
    clearanceId: "ca-clearance:8136:short",
    throughTradingDate: "2026-08-10",
  });
  const shortContext = outcomeContext(allPrices, [short]);
  assert.throws(
    () => build({
      outcomeId: "outcome:sanrio:short-clearance",
      reviewedAt: "2026-08-14T12:00:00+09:00",
      context: shortContext,
      clearanceHash: short.contentHash,
    }),
    /does not cover terminal tradingDate/,
  );
  console.log("quantitative-outcome: clearance must cover the entire measured horizon OK");
}

{
  const adjustedIssuerDay1 = futurePrice({
    baseline: issuerBaseline,
    tradingDate: "2026-08-07",
    observedAt: "2026-08-07T15:30:00+09:00",
    firstExecutableAt: "2026-08-10T09:00:00+09:00",
    close: 1100,
    adjusted: true,
    adjustmentFactor: 1.1,
  });
  const prices = allPrices.map((record) =>
    record.contentHash === issuerDay1.contentHash ? adjustedIssuerDay1 : record,
  );
  assert.throws(
    () => build({
      outcomeId: "outcome:sanrio:adjusted-mixed",
      reviewedAt: "2026-08-14T12:00:00+09:00",
      context: outcomeContext(prices),
    }),
    /only supports unadjusted issuer records/,
  );
  console.log("quantitative-outcome: adjusted/raw issuer series are not silently mixed OK");
}

{
  const outcome = build({
    outcomeId: "outcome:sanrio:tamper",
    reviewedAt: "2026-08-14T12:00:00+09:00",
  });
  const tampered = withQuantitativeOutcomeHash({
    ...outcome,
    benchmarkExcessReturn: outcome.benchmarkExcessReturn + 0.1,
  });
  const issues = validateQuantitativeOutcomeRecord(tampered, outcomeSchema, outcomeContext());
  assert.ok(issues.some((candidate) => candidate.code === "quantitative_measurement_mismatch"));
  console.log("quantitative-outcome: rehashed fabricated metric is rejected by recomputation OK");
}

{
  const mismatchedSectorBaseline = withPriceRecordHash(priceInput({
    seriesKind: "benchmark",
    code: "TOPIX-17-RETAIL",
    tradingDate: "2026-08-05",
    dataAsOf: "2026-08-05T15:30:00+09:00",
    ohlcv: { open: 2990, high: 3020, low: 2980, close: 3000, volume: 0 },
  }));
  const mismatchedRecommendation = withRecommendationHash({
    ...recommendation,
    recommendationId: "rec:sanrio:mismatched-baseline",
    sectorBenchmarkPriceRecordHash: mismatchedSectorBaseline.contentHash,
    sectorBenchmarkPriceFirstExecutableAt: mismatchedSectorBaseline.firstExecutableAt,
  });
  const prices = [...allPrices.filter((record) => record.contentHash !== sectorBaseline.contentHash), mismatchedSectorBaseline];
  assert.throws(
    () => build({
      outcomeId: "outcome:mismatched-baseline",
      recommendation: mismatchedRecommendation,
      reviewedAt: "2026-08-14T12:00:00+09:00",
      context: outcomeContext(prices),
    }),
    /baselines must share one tradingDate/,
  );
  console.log("quantitative-outcome: mismatched issuer/TOPIX/sector baseline dates are rejected OK");
}

{
  const early = build({
    outcomeId: "outcome:sanrio:early",
    reviewedAt: "2026-08-12T12:00:00+09:00",
    clearanceHash: earlyClearance.contentHash,
  });
  assert.equal(early.terminalTradingDate, "2026-08-10");
  assert.equal(early.targetAssessment, "not_reached");
  assert.equal(early.issuerCorporateActionClearanceHash, earlyClearance.contentHash);

  const later = build({
    outcomeId: "outcome:sanrio:later",
    reviewedAt: "2026-08-14T12:00:00+09:00",
    supersedesOutcomeId: early.outcomeId,
  });
  assert.equal(later.terminalTradingDate, "2026-08-12");
  assert.equal(later.targetAssessment, "reached");
  assert.equal(later.issuerCorporateActionClearanceHash, clearance.contentHash);
  assert.deepEqual(
    validateQuantitativeOutcomeRecords([early, later], outcomeSchema, outcomeContext()),
    [],
  );

  const fork = build({
    outcomeId: "outcome:sanrio:fork",
    reviewedAt: "2026-08-15T12:00:00+09:00",
    supersedesOutcomeId: early.outcomeId,
  });
  const forkIssues = validateQuantitativeOutcomeRecords([early, later, fork], outcomeSchema, outcomeContext());
  assert.ok(forkIssues.some((candidate) => candidate.code === "outcome_revision_fork"));
  console.log("quantitative-outcome: PIT clearance lineage supports linear measurement revision and rejects fork OK");

  const sandbox = mkdtempSync(join(tmpdir(), "alpha-pon-outcome-"));
  const path = join(sandbox, "quantitative-outcomes.jsonl");
  appendQuantitativeOutcomeRecords({ path, incoming: [early], schema: outcomeSchema, context: outcomeContext() });
  appendQuantitativeOutcomeRecords({ path, incoming: [later], schema: outcomeSchema, context: outcomeContext() });
  const beforeRejectedAppend = readFileSync(path, "utf-8");
  assert.equal(parseQuantitativeOutcomeJsonl(beforeRejectedAppend, path).length, 2);
  assert.throws(
    () => appendQuantitativeOutcomeRecords({ path, incoming: [fork], schema: outcomeSchema, context: outcomeContext() }),
    /outcome_revision_fork/,
  );
  assert.equal(readFileSync(path, "utf-8"), beforeRejectedAppend);
  console.log("quantitative-outcome: rejected append leaves existing history byte-for-byte unchanged OK");
}

console.log("quantitative-outcome.test.ts passed");