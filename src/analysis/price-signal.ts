import type { DailyQuote } from "../fetcher/jquants.js";

export type PriceSignalSource = "jquants" | "external" | "company_memory" | "missing";
export type PriceSignalQuality = "exact" | "fallback" | "stale" | "missing";

export type PriceSignal = {
  code: string;
  asOf: string;
  close: number | null;
  change5dPct: number | null;
  change20dPct: number | null;
  topixChange5dPct: number | null;
  topixChange20dPct: number | null;
  relativeTopix5dPct: number | null;
  relativeTopix20dPct: number | null;
  volumeSpikeRatio: number | null;
  source: PriceSignalSource;
  quality: PriceSignalQuality;
};

export type PriceRiskWarning = {
  level: "info" | "warning" | "block";
  reason: string;
  evidence: string[];
};

type CandidatePriceLike = {
  code: string;
  detectedAt?: string;
  currentPrice?: number | null;
  change5dPct?: number | null;
  change20dPct?: number | null;
  topixChange5dPct?: number | null;
  topixChange20dPct?: number | null;
  relativeTopix5dPct?: number | null;
  relativeTopix20dPct?: number | null;
  volumeSpikeRatio?: number | null;
  dataSource?: string;
};

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

function volumeSpikeRatio(sorted: DailyQuote[], days: number): number | null {
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  const prior = sorted.slice(-days - 1, -1);
  if (prior.length === 0) return null;
  const avg = prior.reduce((sum, quote) => sum + quote.AdjustmentVolume, 0) / prior.length;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return latest.AdjustmentVolume / avg;
}

export function emptyPriceSignal(code: string, asOf: string): PriceSignal {
  return {
    code,
    asOf,
    close: null,
    change5dPct: null,
    change20dPct: null,
    topixChange5dPct: null,
    topixChange20dPct: null,
    relativeTopix5dPct: null,
    relativeTopix20dPct: null,
    volumeSpikeRatio: null,
    source: "missing",
    quality: "missing",
  };
}

export function buildPriceSignalFromQuotes(
  code: string,
  quotes: DailyQuote[],
  benchmarkQuotes: DailyQuote[] = []
): PriceSignal {
  const sorted = sortQuotes(quotes);
  const benchmarkSorted = sortQuotes(benchmarkQuotes);
  const latest = sorted[sorted.length - 1];
  if (!latest) return emptyPriceSignal(code, new Date().toISOString().slice(0, 10));

  const change5dPct = returnDays(sorted, 5);
  const change20dPct = returnDays(sorted, 20);
  const topixChange5dPct = benchmarkSorted.length > 0 ? returnDays(benchmarkSorted, 5) : null;
  const topixChange20dPct = benchmarkSorted.length > 0 ? returnDays(benchmarkSorted, 20) : null;

  return {
    code,
    asOf: latest.Date,
    close: latest.AdjustmentClose,
    change5dPct,
    change20dPct,
    topixChange5dPct,
    topixChange20dPct,
    relativeTopix5dPct: change5dPct != null && topixChange5dPct != null ? change5dPct - topixChange5dPct : null,
    relativeTopix20dPct: change20dPct != null && topixChange20dPct != null ? change20dPct - topixChange20dPct : null,
    volumeSpikeRatio: volumeSpikeRatio(sorted, 20),
    source: "jquants",
    quality: "exact",
  };
}

export function buildPriceSignalFromCandidate(candidate: CandidatePriceLike, asOf: string): PriceSignal {
  if (candidate.currentPrice == null) return emptyPriceSignal(candidate.code, asOf);
  const source: PriceSignalSource = candidate.dataSource === "jquants" ? "jquants" : "external";
  const quality: PriceSignalQuality = source === "jquants" ? "exact" : "fallback";
  return {
    code: candidate.code,
    asOf: candidate.detectedAt ?? asOf,
    close: candidate.currentPrice,
    change5dPct: candidate.change5dPct ?? null,
    change20dPct: candidate.change20dPct ?? null,
    topixChange5dPct: candidate.topixChange5dPct ?? null,
    topixChange20dPct: candidate.topixChange20dPct ?? null,
    relativeTopix5dPct: candidate.relativeTopix5dPct ?? null,
    relativeTopix20dPct: candidate.relativeTopix20dPct ?? null,
    volumeSpikeRatio: candidate.volumeSpikeRatio ?? null,
    source,
    quality,
  };
}

export function evaluatePriceRisk(signal: PriceSignal): PriceRiskWarning[] {
  const warnings: PriceRiskWarning[] = [];

  if (signal.quality === "missing") {
    warnings.push({
      level: "warning",
      reason: "価格データが取得できないため、高値判定の信頼度が低い",
      evidence: ["price_signal: missing"],
    });
    return warnings;
  }

  if (signal.source === "company_memory" && signal.quality === "stale") {
    warnings.push({
      level: "warning",
      reason: "直近価格は未取得だが、銘柄メモリに高値追い警告が残っている",
      evidence: ["price_signal: company_memory stale"],
    });
  }

  if (signal.change5dPct !== null && signal.change5dPct >= 8) {
    warnings.push({
      level: "warning",
      reason: "直近5日で大きく上昇しており、高値掴みリスクがある",
      evidence: [`5日騰落率: +${signal.change5dPct.toFixed(1)}%`],
    });
  }

  if (signal.change20dPct !== null && signal.change20dPct >= 20) {
    warnings.push({
      level: "block",
      reason: "直近20日で急騰しており、押し目待ちを優先",
      evidence: [`20日騰落率: +${signal.change20dPct.toFixed(1)}%`],
    });
  }

  if (signal.relativeTopix20dPct !== null && signal.relativeTopix20dPct >= 15) {
    warnings.push({
      level: "warning",
      reason: "TOPIX比で大きく上振れしており、材料が織り込まれている可能性",
      evidence: [`TOPIX比20日: +${signal.relativeTopix20dPct.toFixed(1)}%`],
    });
  }

  if (signal.volumeSpikeRatio !== null && signal.volumeSpikeRatio >= 2.5) {
    warnings.push({
      level: "warning",
      reason: "出来高が急増しており、短期資金が集中している可能性",
      evidence: [`出来高急増率: ${signal.volumeSpikeRatio.toFixed(1)}倍`],
    });
  }

  return warnings;
}
