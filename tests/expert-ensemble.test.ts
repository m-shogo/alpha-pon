import assert from "node:assert/strict";
import { buildExpertEnsembleReview } from "../src/analysis/expert-ensemble.js";
import type { Candidate, FinancialQuality, HypeRisk, MarketContext, RiskReview } from "../src/types.js";

const candidate: Candidate = {
  code: "9999",
  name: "テスト銘柄",
  market: "TSE",
  status: "research",
  priority: "A",
  tags: ["software"],
  rules: ["healthy_pullback"],
};

const goodMarket: MarketContext = {
  code: "9999",
  date: "20260131",
  return5d: 2,
  return20d: 8,
  return60d: 15,
  topixReturn20d: 3,
  relativeToTopix20d: 5,
  liquidityYen20d: 1_500_000_000,
  volatility20d: 2.5,
  warnings: [],
};

const goodFinancial: FinancialQuality = {
  revenueYoY: 12,
  operatingProfitYoY: 20,
  operatingMargin: 15,
  operatingMarginYoY: 2,
  forecastRevenueProgressRate: 80,
  forecastOperatingProfitProgressRate: 82,
  hasDownwardRevision: false,
  qualityScore: 8,
  reasons: ["財務品質が高い"],
  negativeReasons: [],
  warnings: [],
};

const lowHype: HypeRisk = {
  score: 10,
  level: "low",
  reasons: [],
  warnings: [],
};

const goodRiskReview: RiskReview = {
  decision: "watch",
  blockers: [],
  warnings: [],
  strengths: ["市場対比で強い"],
  checklist: {
    circleOfCompetence: true,
    businessQuality: true,
    financialSafety: true,
    marketRelativeStrength: true,
    liquidityOk: true,
    volatilityOk: true,
    noDownwardRevision: true,
    noFomo: true,
    enoughData: true,
  },
};

function testStrongOrPassWhenManyLensesAgree() {
  const result = buildExpertEnsembleReview({
    candidate,
    score: 88,
    dataQuality: "ok",
    reasons: ["良好"],
    negativeReasons: [],
    warnings: [],
    marketContext: goodMarket,
    financialQuality: goodFinancial,
    hypeRisk: lowHype,
    riskReview: goodRiskReview,
  });

  assert.notEqual(result.finalVerdict, "block");
  assert.ok(result.consensusScore >= 60);
  assert.ok(result.passCount + result.strongCount > result.blockCount);
}

function testBlockWhenDataQualityIsMissing() {
  const result = buildExpertEnsembleReview({
    candidate,
    score: 90,
    dataQuality: "missing",
    reasons: ["スコアは高い"],
    negativeReasons: [],
    warnings: ["データ取得失敗"],
    marketContext: undefined,
    financialQuality: undefined,
    hypeRisk: lowHype,
    riskReview: { ...goodRiskReview, decision: "reject", blockers: ["データ品質が missing です"] },
  });

  assert.equal(result.finalVerdict, "block");
  assert.ok(result.requiredBeforeNotification.length > 0);
}

function testBlockWhenHypeIsHighAndRisky() {
  const highHype: HypeRisk = {
    score: 80,
    level: "high",
    reasons: ["短期急騰"],
    warnings: ["過熱リスクが高い"],
  };

  const riskyMarket: MarketContext = {
    ...goodMarket,
    return5d: 25,
    return20d: 45,
    volatility20d: 7,
  };

  const result = buildExpertEnsembleReview({
    candidate: { ...candidate, tags: ["ai", "ipo"], rules: ["ipo_selling_pressure_done"] },
    score: 92,
    dataQuality: "ok",
    reasons: ["テーマ性あり"],
    negativeReasons: ["流行・短期急騰による過熱リスクが高い"],
    warnings: ["過熱確認が必要"],
    marketContext: riskyMarket,
    financialQuality: goodFinancial,
    hypeRisk: highHype,
    riskReview: { ...goodRiskReview, decision: "reject", blockers: ["流行・短期急騰による過熱リスクが高いです"] },
  });

  assert.equal(result.finalVerdict, "block");
  assert.ok(result.disagreements.some(d => d.includes("過熱") || d.includes("急騰")));
}

function main() {
  testStrongOrPassWhenManyLensesAgree();
  testBlockWhenDataQualityIsMissing();
  testBlockWhenHypeIsHighAndRisky();
  console.log("expert-ensemble.test.ts passed");
}

main();
