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

function subtract(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

function findComparableStatements(statements: FinancialStatement[]): FinancialStatement[] {
  return [...statements]
    .filter(s => s.NetSales != null || s.OperatingProfit != null || s.Profit != null)
    .sort((a, b) => b.DisclosedDate.localeCompare(a.DisclosedDate));
}

function calcInvestedCapital(statement: FinancialStatement): number | null {
  const equity = statement.Equity ?? statement.NetAssets ?? null;
  const debt = statement.InterestBearingDebt ?? null;
  const cash = statement.CashAndEquivalents ?? null;
  if (equity == null && debt == null) return null;
  return (equity ?? 0) + (debt ?? 0) - (cash ?? 0);
}

function calcFcf(statement: FinancialStatement): number | null {
  const operatingCf = statement.CashFlowsFromOperatingActivities ?? null;
  const capex = statement.CapitalExpenditure ?? null;
  const investingCf = statement.CashFlowsFromInvestingActivities ?? null;

  if (operatingCf != null && capex != null) return operatingCf - Math.abs(capex);
  if (operatingCf != null && investingCf != null) return operatingCf + investingCf;
  return null;
}

function calcMoatScore(input: {
  operatingMargin: number | null;
  operatingMarginYoY: number | null;
  roic: number | null;
  fcfMargin: number | null;
  revenueYoY: number | null;
  operatingProfitYoY: number | null;
}): number {
  let score = 0;

  if (input.operatingMargin != null) {
    if (input.operatingMargin >= 20) score += 2;
    else if (input.operatingMargin >= 10) score += 1;
  }

  if (input.operatingMarginYoY != null) {
    if (input.operatingMarginYoY >= 1) score += 1;
    else if (input.operatingMarginYoY <= -3) score -= 1;
  }

  if (input.roic != null) {
    if (input.roic >= 15) score += 3;
    else if (input.roic >= 8) score += 2;
    else if (input.roic > 0) score += 1;
    else score -= 1;
  }

  if (input.fcfMargin != null) {
    if (input.fcfMargin >= 10) score += 2;
    else if (input.fcfMargin > 0) score += 1;
    else score -= 1;
  }

  if (input.revenueYoY != null && input.operatingProfitYoY != null) {
    if (input.revenueYoY >= 5 && input.operatingProfitYoY >= input.revenueYoY) score += 2;
    else if (input.revenueYoY >= 0 && input.operatingProfitYoY >= 0) score += 1;
  }

  return Math.max(0, Math.min(10, score));
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
      roic: null,
      roe: null,
      fcf: null,
      fcfMargin: null,
      netCash: null,
      equityRatio: null,
      moatScore: 0,
      qualityScore,
      reasons,
      negativeReasons,
      warnings,
    };
  }

  if (!prev) warnings.push("前年比較に必要な過去財務データが不足しています");

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

  const investedCapital = calcInvestedCapital(latest);
  const roic = ratio(latest.OperatingProfit, investedCapital);
  const roe = ratio(latest.Profit, latest.Equity ?? latest.NetAssets);
  const fcf = calcFcf(latest);
  const fcfMargin = ratio(fcf, latest.NetSales);
  const netCash = subtract(latest.CashAndEquivalents, latest.InterestBearingDebt);
  const equityRatio = ratio(latest.Equity ?? latest.NetAssets, latest.TotalAssets);
  const moatScore = calcMoatScore({ operatingMargin, operatingMarginYoY, roic, fcfMargin, revenueYoY, operatingProfitYoY });

  if (revenueYoY == null) warnings.push("売上前年比を計算できませんでした");
  else if (revenueYoY >= 10) {
    qualityScore += 3;
    reasons.push(`売上前年比 +${revenueYoY.toFixed(1)}% と強い成長`);
  } else if (revenueYoY >= 0) {
    qualityScore += 2;
    reasons.push(`売上前年比 +${revenueYoY.toFixed(1)}%`);
  } else negativeReasons.push(`売上前年比 ${revenueYoY.toFixed(1)}%`);

  if (operatingProfitYoY == null) warnings.push("営業利益前年比を計算できませんでした");
  else if (operatingProfitYoY >= 15) {
    qualityScore += 3;
    reasons.push(`営業利益前年比 +${operatingProfitYoY.toFixed(1)}% と利益成長が強い`);
  } else if (operatingProfitYoY >= -10) {
    qualityScore += 1;
    reasons.push(`営業利益前年比 ${operatingProfitYoY >= 0 ? "+" : ""}${operatingProfitYoY.toFixed(1)}% と大崩れなし`);
  } else negativeReasons.push(`営業利益前年比 ${operatingProfitYoY.toFixed(1)}% と悪化`);

  if (operatingMargin == null) warnings.push("営業利益率を計算できませんでした");
  else if (operatingMargin >= 15) {
    qualityScore += 2;
    reasons.push(`営業利益率 ${operatingMargin.toFixed(1)}% と高収益`);
  } else if (operatingMargin >= 5) {
    qualityScore += 1;
    reasons.push(`営業利益率 ${operatingMargin.toFixed(1)}%`);
  } else negativeReasons.push(`営業利益率 ${operatingMargin.toFixed(1)}% と低め`);

  if (operatingMarginYoY != null) {
    if (operatingMarginYoY >= 1) {
      qualityScore += 1;
      reasons.push(`営業利益率が前年差 +${operatingMarginYoY.toFixed(1)}pt 改善`);
    } else if (operatingMarginYoY <= -3) negativeReasons.push(`営業利益率が前年差 ${operatingMarginYoY.toFixed(1)}pt 悪化`);
  }

  if (roic == null) warnings.push("ROICを計算できませんでした（投下資本データ不足）");
  else if (roic >= 15) {
    qualityScore += 2;
    reasons.push(`ROIC ${roic.toFixed(1)}% と資本効率が高い`);
  } else if (roic >= 8) {
    qualityScore += 1;
    reasons.push(`ROIC ${roic.toFixed(1)}%`);
  } else if (roic < 0) negativeReasons.push(`ROIC ${roic.toFixed(1)}% と資本効率に難あり`);

  if (fcf == null) warnings.push("FCFを計算できませんでした（営業CF/投資CF/設備投資データ不足）");
  else if (fcf > 0) {
    qualityScore += 1;
    reasons.push(`FCFがプラス（${Math.round(fcf).toLocaleString()}）`);
  } else negativeReasons.push(`FCFがマイナス（${Math.round(fcf).toLocaleString()}）`);

  if (fcfMargin != null) {
    if (fcfMargin >= 10) {
      qualityScore += 1;
      reasons.push(`FCFマージン ${fcfMargin.toFixed(1)}% と現金創出力が強い`);
    } else if (fcfMargin < 0) negativeReasons.push(`FCFマージン ${fcfMargin.toFixed(1)}%`);
  }

  if (equityRatio == null) warnings.push("自己資本比率を計算できませんでした");
  else if (equityRatio >= 50) {
    qualityScore += 1;
    reasons.push(`自己資本比率 ${equityRatio.toFixed(1)}% と安全性が高い`);
  } else if (equityRatio < 20) negativeReasons.push(`自己資本比率 ${equityRatio.toFixed(1)}% と低め`);

  if (netCash != null) {
    if (netCash > 0) reasons.push("ネットキャッシュ状態の可能性あり");
    else negativeReasons.push("ネット有利子負債状態の可能性あり");
  }

  if (moatScore >= 7) reasons.push(`競争優位スコア ${moatScore}/10 と高め`);
  else if (moatScore <= 3) negativeReasons.push(`競争優位スコア ${moatScore}/10 と弱め`);

  if (forecastRevenueProgressRate != null && forecastRevenueProgressRate >= 75) {
    qualityScore += 1;
    reasons.push(`売上予想進捗率 ${forecastRevenueProgressRate.toFixed(1)}%`);
  }

  if (forecastOperatingProfitProgressRate != null && forecastOperatingProfitProgressRate >= 75) {
    qualityScore += 1;
    reasons.push(`営業利益予想進捗率 ${forecastOperatingProfitProgressRate.toFixed(1)}%`);
  }

  if (hasDownwardRevision === true) negativeReasons.push("会社予想が前回より低下している可能性あり");
  else if (hasDownwardRevision === false) {
    qualityScore += 1;
    reasons.push("会社予想の下方修正は検出されず");
  } else warnings.push("下方修正有無を判定できませんでした");

  return {
    revenueYoY,
    operatingProfitYoY,
    operatingMargin,
    operatingMarginYoY,
    forecastRevenueProgressRate,
    forecastOperatingProfitProgressRate,
    hasDownwardRevision,
    roic,
    roe,
    fcf,
    fcfMargin,
    netCash,
    equityRatio,
    moatScore,
    qualityScore: Math.min(qualityScore, 15),
    reasons,
    negativeReasons,
    warnings,
  };
}
