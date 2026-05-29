import type { DailyQuote } from "../fetcher/jquants.js";
import type { MarketContext } from "../types.js";

function sortQuotes(quotes: DailyQuote[]): DailyQuote[] {
  return [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));
}

function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from <= 0) return null;
  return ((to - from) / from) * 100;
}

function returnDays(sorted: DailyQuote[], days: number): number | null {
  if (sorted.length < days + 1) return null;
  const latest = sorted[sorted.length - 1];
  const past = sorted[sorted.length - 1 - days];
  return pctChange(past.AdjustmentClose, latest.AdjustmentClose);
}

function avgLiquidityYen(sorted: DailyQuote[], days: number): number | null {
  const slice = sorted.slice(-days);
  if (slice.length === 0) return null;

  const values = slice
    .map(q => q.AdjustmentClose * q.AdjustmentVolume)
    .filter(v => Number.isFinite(v) && v > 0);

  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function volatilityPct(sorted: DailyQuote[], days: number): number | null {
  const slice = sorted.slice(-(days + 1));
  if (slice.length < 2) return null;

  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const r = pctChange(slice[i - 1].AdjustmentClose, slice[i].AdjustmentClose);
    if (r != null) returns.push(r);
  }

  if (returns.length < 2) return null;

  const avg = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

export function buildMarketContext(
  code: string,
  quotes: DailyQuote[],
  topixQuotes: DailyQuote[] = []
): MarketContext {
  const warnings: string[] = [];
  const sorted = sortQuotes(quotes);
  const topixSorted = sortQuotes(topixQuotes);
  const latest = sorted[sorted.length - 1];

  if (sorted.length < 60) {
    warnings.push("市場文脈分析に必要な株価データが60営業日未満です");
  }

  const return5d = returnDays(sorted, 5);
  const return20d = returnDays(sorted, 20);
  const return60d = returnDays(sorted, 60);
  const topixReturn20d = topixSorted.length > 0 ? returnDays(topixSorted, 20) : null;
  const relativeToTopix20d =
    return20d != null && topixReturn20d != null ? return20d - topixReturn20d : null;
  const liquidityYen20d = avgLiquidityYen(sorted, 20);
  const volatility20d = volatilityPct(sorted, 20);

  if (liquidityYen20d != null && liquidityYen20d < 100_000_000) {
    warnings.push("20日平均売買代金が1億円未満で流動性リスクがあります");
  }

  if (volatility20d != null && volatility20d > 5) {
    warnings.push("20日ボラティリティが高く値動きが荒いです");
  }

  return {
    code,
    date: latest?.Date ?? "",
    return5d,
    return20d,
    return60d,
    topixReturn20d,
    relativeToTopix20d,
    liquidityYen20d,
    volatility20d,
    warnings,
  };
}
