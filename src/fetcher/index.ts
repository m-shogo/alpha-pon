import {
  fetchDailyQuotes,
  fetchFinancialStatements,
  calcPriceStats,
  calcFinancialStats,
} from "./jquants.js";
import type { DailyQuote, FinancialStatement } from "./jquants.js";
import { getMockData } from "../mock.js";
import type { MockData } from "../mock.js";
import type { Candidate, DataQuality } from "../types.js";
import { dateNDaysAgoJst, daysSinceJst, todayJstCompact, toCompactDate } from "../date.js";
import { buildMarketContext } from "../analysis/market-context.js";
import { buildFinancialQuality } from "../analysis/financial-quality.js";

export type FetchResult = {
  data: MockData;
  dataQuality: DataQuality;
  warnings: string[];
};

const TOPIX_CODE = "0000";

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

async function tryFetchTopixQuotes(from: string, to: string): Promise<DailyQuote[]> {
  try {
    return await fetchDailyQuotes(TOPIX_CODE, from, to);
  } catch {
    return [];
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
    const topixQuotes = await tryFetchTopixQuotes(from, to);
    const statements = await fetchFinancialStatements(candidate.code);
    const fin = calcFinancialStats(statements);

    if (!priceStats) {
      warnings.push("株価データ不足（5件未満）");
    } else {
      data.marketContext = buildMarketContext(candidate.code, quotes, topixQuotes);
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
