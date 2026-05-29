import type {
  IpoPressureInput,
  EarningsDropInput,
  PullbackInput,
  MarketContext,
  FinancialQuality,
} from "./types.js";

export type MockData = {
  ipo?: IpoPressureInput;
  structural?: { text: string };
  earningsDrop?: EarningsDropInput;
  pullback?: PullbackInput;
  marketContext?: MarketContext;
  financialQuality?: FinancialQuality;
};

// v0.1 仮データ
// 実データ取得（J-Quants / EDINET）を追加したら差し替える
const mockDatabase: Record<string, MockData> = {
  "285A": {
    ipo: {
      daysSinceListing: 75,
      volumeRatioToFirstDay: 0.18,
      noNewLowDays: 12,
      recoveredMa20: false,
      lockupPassed: true,
    },
  },
  "8136": {
    pullback: {
      drawdownPct: -22,
      revenueYoY: 5.2,
      operatingProfitYoY: -3.1,
      hasDownwardRevision: false,
      hasStrategicTheme: true,
    },
    earningsDrop: {
      nextDayChangePct: -7.5,
      hasDownwardRevision: false,
      revenueYoY: 5.2,
      operatingProfitYoY: -3.1,
      hasStrategicTheme: true,
    },
  },
};

export function getMockData(code: string): MockData {
  const data = mockDatabase[code];
  if (!data) return {};
  return data;
}
