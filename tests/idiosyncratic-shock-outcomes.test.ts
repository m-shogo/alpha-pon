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
  { Date: "20260113", AdjustmentClose: 88 },
  { Date: "20260114", AdjustmentClose: 86 },
  { Date: "20260115", AdjustmentClose: 87 },
  { Date: "20260116", AdjustmentClose: 88 },
  { Date: "20260119", AdjustmentClose: 89 },
  { Date: "20260219", AdjustmentClose: 95 },
  { Date: "20260420", AdjustmentClose: 105 },
  { Date: "20270119", AdjustmentClose: 120 },
];
const benchmark: ShockOutcomeQuote[] = [
  { Date: "20260109", AdjustmentClose: 100 },
  { Date: "20260112", AdjustmentClose: 99 },
  { Date: "20260113", AdjustmentClose: 99 },
  { Date: "20260114", AdjustmentClose: 98 },
  { Date: "20260115", AdjustmentClose: 98 },
  { Date: "20260116", AdjustmentClose: 99 },
  { Date: "20260119", AdjustmentClose: 99 },
  { Date: "20260219", AdjustmentClose: 101 },
  { Date: "20260420", AdjustmentClose: 103 },
  { Date: "20270119", AdjustmentClose: 108 },
];

const record = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01");
assert(record, "JP4桁tickerはoutcomeを生成できる");
assert.equal(record?.market, "JP");
assert.equal(record?.benchmark, "TOPIX");
assert.equal(record?.reactionStartDate, "2026-01-10");
assert.equal(record?.baseDate, "2026-01-13");
assert.equal(record?.preEventPrice, 100);
assert.equal(record?.shockLowPrice, 86);
assert.equal(record?.shockDrawdownPct, -14);
assert.equal(record?.firstEligibleSignalDate, "2026-01-19", "checkpointではなく最初の下落一巡日をsignalにする");
assert.equal(record?.firstEligibleSignalPrice, 89);
assert.equal(record?.signalShockDrawdownPct, -14);
assert((record?.signalRelativeShockDrawdownPct ?? 0) <= -3);
assert.equal(record?.signalReturn1m, 6.7416);
assert.equal(record?.signalBenchmarkRelative1m, 4.7214);
assert.equal(record?.signalReturn3m, 17.9775);
assert.equal(record?.signalBenchmarkRelative3m, 13.9371);
assert.notEqual(record?.return1m, record?.signalReturn1m, "checkpoint returnとsignal returnを混同しない");
assert.equal(record?.topixRelative1m, record?.benchmarkRelative1m, "JP互換fieldを維持");

const shiftedReaction = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  reactionStartDate: "2026-01-13",
});
assert(shiftedReaction);
assert.equal(shiftedReaction?.reactionStartDate, "2026-01-13");
assert.equal(shiftedReaction?.preEventDate, "2026-01-12", "reaction anchor変更時はpre-event基準も追随");

const usCase: HistoricalShockCase = { ...strongCase, id: "fixture-us", ticker: "MCD", country: "US" };
const overseas = buildShockHistoricalOutcome(usCase, stock, benchmark, "2027-02-01");
assert(overseas, "US英字tickerもmarket-aware outcomeを生成できる");
assert.equal(overseas?.market, "US");
assert.equal(overseas?.benchmark, "S&P 500");
assert.equal(overseas?.topixRelative1m, null, "海外outcomeをTOPIXと誤表記しない");

const weakRecord: ShockHistoricalOutcomeRecord = {
  ...record!,
  caseId: "fixture-weak",
  score: 5,
  label: "avoid",
  signalReturn1m: -12,
  signalReturn3m: -20,
  signalReturn1y: -30,
  signalBenchmarkRelative1m: -10,
  signalBenchmarkRelative3m: -18,
  signalBenchmarkRelative1y: -25,
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

const noTrade: ShockHistoricalOutcomeRecord = {
  ...record!,
  caseId: "fixture-no-trade",
  firstEligibleSignalDate: null,
  firstEligibleSignalPrice: null,
  signalShockDrawdownPct: null,
  signalRelativeShockDrawdownPct: null,
  signalReturn1w: null,
  signalReturn1m: null,
  signalReturn3m: null,
  signalReturn1y: null,
  signalBenchmarkRelative1w: null,
  signalBenchmarkRelative1m: null,
  signalBenchmarkRelative3m: null,
  signalBenchmarkRelative1y: null,
};
const withNoTrade = calibrateShockThresholds([record!, noTrade]);
assert.equal(withNoTrade.find(row => row.bucket === "score_ge_12")?.cases, 1, "no-tradeを0%として分母へ入れない");

assert.deepEqual(outcomeFetchRange(strongCase, "2026-06-01"), { from: "20251231", to: "20260601" });
assert.deepEqual(outcomeFetchRange(strongCase, "2028-01-01"), { from: "20251231", to: "20270428" });
assert.deepEqual(outcomeFetchRangeIso(usCase, "2026-06-01"), { from: "2025-12-31", to: "2026-06-01" });

console.log("idiosyncratic-shock-outcomes tests: OK");
