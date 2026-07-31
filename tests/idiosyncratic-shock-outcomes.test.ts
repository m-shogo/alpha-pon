import assert from "node:assert/strict";
import { enrichShockCalibrationObservations } from "../src/idiosyncratic-shock-calibration.js";
import { labelShockScore, type HistoricalShockCase } from "../src/idiosyncratic-shock.js";
import {
  isHistoricalReactionAnchorVerified,
  isTrustedHistoricalPrimarySource,
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
} from "../src/idiosyncratic-shock-case-context.js";
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

const verifiedPassContext = {
  strategyEligibilityAtCheckpoint: "confirmed_pass" as const,
  strategyInvestigationStatusAtCheckpoint: "substantially_complete" as const,
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
  confounderStatus: "clear" as const,
};
assert.equal(resolveHistoricalStrategyEligibility(strongCase), "unknown", "高scoreでも一次情報によるPASS確認なしでは自動PASSしない");
assert.equal(resolveHistoricalStrategyEligibility(strongCase, { strategyEligibilityAtCheckpoint: "confirmed_pass" }), "unknown", "文字だけconfirmed_passでもstructured evidence不足ならPASSしない");
assert.equal(resolveHistoricalStrategyEligibility(strongCase, verifiedPassContext), "confirmed_pass");
assert.equal(resolveHistoricalStrategyEligibility(strongCase, { strategyEligibilityAtCheckpoint: "confirmed_block" }), "confirmed_block");

assert.equal(isTrustedHistoricalPrimarySource({ title: "JPX", url: "https://www2.jpx.co.jp/disc/81360/example.pdf", sourceType: "exchange" }), true);
assert.equal(isTrustedHistoricalPrimarySource({ title: "SEC", url: "https://www.sec.gov/Archives/example.htm", sourceType: "regulator" }), true);
assert.equal(isTrustedHistoricalPrimarySource({ title: "bad metadata", url: "https://minkabu.jp/stock/8136/news/example", sourceType: "exchange" }), false, "aggregatorをexchangeと誤記してもprimary扱いしない");
const mislabeledAggregatorCase: HistoricalShockCase = {
  ...strongCase,
  id: "fixture-mislabeled-source",
  sources: [{ title: "aggregator", url: "https://minkabu.jp/stock/9999/news/example", sourceType: "exchange" }],
};
assert.equal(resolveHistoricalStrategyEligibility(mislabeledAggregatorCase, verifiedPassContext), "unknown", "mislabeled aggregatorだけではconfirmed_passにしない");
assert.equal(resolveHistoricalStrategyEligibility(mislabeledAggregatorCase, {
  ...verifiedPassContext,
  strategyEligibilityEvidenceSources: [{ title: "JPX", url: "https://www2.jpx.co.jp/disc/99990/example.pdf", sourceType: "exchange" }],
}), "confirmed_pass", "trusted primary evidenceをsidecarで補えばPASS可能");

assert.equal(isHistoricalReactionAnchorVerified({ announcementTiming: "before_open", priceReactionStartDate: "2026-01-13" }), true);
assert.equal(isHistoricalReactionAnchorVerified({ announcementTiming: "before_open" }), false, "timingだけでreaction anchor verifiedにしない");
assert.equal(isHistoricalReactionAnchorVerified({ announcementTiming: "unknown", priceReactionStartDate: "2026-01-13" }), false);
assert.equal(isHistoricalReactionAnchorVerified({ announcementTiming: "after_close", priceReactionStartDate: "20260114" }), false, "reaction date formatも固定する");

const loadedHistoricalContext = loadHistoricalShockCaseContext();
assert.equal(loadedHistoricalContext.get("mcdonalds-2019-easterbrook")?.strategyEligibilityAtCheckpoint, "confirmed_pass", "reaction anchor overlayでbase eligibilityを壊さない");
assert.equal(loadedHistoricalContext.get("mcdonalds-2019-easterbrook")?.priceReactionStartDate, "2019-11-04");
assert.equal(loadedHistoricalContext.get("hp-2010-hurd")?.priceReactionStartDate, "2010-08-09");
assert.equal(loadedHistoricalContext.get("sushiro-2023-customer")?.priceReactionStartDate, "2023-01-30");
assert.equal(loadedHistoricalContext.get("skylark-2019-bamiyan")?.priceReactionStartDate, "2019-02-12");
assert.equal(loadedHistoricalContext.get("seven-eleven-2019-employee-video")?.priceReactionStartDate, "2019-02-12");
assert.equal(loadedHistoricalContext.get("intel-2018-krzanich")?.priceReactionStartDate, "2018-06-21");
assert.equal(loadedHistoricalContext.get("priceline-2016-huston")?.priceReactionStartDate, "2016-04-28");
assert.equal(loadedHistoricalContext.get("ti-2018-crutcher")?.priceReactionStartDate, "2018-07-18");
assert.equal(loadedHistoricalContext.get("keurig-dr-pepper-2022-ceo-conduct")?.priceReactionStartDate, "2022-11-10");
assert.equal(loadedHistoricalContext.get("boeing-2005-stonecipher")?.priceReactionStartDate, "2005-03-07");
assert.equal(loadedHistoricalContext.get("ebay-2020-cyberstalking")?.priceReactionStartDate, "2020-06-15");
assert.equal(loadedHistoricalContext.get("dominos-japan-2024-employee-video")?.priceReactionStartDate, "2024-02-13");
assert.equal(loadedHistoricalContext.get("ootoya-2019-employee-video")?.priceReactionStartDate, "2019-02-18");

const lowScoreCase: HistoricalShockCase = { ...strongCase, id: "fixture-low-score", score: 11, label: labelShockScore(11) };
assert.equal(resolveHistoricalStrategyEligibility(lowScoreCase, verifiedPassContext), "confirmed_block", "score<12は本番では確定BLOCK");
const accountingBlockCase: HistoricalShockCase = { ...strongCase, id: "fixture-accounting-block", scores: { ...strongCase.scores, accountingIntegrity: 0 } };
assert.equal(resolveHistoricalStrategyEligibility(accountingBlockCase, verifiedPassContext), "confirmed_block");
const macroBlockCase: HistoricalShockCase = { ...strongCase, id: "fixture-macro-block", macroPrimaryCause: true };
assert.equal(resolveHistoricalStrategyEligibility(macroBlockCase, verifiedPassContext), "confirmed_block");

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

const record = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  reactionAnchorStatus: "verified",
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
});
assert(record);
assert.equal(record?.strategyEligibilityAtCheckpoint, "confirmed_pass");
assert.equal(record?.thresholdCalibrationEligibilityAtCheckpoint, "confirmed_pass");
assert.equal(record?.firstEligibleSignalDate, "2026-01-19");
assert.equal(record?.calibrationFirstEligibleSignalDate, "2026-01-19", "12点以上の本番PASSではproduction/shadow signalが一致する");
assert.equal(record?.firstEligibleSignalPrice, record?.calibrationFirstEligibleSignalPrice);
assert.equal(record?.signalBenchmarkRelative3m, 13.9371);
assert.equal(record?.calibrationSignalBenchmarkRelative3m, 13.9371);
assert.equal(record?.signalReturn3m, record?.calibrationSignalReturn3m);
assert.equal(record?.shockDrawdownPct, -14);
assert.notEqual(record?.return1m, record?.signalReturn1m, "checkpoint returnとsignal returnを混同しない");

const shadowOnly = buildShockHistoricalOutcome(lowScoreCase, stock, benchmark, "2027-02-01", {
  reactionAnchorStatus: "verified",
  strategyEligibilityAtCheckpoint: "confirmed_block",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
});
assert(shadowOnly);
assert.equal(shadowOnly?.firstEligibleSignalDate, null, "11点はproduction signalを生成しない");
assert.equal(shadowOnly?.calibrationFirstEligibleSignalDate, "2026-01-19", "11点でも明示shadow PASSならthreshold比較用signalを生成できる");
assert.equal(shadowOnly?.calibrationSignalBenchmarkRelative3m, 13.9371);

const unverifiedAnchor = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
});
assert(unverifiedAnchor);
assert.equal(unverifiedAnchor?.firstEligibleSignalDate, null);
assert.equal(unverifiedAnchor?.calibrationFirstEligibleSignalDate, null, "shadowもreaction anchor未確認なら生成しない");

const unknownEligibility = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  reactionAnchorStatus: "verified",
});
assert(unknownEligibility);
assert.equal(unknownEligibility?.firstEligibleSignalDate, null);
assert.equal(unknownEligibility?.calibrationFirstEligibleSignalDate, null);

const shiftedReaction = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  reactionStartDate: "2026-01-13",
  reactionAnchorStatus: "verified",
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
});
assert(shiftedReaction);
assert.equal(shiftedReaction?.preEventDate, "2026-01-12");

const usCase: HistoricalShockCase = { ...strongCase, id: "fixture-us", ticker: "MCD", country: "US" };
const overseas = buildShockHistoricalOutcome(usCase, stock, benchmark, "2027-02-01", {
  reactionAnchorStatus: "verified",
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  thresholdCalibrationEligibilityAtCheckpoint: "confirmed_pass",
});
assert(overseas);
assert.equal(overseas?.market, "US");
assert.equal(overseas?.benchmark, "S&P 500");
assert.equal(overseas?.topixRelative1m, null);

const weakShadow: ShockHistoricalOutcomeRecord = {
  ...shadowOnly!,
  caseId: "fixture-weak-shadow",
  score: 5,
  label: "avoid",
  calibrationSignalReturn1m: -12,
  calibrationSignalReturn3m: -20,
  calibrationSignalReturn1y: -30,
  calibrationSignalBenchmarkRelative1m: -10,
  calibrationSignalBenchmarkRelative3m: -18,
  calibrationSignalBenchmarkRelative1y: -25,
};
const calibration = calibrateShockThresholds([record!, weakShadow, unknownEligibility!, unverifiedAnchor!]);
const ge12 = calibration.find(row => row.bucket === "score_ge_12");
const lt12 = calibration.find(row => row.bucket === "score_lt_12");
assert.equal(ge12?.eligibleCases, 1);
assert.equal(ge12?.cases, 1);
assert.equal(ge12?.signalRate, 100);
assert.equal(ge12?.positiveRate1m, 100);
assert.equal(lt12?.eligibleCases, 1);
assert.equal(lt12?.cases, 1, "score<12 shadow signalを比較群へ入れる");
assert.equal(lt12?.signalRate, 100);
assert.equal(lt12?.positiveRate1m, 0);
assert((ge12?.avgBenchmarkRelative1m ?? 0) > (lt12?.avgBenchmarkRelative1m ?? 0));

const legacyProductionSignalOnly = {
  ...record!,
  caseId: "fixture-legacy-production-only",
  thresholdCalibrationEligibilityAtCheckpoint: undefined,
  calibrationFirstEligibleSignalDate: undefined,
  calibrationSignalBenchmarkRelative1m: undefined,
  calibrationSignalBenchmarkRelative3m: undefined,
  calibrationSignalBenchmarkRelative1y: undefined,
} as unknown as ShockHistoricalOutcomeRecord;
assert.equal(legacyProductionSignalOnly.firstEligibleSignalDate, "2026-01-19", "legacy fixtureはproduction signalを保持する");
const calibrationObservations = enrichShockCalibrationObservations(
  [record!, shadowOnly!, legacyProductionSignalOnly],
  [strongCase, lowScoreCase],
);
assert.equal(calibrationObservations[0]?.signalDate, "2026-01-19");
assert.equal(calibrationObservations[0]?.benchmarkRelative3m, 13.9371);
assert.equal(calibrationObservations[1]?.signalDate, "2026-01-19", "低score shadow controlもcalibration observationへ入る");
assert.equal(calibrationObservations[2]?.signalDate, null, "旧production signalだけではthreshold calibrationへ再利用しない");
assert.equal(calibrationObservations[2]?.benchmarkRelative3m, null);

const shadowNoTrade: ShockHistoricalOutcomeRecord = {
  ...record!,
  caseId: "fixture-shadow-no-trade",
  calibrationFirstEligibleSignalDate: null,
  calibrationFirstEligibleSignalPrice: null,
  calibrationSignalShockDrawdownPct: null,
  calibrationSignalRelativeShockDrawdownPct: null,
  calibrationSignalReturn1w: null,
  calibrationSignalReturn1m: null,
  calibrationSignalReturn3m: null,
  calibrationSignalReturn1y: null,
  calibrationSignalBenchmarkRelative1w: null,
  calibrationSignalBenchmarkRelative1m: null,
  calibrationSignalBenchmarkRelative3m: null,
  calibrationSignalBenchmarkRelative1y: null,
};
const withNoTrade = calibrateShockThresholds([record!, shadowNoTrade, unverifiedAnchor!, legacyProductionSignalOnly]);
const withNoTradeGe12 = withNoTrade.find(row => row.bucket === "score_ge_12");
assert.equal(withNoTradeGe12?.eligibleCases, 2, "shadow eligibility+anchorをsignal率の分母に保持する");
assert.equal(withNoTradeGe12?.cases, 1, "no-signalを0% return observationへ変換しない");
assert.equal(withNoTradeGe12?.signalRate, 50, "signal発生率は1/2として別評価する");
assert.equal(withNoTradeGe12?.n1m, 1, "return統計の分母はsignal発生ケースだけ");

assert.deepEqual(outcomeFetchRange(strongCase, "2026-06-01"), { from: "20251231", to: "20260601" });
assert.deepEqual(outcomeFetchRange(strongCase, "2028-01-01"), { from: "20251231", to: "20270428" });
assert.deepEqual(outcomeFetchRangeIso(usCase, "2026-06-01"), { from: "2025-12-31", to: "2026-06-01" });

console.log("idiosyncratic-shock-outcomes tests: production/shadow + signal incidence OK");
