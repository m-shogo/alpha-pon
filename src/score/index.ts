import { scoreIpoSellingPressure } from "./ipo.js";
import { scoreStructuralEvent } from "./structural.js";
import { scoreEarningsDrop } from "./earnings.js";
import { scoreHealthyPullback } from "./pullback.js";
import { todayJst } from "../date.js";
import type {
  Candidate,
  ScoreBreakdown,
  ScoreResult,
  AlertLevel,
  ThemesConfig,
  MarketContext,
  FinancialQuality,
} from "../types.js";
import type { MockData } from "../mock.js";

function getAlertLevel(total: number, thresholds: { urgent: number; daily: number; log: number }): AlertLevel {
  if (total >= thresholds.urgent) return "urgent";
  if (total >= thresholds.daily) return "daily";
  if (total >= thresholds.log) return "log";
  return "ignore";
}

function sumBreakdown(b: ScoreBreakdown): number {
  return b.structuralEvent + b.supplyDemand + b.valuation + b.theme + b.businessSafety + b.aiReview;
}

function scoreThemes(tags: string[], themes: ThemesConfig): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const tag of tags) {
    const theme = themes.themes[tag];
    if (theme) {
      score += theme.score;
      reasons.push(`テーマ: ${theme.label}`);
    }
  }
  return { score: Math.min(score, 15), reasons };
}

function applyMarketContext(
  context: MarketContext,
  breakdown: ScoreBreakdown,
  reasons: string[],
  negativeReasons: string[],
  warnings: string[]
): void {
  warnings.push(...context.warnings);

  if (context.relativeToTopix20d != null) {
    if (context.relativeToTopix20d >= 5) {
      breakdown.supplyDemand = Math.min(25, breakdown.supplyDemand + 3);
      reasons.push(`TOPIX比20日 +${context.relativeToTopix20d.toFixed(1)}pt と相対的に強い`);
    } else if (context.relativeToTopix20d <= -5) {
      negativeReasons.push(`TOPIX比20日 ${context.relativeToTopix20d.toFixed(1)}pt と市場比で弱い`);
    }
  } else {
    warnings.push("TOPIX比20日を計算できませんでした");
  }

  if (context.liquidityYen20d != null) {
    if (context.liquidityYen20d >= 1_000_000_000) {
      breakdown.supplyDemand = Math.min(25, breakdown.supplyDemand + 2);
      reasons.push("20日平均売買代金が10億円以上で流動性あり");
    } else if (context.liquidityYen20d < 100_000_000) {
      negativeReasons.push("20日平均売買代金が1億円未満で流動性リスク");
    }
  }

  if (context.volatility20d != null && context.volatility20d > 5) {
    negativeReasons.push(`20日ボラティリティ ${context.volatility20d.toFixed(1)}% と値動きが荒い`);
  }
}

function applyFinancialQuality(
  quality: FinancialQuality,
  breakdown: ScoreBreakdown,
  reasons: string[],
  negativeReasons: string[],
  warnings: string[]
): void {
  breakdown.businessSafety = Math.min(10, breakdown.businessSafety + quality.qualityScore);
  reasons.push(...quality.reasons.slice(0, 4));
  negativeReasons.push(...quality.negativeReasons.slice(0, 4));
  warnings.push(...quality.warnings);
}

export function scoreCandidate(
  candidate: Candidate,
  mock: MockData,
  themes: ThemesConfig,
  thresholds = { urgent: 85, daily: 70, log: 50 }
): ScoreResult {
  const breakdown: ScoreBreakdown = {
    structuralEvent: 0,
    supplyDemand: 0,
    valuation: 0,
    theme: 0,
    businessSafety: 0,
    aiReview: 0,
  };
  const reasons: string[] = [];
  const negativeReasons: string[] = [];
  const nextSteps: string[] = [];
  const warnings: string[] = [];

  if (candidate.rules.includes("ipo_selling_pressure_done") && mock.ipo) {
    const r = scoreIpoSellingPressure(mock.ipo);
    breakdown.supplyDemand = Math.min(25, breakdown.supplyDemand + r.score);
    reasons.push(...r.reasons);
    nextSteps.push(...r.nextSteps);
  }

  if (candidate.rules.includes("structural_event") && mock.structural) {
    const r = scoreStructuralEvent(mock.structural.text);
    breakdown.structuralEvent = Math.min(30, breakdown.structuralEvent + r.score);
    reasons.push(...r.reasons);
    nextSteps.push(...r.nextSteps);
  }

  if (candidate.rules.includes("earnings_drop") && mock.earningsDrop) {
    const r = scoreEarningsDrop(mock.earningsDrop);
    // 決算急落は需給と業績安全性に振り分け
    breakdown.supplyDemand = Math.min(25, breakdown.supplyDemand + Math.floor(r.score * 0.6));
    breakdown.businessSafety = Math.min(10, breakdown.businessSafety + Math.floor(r.score * 0.4));
    reasons.push(...r.reasons);
    negativeReasons.push(...r.negativeReasons);
    nextSteps.push(...r.nextSteps);
  }

  if (candidate.rules.includes("healthy_pullback") && mock.pullback) {
    const r = scoreHealthyPullback(mock.pullback);
    breakdown.valuation = Math.min(15, breakdown.valuation + Math.floor(r.score * 0.6));
    breakdown.businessSafety = Math.min(10, breakdown.businessSafety + Math.floor(r.score * 0.4));
    reasons.push(...r.reasons);
    negativeReasons.push(...r.negativeReasons);
    nextSteps.push(...r.nextSteps);
  }

  if (mock.marketContext) {
    applyMarketContext(mock.marketContext, breakdown, reasons, negativeReasons, warnings);
  }

  if (mock.financialQuality) {
    applyFinancialQuality(mock.financialQuality, breakdown, reasons, negativeReasons, warnings);
  }

  const themeResult = scoreThemes(candidate.tags, themes);
  breakdown.theme = themeResult.score;
  reasons.push(...themeResult.reasons);

  const dataQuality = mock.ipo || mock.earningsDrop || mock.pullback || mock.structural || mock.marketContext || mock.financialQuality
    ? "ok"
    : "missing";

  if (dataQuality === "missing") {
    warnings.push("実データ未取得（モックデータなし）");
  }

  const score = Math.min(100, sumBreakdown(breakdown));
  const alertLevel = getAlertLevel(score, thresholds);

  // 重複除去
  const uniqueNextSteps = [...new Set(nextSteps)].slice(0, 5);

  return {
    candidate,
    breakdown,
    score,
    alertLevel,
    reasons,
    negativeReasons,
    nextSteps: uniqueNextSteps,
    dataQuality,
    warnings,
    createdAt: todayJst(),
    marketContext: mock.marketContext,
    financialQuality: mock.financialQuality,
  };
}

export function shouldSuppressAlert(
  currentScore: number,
  history: { lastScore: number; daysSinceLastAlert: number },
  suppressionDays: number,
  improvementThreshold: number
): boolean {
  const scoreImproved = currentScore - history.lastScore >= improvementThreshold;
  if (history.daysSinceLastAlert <= suppressionDays && !scoreImproved) {
    return true;
  }
  return false;
}
