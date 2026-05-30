import {
  fetchDailyQuotes,
  fetchFinancialStatements,
  calcPriceStats,
  calcFinancialStats,
} from "./jquants.js";
import type { DailyQuote, FinancialStatement } from "./jquants.js";
import { fetchTdnetDisclosures, type TdnetDisclosure } from "./jpx.js";
import { fetchEdinetDocList, type EdinetDoc } from "./edinet.js";
import { getMockData } from "../mock.js";
import type { MockData } from "../mock.js";
import type { Candidate, DataQuality } from "../types.js";
import { dateNDaysAgoJst, daysSinceJst, todayJst, todayJstCompact, toCompactDate } from "../date.js";
import { buildMarketContext } from "../analysis/market-context.js";
import { buildFinancialQuality } from "../analysis/financial-quality.js";
import { buildPrimaryDisclosureReview } from "../analysis/primary-disclosure-review.js";

export type FetchResult = {
  data: MockData;
  dataQuality: DataQuality;
  warnings: string[];
};

type PrimaryDisclosureCache = {
  loaded: boolean;
  tdnetDisclosures: TdnetDisclosure[];
  edinetDocs: EdinetDoc[];
  errors: string[];
};

// J-Quantsの指数コードが環境で取れない場合に備え、TOPIX連動ETF等へ差し替え可能にする。
// 例: MARKET_BENCHMARK_CODE=1306
const MARKET_BENCHMARK_CODE = process.env.MARKET_BENCHMARK_CODE ?? "1306";
const primaryDisclosureCache: PrimaryDisclosureCache = {
  loaded: false,
  tdnetDisclosures: [],
  edinetDocs: [],
  errors: [],
};

function normalizeDate(date: string): string {
  if (/^\d{8}$/.test(date)) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  return date;
}

function compactQuoteDate(date: string): string {
  return toCompactDate(normalizeDate(date));
}

function findLatestEarningsStatement(statements: FinancialStatement[]): FinancialStatement | null {
  const earnings = statements
    .filter(s =>
      s.TypeOfDocument.includes("FinancialStatements") ||
      s.TypeOfDocument.includes("Earnings") ||
      s.TypeOfDocument.includes("Q") ||
      s.TypeOfDocument.includes("Annual")
    )
    .sort((a, b) => b.DisclosedDate.localeCompare(a.DisclosedDate));

  return earnings[0] ?? null;
}

function calcEarningsNextDayChange(
  quotes: DailyQuote[],
  statements: FinancialStatement[]
): { changePct: number | null; warning?: string } {
  const latestStatement = findLatestEarningsStatement(statements);
  if (!latestStatement?.DisclosedDate) {
    return { changePct: null, warning: "決算開示日を特定できませんでした" };
  }

  const disclosed = toCompactDate(normalizeDate(latestStatement.DisclosedDate));
  const sorted = [...quotes].sort((a, b) => compactQuoteDate(a.Date).localeCompare(compactQuoteDate(b.Date)));
  const prev = [...sorted].reverse().find(q => compactQuoteDate(q.Date) < disclosed);
  const next = sorted.find(q => compactQuoteDate(q.Date) > disclosed);

  if (!prev || !next) {
    return { changePct: null, warning: "決算前後の株価データが不足しています" };
  }

  if (prev.AdjustmentClose <= 0) {
    return { changePct: null, warning: "決算前営業日の終値が不正です" };
  }

  return {
    changePct: ((next.AdjustmentClose - prev.AdjustmentClose) / prev.AdjustmentClose) * 100,
  };
}

async function tryFetchBenchmarkQuotes(
  from: string,
  to: string,
  warnings: string[]
): Promise<DailyQuote[]> {
  try {
    const quotes = await fetchDailyQuotes(MARKET_BENCHMARK_CODE, from, to);
    if (quotes.length === 0) {
      warnings.push(`市場ベンチマーク(${MARKET_BENCHMARK_CODE})の日足が空でした`);
    }
    return quotes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`市場ベンチマーク(${MARKET_BENCHMARK_CODE})取得失敗: ${message}`);
    return [];
  }
}

async function loadPrimaryDisclosureCache(): Promise<PrimaryDisclosureCache> {
  if (primaryDisclosureCache.loaded) return primaryDisclosureCache;
  primaryDisclosureCache.loaded = true;

  try {
    primaryDisclosureCache.tdnetDisclosures = await fetchTdnetDisclosures();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    primaryDisclosureCache.errors.push(`TDnet取得失敗: ${message}`);
  }

  try {
    primaryDisclosureCache.edinetDocs = await fetchEdinetDocList(todayJst());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    primaryDisclosureCache.errors.push(`EDINET取得失敗: ${message}`);
  }

  return primaryDisclosureCache;
}

async function attachPrimaryDisclosureReview(candidate: Candidate, data: MockData, warnings: string[]): Promise<void> {
  const cache = await loadPrimaryDisclosureCache();
  const review = buildPrimaryDisclosureReview({
    candidate,
    tdnetDisclosures: cache.tdnetDisclosures,
    edinetDocs: cache.edinetDocs,
    fetchErrors: cache.errors,
  });

  data.primaryDisclosureReview = review;

  if (review.decision === "missing") {
    warnings.push("一次情報レビュー: 当日TDnet/EDINETで該当開示なし。ニュース材料は裏取り前提で扱う");
  }
  if (review.decision === "caution") {
    warnings.push(...review.warnings.map(warning => `一次情報注意: ${warning}`));
  }
  if (review.decision === "block") {
    warnings.push(...review.blockers.map(blocker => `一次情報ブロッカー: ${blocker}`));
  }
}

async function fetchRealData(candidate: Candidate): Promise<FetchResult> {
  const warnings: string[] = [];
  const data: MockData = {};

  try {
    const from = dateNDaysAgoJst(365);
    const to = todayJstCompact();
    const quotes = await fetchDailyQuotes(candidate.code, from, to);
    const priceStats = calcPriceStats(quotes);
    const benchmarkQuotes = await tryFetchBenchmarkQuotes(from, to, warnings);
    const statements = await fetchFinancialStatements(candidate.code);
    const fin = calcFinancialStats(statements);

    if (!priceStats) {
      warnings.push("株価データ不足（5件未満）");
    } else {
      data.marketContext = buildMarketContext(candidate.code, quotes, benchmarkQuotes);
      warnings.push(...data.marketContext.warnings);

      data.financialQuality = buildFinancialQuality(statements);
      warnings.push(...data.financialQuality.warnings);

      if (candidate.rules.includes("healthy_pullback")) {
        data.pullback = {
          drawdownPct: priceStats.drawdownPct,
          revenueYoY: fin.revenueYoY,
          operatingProfitYoY: fin.operatingProfitYoY,
          hasDownwardRevision: fin.hasDownwardRevision,
          hasStrategicTheme: candidate.tags.length > 0,
        };
      }

      if (candidate.rules.includes("earnings_drop")) {
        const earningsMove = calcEarningsNextDayChange(quotes, statements);

        if (earningsMove.warning) {
          warnings.push(earningsMove.warning);
        }

        data.earningsDrop = {
          nextDayChangePct: earningsMove.changePct,
          hasDownwardRevision: fin.hasDownwardRevision,
          revenueYoY: fin.revenueYoY,
          operatingProfitYoY: fin.operatingProfitYoY,
          hasStrategicTheme: candidate.tags.length > 0,
        };
      }

      if (
        candidate.rules.includes("ipo_selling_pressure_done") ||
        candidate.rules.includes("volume_cooling") ||
        candidate.rules.includes("no_new_low")
      ) {
        const firstDayVolume = quotes[0]?.AdjustmentVolume ?? 1;
        const latestVolume = quotes[quotes.length - 1]?.AdjustmentVolume ?? 0;
        const volumeRatioToFirstDay = firstDayVolume > 0 ? latestVolume / firstDayVolume : 1;

        // 直近10日で安値更新なし
        const last10 = quotes.slice(-10);
        const last11 = quotes.slice(-11, -10);
        const recentLow = Math.min(...last10.map(q => q.Low));
        const baseLow = last11[0]?.Low ?? recentLow + 1;
        const noNewLow = recentLow >= baseLow;

        const oldestQuoteDate = quotes[0]?.Date ? normalizeDate(quotes[0].Date) : undefined;
        const listedAt = candidate.listedAt ?? oldestQuoteDate;
        const daysSinceListing = listedAt ? daysSinceJst(listedAt) ?? 0 : 0;

        if (!candidate.listedAt) {
          warnings.push("listedAt未設定のため、取得できた最古株価日を上場日として暫定利用");
        }

        data.ipo = {
          daysSinceListing,
          volumeRatioToFirstDay,
          noNewLowDays: noNewLow ? 10 : 0,
          recoveredMa20: priceStats.recoveredMa20,
          lockupPassed: daysSinceListing > 90,
        };
      }
    }

    await attachPrimaryDisclosureReview(candidate, data, warnings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`データ取得失敗: ${message}`);
  }

  const hasAnyData = Object.keys(data).length > 0;
  const dataQuality: DataQuality = hasAnyData
    ? warnings.length > 0
      ? "partial"
      : "ok"
    : "missing";

  return { data, dataQuality, warnings };
}

export async function fetchCandidateData(
  candidate: Candidate,
  useMock: boolean
): Promise<FetchResult> {
  if (useMock) {
    const data = getMockData(candidate.code);
    const dataQuality: DataQuality = Object.keys(data).length > 0 ? "ok" : "missing";
    return { data, dataQuality, warnings: ["明示的にモックデータを使用中"] };
  }

  const hasJquants = !!process.env.JQUANTS_EMAIL && !!process.env.JQUANTS_PASSWORD;
  if (!hasJquants) {
    return {
      data: {},
      dataQuality: "missing",
      warnings: ["JQUANTS_EMAIL/PASSWORDが未設定のため、本番ではモックデータを使用しません"],
    };
  }

  return fetchRealData(candidate);
}
