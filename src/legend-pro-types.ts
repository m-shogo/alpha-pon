// バフェット以外の伝説級投資家・株Pro思考モデル
// 注意: 売買推奨ではなく、調査品質・保留・証拠不足・避ける判断のための型。

export type LegendFinalLabel = "調査候補" | "保留" | "証拠不足" | "避ける";

export type ProLegendAgentId =
  | "munger_bias_agent"
  | "marks_cycle_agent"
  | "soros_reflexivity_agent"
  | "druckenmiller_asymmetry_agent"
  | "lynch_story_agent"
  | "klarman_margin_agent"
  | "greenblatt_quality_value_agent"
  | "simons_statistical_edge_agent"
  | "dalio_regime_agent"
  | "thorp_risk_of_ruin_agent";

export type LegendAgentVerdict = {
  agentId: ProLegendAgentId;
  label: string;
  stance: LegendFinalLabel;
  confidence: number;
  positiveEvidence: string[];
  negativeEvidence: string[];
  missingEvidence: string[];
  blockerReasons: string[];
};

export type BiasRisk = {
  code: string;
  biasTypes: Array<"confirmation_bias" | "recency_bias" | "fomo" | "brand_love" | "overconfidence" | "narrative_fallacy">;
  evidence: string[];
  penalty: number;
};

export type MarketCycleSignal = {
  asOf: string;
  cyclePhase: "panic" | "early_recovery" | "mid_cycle" | "late_cycle" | "euphoria" | "unknown";
  riskAppetite: number;
  evidence: string[];
  warnings: string[];
};

export type ReflexivitySignal = {
  code: string;
  loopType: "positive_feedback" | "negative_feedback" | "reflexive_bubble" | "reflexive_crash" | "none" | "unknown";
  priceEvidence: string[];
  narrativeEvidence: string[];
  breakSignals: string[];
};

export type AsymmetryScore = {
  code: string;
  upsideScenarioPct: number | null;
  downsideScenarioPct: number | null;
  asymmetryRatio: number | null;
  macroAlignment: "aligned" | "mixed" | "against" | "unknown";
  label: "asymmetric_watch" | "balanced" | "downside_heavy" | "unknown";
};

export type LynchStoryCheck = {
  code: string;
  story: string;
  simpleExplanation: string;
  growthEvidence: string[];
  pegLikeRisk: "reasonable_growth" | "growth_too_expensive" | "growth_unproven" | "unknown";
  missingEvidence: string[];
};

export type MarginOfSafetyCheck = {
  code: string;
  assetSupport: "strong" | "some" | "weak" | "unknown";
  downsideProtection: "strong" | "some" | "weak" | "unknown";
  catalyst: string[];
  marginOfSafetyLabel: "clear_safety_margin" | "some_safety_margin" | "no_safety_margin" | "unknown";
};

export type QualityValueRank = {
  code: string;
  qualityRank: number | null;
  valueRank: number | null;
  combinedRank: number | null;
  label: "quality_and_value" | "quality_but_expensive" | "cheap_but_low_quality" | "unknown";
};

export type StatisticalEdgeCheck = {
  ruleId: string;
  sampleSize: number;
  hitRate: number | null;
  avgExcessReturn: number | null;
  medianExcessReturn: number | null;
  maxDrawdown: number | null;
  reliability: "sample_too_small" | "weak" | "moderate" | "strong";
  overfitWarnings: string[];
};

export type RegimeExposure = {
  code: string;
  exposures: {
    interestRate: "positive" | "negative" | "neutral" | "unknown";
    inflation: "positive" | "negative" | "neutral" | "unknown";
    yenWeakness: "positive" | "negative" | "neutral" | "unknown";
    recession: "positive" | "negative" | "neutral" | "unknown";
  };
  concentrationRisk: string[];
};

export type RiskOfRuinCheck = {
  code: string;
  historicalMaxDrawdown: number | null;
  volatility20d: number | null;
  losingStreakRisk: "low" | "middle" | "high" | "unknown";
  edgeReliability: "sample_too_small" | "weak" | "moderate" | "strong";
  warning: string[];
};
