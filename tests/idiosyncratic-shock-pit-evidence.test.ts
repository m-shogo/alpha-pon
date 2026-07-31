import assert from "node:assert/strict";
import { labelShockScore, type HistoricalShockCase } from "../src/idiosyncratic-shock.js";
import {
  isHistoricalEligibilityEvidenceAvailableAtCheckpoint,
  resolveHistoricalStrategyEligibilityDetailed,
  resolveHistoricalThresholdCalibrationEligibilityDetailed,
  type HistoricalShockCaseContext,
} from "../src/idiosyncratic-shock-case-context.js";

const item: HistoricalShockCase = {
  id: "fixture-pit-evidence",
  company: "Fixture PIT",
  ticker: "9999",
  country: "JP",
  eventDate: "2026-01-12",
  decisionCheckpoint: "2026-01-13",
  category: "executive_relationship",
  actorType: "executive",
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
  // deliberately insufficient source gate: one major-media only.
  sources: [{
    title: "initial report",
    url: "https://example.com/news",
    sourceType: "major_media",
    publishedAt: "2026-01-12",
  }],
  researchConfidence: "high",
};

const baseContext: HistoricalShockCaseContext = {
  strategyEligibilityAtCheckpoint: "confirmed_pass",
  strategyInvestigationStatusAtCheckpoint: "substantially_complete",
  strategyCriticalLicenseOrDelistingRiskAtCheckpoint: false,
  confounderStatus: "clear",
};

const checkpointSource = {
  title: "JPX checkpoint filing",
  url: "https://www2.jpx.co.jp/disc/99990/example.pdf",
  sourceType: "exchange" as const,
  publishedAt: "2026-01-13",
};
const futureSource = { ...checkpointSource, title: "JPX future filing", publishedAt: "2026-01-14" };
const missingDateSource = { ...checkpointSource, title: "JPX undated filing", publishedAt: null };

assert.equal(isHistoricalEligibilityEvidenceAvailableAtCheckpoint(checkpointSource, item.decisionCheckpoint), true);
assert.equal(isHistoricalEligibilityEvidenceAvailableAtCheckpoint(futureSource, item.decisionCheckpoint), false);
assert.equal(isHistoricalEligibilityEvidenceAvailableAtCheckpoint(missingDateSource, item.decisionCheckpoint), false);

const pass = resolveHistoricalStrategyEligibilityDetailed(item, {
  ...baseContext,
  strategyEligibilityEvidenceSources: [checkpointSource],
});
assert.equal(pass.status, "confirmed_pass", "checkpoint当日までに公開済みのtrusted primaryはPASS gateへ使える");

const future = resolveHistoricalStrategyEligibilityDetailed(item, {
  ...baseContext,
  strategyEligibilityEvidenceSources: [futureSource],
});
assert.equal(future.status, "unknown", "checkpoint後の一次情報だけでhistorical PASSを作らない");
assert(future.missingEvidence.some(value => value.includes("available by checkpoint")));

const missingDate = resolveHistoricalStrategyEligibilityDetailed(item, {
  ...baseContext,
  strategyEligibilityEvidenceSources: [missingDateSource],
});
assert.equal(missingDate.status, "unknown", "後付けeligibility evidenceはpublishedAt欠落ならfail-closed");

const historicalFuturePrimary: HistoricalShockCase = {
  ...item,
  id: "fixture-historical-future-primary",
  sources: [{
    title: "issuer future release",
    url: "https://example-issuer.com/release",
    sourceType: "company",
    publishedAt: "2026-01-14",
  }],
};
assert.equal(
  resolveHistoricalStrategyEligibilityDetailed(historicalFuturePrimary, baseContext).status,
  "unknown",
  "case本体sourceでもpublishedAtが明示されcheckpoint後ならsource gateから除外する",
);

const historicalUndatedPrimary: HistoricalShockCase = {
  ...item,
  id: "fixture-historical-undated-primary",
  sources: [{
    title: "legacy issuer source",
    url: "https://example-issuer.com/archive",
    sourceType: "company",
    publishedAt: null,
  }],
};
assert.equal(
  resolveHistoricalStrategyEligibilityDetailed(historicalUndatedPrimary, baseContext).status,
  "confirmed_pass",
  "既存historical provenanceのundated sourceは後方互換を維持する。後付けeligibility evidenceだけpublishedAt必須",
);

const lowScore: HistoricalShockCase = { ...item, id: "fixture-low-score-pit", score: 11, label: labelShockScore(11) };
const lowScoreCalibrationBase: HistoricalShockCaseContext = {
  ...baseContext,
  strategyEligibilityAtCheckpoint: "confirmed_block",
  calibrationEligibilityAtCheckpoint: "confirmed_pass",
  calibrationEligibilityNotes: "score thresholdだけを外したshadow review",
};
assert.equal(
  resolveHistoricalThresholdCalibrationEligibilityDetailed(lowScore, {
    ...lowScoreCalibrationBase,
    strategyEligibilityEvidenceSources: [checkpointSource],
  }).status,
  "confirmed_pass",
);
assert.equal(
  resolveHistoricalThresholdCalibrationEligibilityDetailed(lowScore, {
    ...lowScoreCalibrationBase,
    strategyEligibilityEvidenceSources: [futureSource],
  }).status,
  "unknown",
  "shadow calibrationも未来sourceでPASSを作らない",
);

console.log("idiosyncratic-shock PIT eligibility evidence tests: OK");
