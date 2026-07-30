import assert from "node:assert/strict";
import { labelShockScore, type HistoricalShockCase } from "../src/idiosyncratic-shock.js";
import {
  buildShockHistoricalOutcome,
  calibrateShockThresholds,
  outcomeFetchRange,
  outcomeFetchRangeIso,
  type ShockHistoricalOutcomeRecord,
  type ShockOutcomeQuote,
} from "../src/idiosyncratic-shock-outcomes.js";

const strongCase: HistoricalShockCase = {
  id: "fixture-strong",
  company: "Fixture Strong",
  ticker: "9999",
  country: "JP",
  eventDate: "2026-01-10",
  decisionCheckpoint: "2026-01-13",
  category: "executive_relationship",
  actorType: "ceo",
  eventSummary: "fixture",
  macroPrimaryCause: false,
  evidenceStatus: "confirmed",
  priceStateAtCheckpoint: "stabilizing",
  scores: {
    businessImpactContainment: 2,
    accountingIntegrity: 2,
    actorSeparability: 2,
    organizationalContainment: 2,
    regulatoryContainment: 2,
    brandResilience: 2,
    managementContinuity: 2,
    fundamentalResilience: 2,
    discountMagnitude: 1,
    priceStabilization: 1,
  },
  score: 18,
  label: labelShockScore(18),
  scoringNotes: {},
  sources: [{ title: "fixture", url: "https://example.com", sourceType: "company" }],
  researchConfidence: "high",
};

const stock: ShockOutcomeQuote[] = [
  { Date: "20260109", AdjustmentClose: 100 },
  { Date: "20260112", AdjustmentClose: 90 },
  { Date: "20260113", AdjustmentClose: 92 },
  { Date: "20260120", AdjustmentClose: 96 },
  { Date: "20260212", AdjustmentClose: 100 },
  { Date: "20260413", AdjustmentClose: 110 },
  { Date: "20270113", AdjustmentClose: 120 },
];
const benchmark: ShockOutcomeQuote[] = [
  { Date: "20260113", AdjustmentClose: 100 },
  { Date: "20260120", AdjustmentClose: 101 },
  { Date: "20260212", AdjustmentClose: 102 },
  { Date: "20260413", AdjustmentClose: 104 },
  { Date: "20270113", AdjustmentClose: 108 },
];

const record = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01");
assert(record, "JP4桁tickerはoutcomeを生成できる");
assert.equal(record?.market, "JP");
assert.equal(record?.benchmark, "TOPIX");
assert.equal(record?.baseDate, "2026-01-13");
assert.equal(record?.preEventPrice, 100);
assert.equal(record?.shockLowPrice, 90);
assert.equal(record?.shockDrawdownPct, -10);
assert.equal(record?.return1m, 8.6957);
assert.equal(record?.return3m, 19.5652);
assert.equal(record?.benchmarkRelative1m, 6.6957);
assert.equal(record?.benchmarkRelative3m, 15.5652);
assert.equal(record?.topixRelative1m, 6.6957, "JP互換fieldを維持");

const usCase: HistoricalShockCase = { ...strongCase, id: "fixture-us", ticker: "MCD", country: "US" };
const overseas = buildShockHistoricalOutcome(usCase, stock, benchmark, "2027-02-01");
assert(overseas, "US英字tickerもmarket-aware outcomeを生成できる");
assert.equal(overseas?.market, "US");
assert.equal(overseas?.benchmark, "S&P 500");
assert.equal(overseas?.benchmarkRelative1m, 6.6957);
assert.equal(overseas?.topixRelative1m, null, "海外outcomeをTOPIXと誤表記しない");

const weakRecord: ShockHistoricalOutcomeRecord = {
  ...record!,
  caseId: "fixture-weak",
  score: 5,
  label: "avoid",
  return1m: -12,
  return3m: -20,
  return1y: -30,
  benchmarkRelative1m: -10,
  benchmarkRelative3m: -18,
  benchmarkRelative1y: -25,
  topixRelative1m: -10,
  topixRelative3m: -18,
  topixRelative1y: -25,
};
const calibration = calibrateShockThresholds([record!, weakRecord]);
const ge12 = calibration.find(row => row.bucket === "score_ge_12");
const lt12 = calibration.find(row => row.bucket === "score_lt_12");
assert.equal(ge12?.cases, 1);
assert.equal(ge12?.positiveRate1m, 100);
assert.equal(lt12?.cases, 1);
assert.equal(lt12?.positiveRate1m, 0);
assert((ge12?.avgBenchmarkRelative1m ?? 0) > (lt12?.avgBenchmarkRelative1m ?? 0));
assert.equal(ge12?.avgTopixRelative1m, ge12?.avgBenchmarkRelative1m, "legacy calibration aliasを維持");

assert.deepEqual(outcomeFetchRange(strongCase, "2026-06-01"), { from: "20251231", to: "20260601" });
assert.deepEqual(outcomeFetchRange(strongCase, "2028-01-01"), { from: "20251231", to: "20270128" });
assert.deepEqual(outcomeFetchRangeIso(usCase, "2026-06-01"), { from: "2025-12-31", to: "2026-06-01" });

console.log("idiosyncratic-shock-outcomes tests: OK");
