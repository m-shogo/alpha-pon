import assert from "node:assert/strict";
import { labelShockScore, type HistoricalShockCase } from "../src/idiosyncratic-shock.js";
import {
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

const loadedHistoricalContext = loadHistoricalShockCaseContext();
assert.equal(loadedHistoricalContext.get("mcdonalds-2019-easterbrook")?.strategyEligibilityAtCheckpoint, "confirmed_pass", "reaction anchor overlayでbase eligibilityを壊さない");
assert.equal(loadedHistoricalContext.get("mcdonalds-2019-easterbrook")?.announcementTiming, "non_trading_day");
assert.equal(loadedHistoricalContext.get("mcdonalds-2019-easterbrook")?.priceReactionStartDate, "2019-11-04");
assert.equal(loadedHistoricalContext.get("hp-2010-hurd")?.announcementTiming, "after_close");
assert.equal(loadedHistoricalContext.get("hp-2010-hurd")?.priceReactionStartDate, "2010-08-09");
assert.equal(loadedHistoricalContext.get("sushiro-2023-customer")?.priceReactionStartDate, "2023-01-30");
assert.equal(loadedHistoricalContext.get("skylark-2019-bamiyan")?.priceReactionStartDate, "2019-02-12");
assert.equal(loadedHistoricalContext.get("seven-eleven-2019-employee-video")?.priceReactionStartDate, "2019-02-12");
assert((loadedHistoricalContext.get("hp-2010-hurd")?.reactionAnchorEvidenceSources?.length ?? 0) >= 2, "anchorには再現可能な証拠を保持する");
assert.equal(loadedHistoricalContext.get("sanrio-2026-compensation")?.priceReactionStartDate, "2026-06-01", "既存base sidecarのanchorも維持する");

const lowScoreCase: HistoricalShockCase = { ...strongCase, id: "fixture-low-score", score: 11, label: labelShockScore(11) };
assert.equal(resolveHistoricalStrategyEligibility(lowScoreCase, verifiedPassContext), "confirmed_block", "score<12は手動PASSでも確定BLOCK");
const accountingBlockCase: HistoricalShockCase = {
  ...strongCase,
  id: "fixture-accounting-block",
  scores: { ...strongCase.scores, accountingIntegrity: 0 },
};
assert.equal(resolveHistoricalStrategyEligibility(accountingBlockCase, verifiedPassContext), "confirmed_block", "accountingIntegrity=0は確定BLOCK");
const macroBlockCase: HistoricalShockCase = { ...strongCase, id: "fixture-macro-block", macroPrimaryCause: true };
assert.equal(resolveHistoricalStrategyEligibility(macroBlockCase, verifiedPassContext), "confirmed_block", "macro主因は確定BLOCK");
assert.equal(resolveHistoricalStrategyEligibility(strongCase, { ...verifiedPassContext, strategyInvestigationStatusAtCheckpoint: "open" }), "confirmed_block", "open investigationは確定BLOCK");
assert.equal(resolveHistoricalStrategyEligibility(strongCase, { ...verifiedPassContext, strategyCriticalLicenseOrDelistingRiskAtCheckpoint: true }), "confirmed_block", "critical license/delisting riskは確定BLOCK");
assert.equal(resolveHistoricalStrategyEligibility(strongCase, { ...verifiedPassContext, confounderStatus: "major" }), "confirmed_block", "major confounderは確定BLOCK");

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
  strategyEligibilityAtCheckpoint: "confirmed_pass",
});
assert(record, "JP4桁tickerはoutcomeを生成できる");
assert.equal(record?.strategyEligibilityAtCheckpoint, "confirmed_pass");
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

const unknownEligibility = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01");
assert(unknownEligibility);
assert.equal(unknownEligibility?.strategyEligibilityAtCheckpoint, "unknown");
assert.equal(unknownEligibility?.firstEligibleSignalDate, null, "非価格hard gate未確認なら価格条件が良くてもsignalを生成しない");
assert.equal(unknownEligibility?.signalBenchmarkRelative3m, null);

const blockedEligibility = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  strategyEligibilityAtCheckpoint: "confirmed_block",
});
assert(blockedEligibility);
assert.equal(blockedEligibility?.firstEligibleSignalDate, null, "非価格hard gate BLOCKを価格反発で上書きしない");

const shiftedReaction = buildShockHistoricalOutcome(strongCase, stock, benchmark, "2027-02-01", {
  reactionStartDate: "2026-01-13",
  strategyEligibilityAtCheckpoint: "confirmed_pass",
});
assert(shiftedReaction);
assert.equal(shiftedReaction?.reactionStartDate, "2026-01-13");
assert.equal(shiftedReaction?.preEventDate, "2026-01-12", "reaction anchor変更時はpre-event基準も追随");

const usCase: HistoricalShockCase = { ...strongCase, id: "fixture-us", ticker: "MCD", country: "US" };
const overseas = buildShockHistoricalOutcome(usCase, stock, benchmark, "2027-02-01", {
  strategyEligibilityAtCheckpoint: "confirmed_pass",
});
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
const calibration = calibrateShockThresholds([record!, weakRecord, unknownEligibility!]);
const ge12 = calibration.find(row => row.bucket === "score_ge_12");
const lt12 = calibration.find(row => row.bucket === "score_lt_12");
assert.equal(ge12?.cases, 1, "unknown eligibilityをcalibration分母へ入れない");
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
assert.equal(withNoTrade.find(row => row.bucket === "score_ge_12")?.cases, 1, "confirmed-pass no-tradeを0%として分母へ入れない");

assert.deepEqual(outcomeFetchRange(strongCase, "2026-06-01"), { from: "20251231", to: "20260601" });
assert.deepEqual(outcomeFetchRange(strongCase, "2028-01-01"), { from: "20251231", to: "20270428" });
assert.deepEqual(outcomeFetchRangeIso(usCase, "2026-06-01"), { from: "2025-12-31", to: "2026-06-01" });

console.log("idiosyncratic-shock-outcomes tests: OK");
