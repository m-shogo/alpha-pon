import {
  fetchDailyQuotes,
  fetchFinancialStatements,
  calcPriceStats,
  calcFinancialStats,
} from "./jquants.js";
import { getMockData } from "../mock.js";
import type { MockData } from "../mock.js";
import type { Candidate, DataQuality } from "../types.js";

export type FetchResult = {
  data: MockData;
  dataQuality: DataQuality;
  warnings: string[];
};

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0].replace(/-/g, "");
}

function today(): string {
  return new Date().toISOString().split("T")[0].replace(/-/g, "");
}

async function fetchRealData(candidate: Candidate): Promise<FetchResult> {
  const warnings: string[] = [];
  const data: MockData = {};

  try {
    const from = dateNDaysAgo(365);
    const to = today();
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
          revenueYoY: fin.revenueYoY ?? 0,
          operatingProfitYoY: fin.operatingProfitYoY ?? 0,
          hasDownwardRevision: fin.hasDownwardRevision,
          hasStrategicTheme: candidate.tags.length > 0,
        };
      }

      if (candidate.rules.includes("earnings_drop")) {
        const statements = await fetchFinancialStatements(candidate.code);
        const fin = calcFinancialStats(statements);

        // 決算翌日の騰落は直近の開示日翌日を見る（簡易版）
        const latestClose = quotes[quotes.length - 1]?.AdjustmentClose ?? 0;
        const prevClose = quotes[quotes.length - 2]?.AdjustmentClose ?? latestClose;
        const changePct = prevClose > 0 ? ((latestClose - prevClose) / prevClose) * 100 : 0;

        data.earningsDrop = {
          nextDayChangePct: changePct,
          hasDownwardRevision: fin.hasDownwardRevision,
          revenueYoY: fin.revenueYoY ?? 0,
          operatingProfitYoY: fin.operatingProfitYoY ?? 0,
          hasStrategicTheme: candidate.tags.length > 0,
        };
      }

      if (
        candidate.rules.includes("ipo_selling_pressure_done") ||
        candidate.rules.includes("volume_cooling") ||
        candidate.rules.includes("no_new_low")
      ) {
        // 上場初日を取得（最古のデータを使う）
        const firstDayVolume = quotes[0]?.AdjustmentVolume ?? 1;
        const latestVolume = quotes[quotes.length - 1]?.AdjustmentVolume ?? 0;
        const volumeRatioToFirstDay = firstDayVolume > 0 ? latestVolume / firstDayVolume : 1;

        // 直近10日で安値更新なし
        const last10 = quotes.slice(-10);
        const last11 = quotes.slice(-11, -10);
        const recentLow = Math.min(...last10.map(q => q.Low));
        const baseLow = last11[0]?.Low ?? recentLow + 1;
        const noNewLow = recentLow >= baseLow;

        // 上場日数（データの先頭が上場日と仮定）
        const firstDate = new Date(
          quotes[0]?.Date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") ?? ""
        );
        const daysSinceListing = isNaN(firstDate.getTime())
          ? 0
          : Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

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
    return { data, dataQuality, warnings: [] };
  }

  // J-Quantsが設定されていればリアルデータ、なければモックにフォールバック
  const hasJquants = !!process.env.JQUANTS_EMAIL && !!process.env.JQUANTS_PASSWORD;
  if (!hasJquants) {
    const data = getMockData(candidate.code);
    const dataQuality: DataQuality = Object.keys(data).length > 0 ? "ok" : "missing";
    return {
      data,
      dataQuality,
      warnings: ["JQUANTS_EMAIL/PASSWORDが未設定のためモックデータを使用"],
    };
  }

  return fetchRealData(candidate);
}
