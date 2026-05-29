import {
  fetchDailyQuotes,
  fetchFinancialStatements,
  calcPriceStats,
  calcFinancialStats,
} from "./jquants.js";
import { getMockData } from "../mock.js";
import type { MockData } from "../mock.js";
import type { Candidate, DataQuality } from "../types.js";
import { dateNDaysAgoJst, daysSinceJst, todayJstCompact } from "../date.js";

export type FetchResult = {
  data: MockData;
  dataQuality: DataQuality;
  warnings: string[];
};

async function fetchRealData(candidate: Candidate): Promise<FetchResult> {
  const warnings: string[] = [];
  const data: MockData = {};

  try {
    const from = dateNDaysAgoJst(365);
    const to = todayJstCompact();
    const quotes = await fetchDailyQuotes(candidate.code, from, to);
    const priceStats = calcPriceStats(quotes);

    if (!priceStats) {
      warnings.push("株価データ不足（5件未満）");
    } else {
      if (candidate.rules.includes("healthy_pullback")) {
        const statements = await fetchFinancialStatements(candidate.code);
        const fin = calcFinancialStats(statements);

        data.pullback = {
          drawdownPct: priceStats.drawdownPct,
          revenueYoY: fin.revenueYoY,
          operatingProfitYoY: fin.operatingProfitYoY,
          hasDownwardRevision: fin.hasDownwardRevision,
          hasStrategicTheme: candidate.tags.length > 0,
        };
      }

      if (candidate.rules.includes("earnings_drop")) {
        const statements = await fetchFinancialStatements(candidate.code);
        const fin = calcFinancialStats(statements);

        // TODO: 決算発表日を特定して翌営業日の騰落を計算する。
        // 現状は直近2営業日の終値差分なので、daily側で過剰通知を抑制する。
        const latestClose = quotes[quotes.length - 1]?.AdjustmentClose ?? null;
        const prevClose = quotes[quotes.length - 2]?.AdjustmentClose ?? null;
        const changePct =
          latestClose != null && prevClose != null && prevClose > 0
            ? ((latestClose - prevClose) / prevClose) * 100
            : null;

        data.earningsDrop = {
          nextDayChangePct: changePct,
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

        const listedAt = candidate.listedAt ?? quotes[0]?.Date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
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
