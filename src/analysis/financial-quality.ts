import type { FinancialStatement } from "../fetcher/jquants.js";
import type { FinancialQuality } from "../types.js";

function pctChange(prev: number | null | undefined, latest: number | null | undefined): number | null {
  if (prev == null || latest == null || Math.abs(prev) <= 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function findComparableStatements(statements: FinancialStatement[]): FinancialStatement[] {
  return [...statements]
    .filter(s => s.NetSales != null || s.OperatingProfit != null)
    .sort((a, b) => b.DisclosedDate.localeCompare(a.DisclosedDate));
}

export function buildFinancialQuality(statements: FinancialStatement[]): FinancialQuality {
  const reasons: string[] = [];
  const negativeReasons: string[] = [];
  const warnings: string[] = [];
  let qualityScore = 0;

  const comparable = findComparableStatements(statements);
  const latest = comparable[0];
  const prev = comparable[1];

  if (!latest) {
    warnings.push("財務データが取得できませんでした");
    return {
      revenueYoY: null,
      operatingProfitYoY: null,
      operatingMargin: null,
      operatingMarginYoY: null,
      forecastRevenueProgressRate: null,
      forecastOperatingProfitProgressRate: null,
      hasDownwardRevision: null,
      qualityScore,
      reasons,
      negativeReasons,
      warnings,
    };
  }

  if (!prev) {
    warnings.push("前年比較に必要な過去財務データが不足しています");
  }

  const revenueYoY = prev ? pctChange(prev.NetSales, latest.NetSales) : null;
  const operatingProfitYoY = prev ? pctChange(prev.OperatingProfit, latest.OperatingProfit) : null;
  const operatingMargin = ratio(latest.OperatingProfit, latest.NetSales);
  const prevOperatingMargin = prev ? ratio(prev.OperatingProfit, prev.NetSales) : null;
  const operatingMarginYoY =
    operatingMargin != null && prevOperatingMargin != null
      ? operatingMargin - prevOperatingMargin
      : null;
  const forecastRevenueProgressRate = ratio(latest.NetSales, latest.ForecastNetSales);
  const forecastOperatingProfitProgressRate = ratio(latest.OperatingProfit, latest.ForecastOperatingProfit);
  const hasDownwardRevision =
    latest.ForecastNetSales != null &&
    prev?.ForecastNetSales != null
      ? latest.ForecastNetSales < prev.ForecastNetSales
      : null;

  if (revenueYoY == null) {
    warnings.push("売上前年比を計算できませんでした");
  } else if (revenueYoY >= 10) {
    qualityScore += 3;
    reasons.push(`売上前年比 +${revenueYoY.toFixed(1)}% と強い成長`);
  } else if (revenueYoY >= 0) {
    qualityScore += 2;
    reasons.push(`売上前年比 +${revenueYoY.toFixed(1)}%`);
  } else {
    negativeReasons.push(`売上前年比 ${revenueYoY.toFixed(1)}%`);
  }

  if (operatingProfitYoY == null) {
    warnings.push("営業利益前年比を計算できませんでした");
  } else if (operatingProfitYoY >= 15) {
    qualityScore += 3;
    reasons.push(`営業利益前年比 +${operatingProfitYoY.toFixed(1)}% と利益成長が強い`);
  } else if (operatingProfitYoY >= -10) {
    qualityScore += 1;
    reasons.push(`営業利益前年比 ${operatingProfitYoY >= 0 ? "+" : ""}${operatingProfitYoY.toFixed(1)}% と大崩れなし`);
  } else {
    negativeReasons.push(`営業利益前年比 ${operatingProfitYoY.toFixed(1)}% と悪化`);
  }

  if (operatingMargin == null) {
    warnings.push("営業利益率を計算できませんでした");
  } else if (operatingMargin >= 15) {
    qualityScore += 2;
    reasons.push(`営業利益率 ${operatingMargin.toFixed(1)}% と高収益`);
  } else if (operatingMargin >= 5) {
    qualityScore += 1;
    reasons.push(`営業利益率 ${operatingMargin.toFixed(1)}%`);
  } else {
    negativeReasons.push(`営業利益率 ${operatingMargin.toFixed(1)}% と低め`);
  }

  if (operatingMarginYoY != null) {
    if (operatingMarginYoY >= 1) {
      qualityScore += 1;
      reasons.push(`営業利益率が前年差 +${operatingMarginYoY.toFixed(1)}pt 改善`);
    } else if (operatingMarginYoY <= -3) {
      negativeReasons.push(`営業利益率が前年差 ${operatingMarginYoY.toFixed(1)}pt 悪化`);
    }
  }

  if (forecastRevenueProgressRate != null && forecastRevenueProgressRate >= 75) {
    qualityScore += 1;
    reasons.push(`売上予想進捗率 ${forecastRevenueProgressRate.toFixed(1)}%`);
  }

  if (forecastOperatingProfitProgressRate != null && forecastOperatingProfitProgressRate >= 75) {
    qualityScore += 1;
    reasons.push(`営業利益予想進捗率 ${forecastOperatingProfitProgressRate.toFixed(1)}%`);
  }

  if (hasDownwardRevision === true) {
    negativeReasons.push("会社予想が前回より低下している可能性あり");
  } else if (hasDownwardRevision === false) {
    qualityScore += 1;
    reasons.push("会社予想の下方修正は検出されず");
  } else {
    warnings.push("下方修正有無を判定できませんでした");
  }

  return {
    revenueYoY,
    operatingProfitYoY,
    operatingMargin,
    operatingMarginYoY,
    forecastRevenueProgressRate,
    forecastOperatingProfitProgressRate,
    hasDownwardRevision,
    qualityScore: Math.min(qualityScore, 10),
    reasons,
    negativeReasons,
    warnings,
  };
}
