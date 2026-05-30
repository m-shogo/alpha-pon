import { fetchDailyQuotes, type DailyQuote } from "../fetcher/jquants.js";
import { toCompactDate } from "../date.js";
import type { AnalogyExpectedDirection, AnalogyOutcomeDirection, AnalogyOutcomeQuality, AnalogyPredictionRecord } from "./analogy-db.js";

const MARKET_BENCHMARK_CODE = process.env.MARKET_BENCHMARK_CODE ?? "1306";

export type PriceReviewResult = {
  available: boolean;
  benchmarkCode?: string;
  startDate?: string;
  endDate?: string;
  startClose?: number;
  endClose?: number;
  returnPct?: number;
  benchmarkReturnPct?: number;
  relativeReturnPct?: number;
  maxDrawdownPct?: number;
  benchmarkMaxDrawdownPct?: number;
  dataAvailability: "price_and_benchmark" | "price_only" | "missing";
  direction: AnalogyOutcomeDirection;
  quality: AnalogyOutcomeQuality;
  actualOutcome: string;
  whatMatched: string[];
  whatDiffered: string[];
  missedSignals: string[];
  improvedRuleIdeas: string[];
};

function normalizeDate(date: string): string {
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date;
}

function compact(date: string): string {
  return toCompactDate(normalizeDate(date));
}

function sortedQuotes(quotes: DailyQuote[]): DailyQuote[] {
  return [...quotes].sort((a, b) => compact(a.Date).localeCompare(compact(b.Date)));
}

function findOnOrAfter(quotes: DailyQuote[], date: string): DailyQuote | undefined {
  const target = toCompactDate(date);
  return sortedQuotes(quotes).find(q => compact(q.Date) >= target);
}

function findOnOrBefore(quotes: DailyQuote[], date: string): DailyQuote | undefined {
  const target = toCompactDate(date);
  return [...sortedQuotes(quotes)].reverse().find(q => compact(q.Date) <= target);
}

function quoteRange(quotes: DailyQuote[], start?: DailyQuote, end?: DailyQuote): DailyQuote[] {
  if (!start || !end) return [];
  const startKey = compact(start.Date);
  const endKey = compact(end.Date);
  return sortedQuotes(quotes).filter(q => {
    const key = compact(q.Date);
    return key >= startKey && key <= endKey;
  });
}

function calcReturn(start?: DailyQuote, end?: DailyQuote): number | null {
  if (!start || !end || start.AdjustmentClose <= 0) return null;
  return ((end.AdjustmentClose - start.AdjustmentClose) / start.AdjustmentClose) * 100;
}

function calcMaxDrawdownPct(quotes: DailyQuote[]): number | null {
  if (quotes.length === 0) return null;
  let peak = quotes[0]?.AdjustmentClose ?? 0;
  let maxDrawdown = 0;

  for (const quote of quotes) {
    if (quote.AdjustmentClose > peak) peak = quote.AdjustmentClose;
    if (peak <= 0) continue;
    const drawdown = ((quote.AdjustmentClose - peak) / peak) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  return maxDrawdown;
}

function classifyDirection(expected: AnalogyExpectedDirection, relativeReturnPct: number | null): AnalogyOutcomeDirection {
  if (relativeReturnPct == null) return "unknown";
  const threshold = Number(process.env.ANALOGY_REVIEW_RELATIVE_THRESHOLD_PCT ?? "2");

  if (expected === "up") {
    if (relativeReturnPct >= threshold) return "same";
    if (relativeReturnPct <= -threshold) return "opposite";
    return "mixed";
  }

  if (expected === "down" || expected === "risk_off") {
    if (relativeReturnPct <= -threshold) return "same";
    if (relativeReturnPct >= threshold) return "opposite";
    return "mixed";
  }

  if (expected === "mixed") {
    return Math.abs(relativeReturnPct) >= threshold ? "same" : "mixed";
  }

  return "unknown";
}

function qualityFromDirection(direction: AnalogyOutcomeDirection): AnalogyOutcomeQuality {
  if (direction === "same") return "useful";
  if (direction === "opposite") return "misleading";
  if (direction === "mixed") return "unknown";
  return "too_early";
}

function fmt(value: number | null | undefined): string {
  if (value == null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export async function reviewPredictionWithPrice(prediction: AnalogyPredictionRecord): Promise<PriceReviewResult> {
  if (!prediction.candidateCode) {
    return {
      available: false,
      dataAvailability: "missing",
      direction: "unknown",
      quality: "too_early",
      actualOutcome: "銘柄コードがない世界イベント予想のため、価格ベースの自動判定は未実施。追加ニュースで人間確認する。",
      whatMatched: [],
      whatDiffered: [],
      missedSignals: ["銘柄コードなし", "追加ニュース未確認"],
      improvedRuleIdeas: ["世界イベント予想は関連ETF/指数/代表銘柄に接続してレビューする"],
    };
  }

  const from = toCompactDate(prediction.createdAt);
  const to = toCompactDate(prediction.reviewDueAt);

  try {
    const [quotes, benchmarkQuotes] = await Promise.all([
      fetchDailyQuotes(prediction.candidateCode, from, to),
      fetchDailyQuotes(MARKET_BENCHMARK_CODE, from, to),
    ]);

    const start = findOnOrAfter(quotes, prediction.createdAt);
    const end = findOnOrBefore(quotes, prediction.reviewDueAt);
    const bStart = findOnOrAfter(benchmarkQuotes, prediction.createdAt);
    const bEnd = findOnOrBefore(benchmarkQuotes, prediction.reviewDueAt);
    const returnPct = calcReturn(start, end);
    const benchmarkReturnPct = calcReturn(bStart, bEnd);
    const relativeReturnPct = returnPct != null && benchmarkReturnPct != null ? returnPct - benchmarkReturnPct : null;
    const maxDrawdownPct = calcMaxDrawdownPct(quoteRange(quotes, start, end));
    const benchmarkMaxDrawdownPct = calcMaxDrawdownPct(quoteRange(benchmarkQuotes, bStart, bEnd));
    const dataAvailability = returnPct != null && benchmarkReturnPct != null
      ? "price_and_benchmark"
      : returnPct != null
        ? "price_only"
        : "missing";
    const direction = classifyDirection(prediction.expectedDirection, relativeReturnPct);
    const quality = qualityFromDirection(direction);

    if (returnPct == null) {
      return {
        available: false,
        benchmarkCode: MARKET_BENCHMARK_CODE,
        dataAvailability,
        direction: "unknown",
        quality: "too_early",
        actualOutcome: "価格データが不足しているため、まだ自動判定しない。",
        whatMatched: [],
        whatDiffered: [],
        missedSignals: ["価格データ不足", "営業日/上場日/コードを確認"],
        improvedRuleIdeas: ["取得期間を広げる", "銘柄コードと市場を確認する"],
      };
    }

    return {
      available: dataAvailability === "price_and_benchmark",
      benchmarkCode: MARKET_BENCHMARK_CODE,
      startDate: start?.Date,
      endDate: end?.Date,
      startClose: start?.AdjustmentClose,
      endClose: end?.AdjustmentClose,
      returnPct,
      benchmarkReturnPct: benchmarkReturnPct ?? undefined,
      relativeReturnPct: relativeReturnPct ?? undefined,
      maxDrawdownPct: maxDrawdownPct ?? undefined,
      benchmarkMaxDrawdownPct: benchmarkMaxDrawdownPct ?? undefined,
      dataAvailability,
      direction,
      quality,
      actualOutcome: `価格レビュー: ${prediction.candidateCode} ${prediction.timeframe} return=${fmt(returnPct)}, benchmark=${fmt(benchmarkReturnPct)}, relative=${fmt(relativeReturnPct)}, maxDD=${fmt(maxDrawdownPct)}。expected=${prediction.expectedDirection} に対して ${direction} 判定。`,
      whatMatched: direction === "same" ? [`予想方向(${prediction.expectedDirection})と相対リターンの方向が概ね一致`] : [],
      whatDiffered: direction === "opposite" ? [`予想方向(${prediction.expectedDirection})と相対リターンが逆方向`] : direction === "mixed" ? ["相対リターンが閾値内または曖昧"] : [],
      missedSignals: direction === "opposite" ? ["市場が織り込み済みだった可能性", "個別材料より地合い/別材料が強かった可能性", "反証条件の確認不足"] : [],
      improvedRuleIdeas: direction === "opposite"
        ? ["反証条件の重みを上げる", "市場全体要因と個別要因を分離する", "ニュース発生前後の織り込み度を確認する"]
        : direction === "same"
          ? ["同型事例の条件を維持し、類似タグの有効性を継続確認する"]
          : ["閾値内の曖昧判定は追加ニュースと出来高で補助判定する"],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      benchmarkCode: MARKET_BENCHMARK_CODE,
      dataAvailability: "missing",
      direction: "unknown",
      quality: "too_early",
      actualOutcome: `価格レビュー取得失敗: ${message}`,
      whatMatched: [],
      whatDiffered: [],
      missedSignals: ["J-Quants取得失敗", message],
      improvedRuleIdeas: ["JQUANTS_EMAIL/PASSWORDとMARKET_BENCHMARK_CODEを確認する", "取得失敗時は手動レビューへ回す"],
    };
  }
}
