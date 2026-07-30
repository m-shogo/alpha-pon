// Twelve Data 日足クライアント。
// 海外企業固有ショックの価格 / benchmark比較用。API key未設定時は呼び出さない。
// Official docs: https://twelvedata.com/docs

const BASE_URL = "https://api.twelvedata.com";
const responseCache = new Map<string, TwelveDataDailyQuote[]>();
let lastRequestAt = 0;

export type TwelveDataDailyQuote = {
  Symbol: string;
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  AdjustmentClose: number;
  AdjustmentVolume: number;
};

type TimeSeriesValue = {
  datetime: string;
  open?: string | number | null;
  high?: string | number | null;
  low?: string | number | null;
  close?: string | number | null;
  volume?: string | number | null;
};

type TimeSeriesPayload = {
  status?: string;
  code?: number;
  message?: string;
  meta?: {
    symbol?: string;
    currency?: string;
    exchange?: string;
    exchange_timezone?: string;
  };
  values?: TimeSeriesValue[];
};

export function isTwelveDataConfigured(): boolean {
  return Boolean(process.env.TWELVE_DATA_API_KEY);
}

function requestTimeoutMs(): number {
  return Math.max(1000, Number(process.env.TWELVE_DATA_REQUEST_TIMEOUT_MS ?? "15000"));
}

function requestIntervalMs(): number {
  // Free BasicはAPI credits/minuteが小さいため、既定では8秒間隔で保守運用する。
  return Math.max(0, Number(process.env.TWELVE_DATA_REQUEST_INTERVAL_MS ?? "8000"));
}

async function waitForRateLimit(): Promise<void> {
  const waitMs = Math.max(0, lastRequestAt + requestIntervalMs() - Date.now());
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

function numberOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(value: string): string {
  return value.slice(0, 10);
}

async function requestTimeSeries(symbol: string, from: string, to: string): Promise<TimeSeriesPayload> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY が未設定");

  const params = new URLSearchParams({
    symbol,
    interval: "1day",
    start_date: from,
    end_date: to,
    adjust: "splits",
    timezone: "Exchange",
    format: "JSON",
  });
  const url = `${BASE_URL}/time_series?${params.toString()}`;
  const maxAttempts = Math.max(1, Number(process.env.TWELVE_DATA_RETRY_ATTEMPTS ?? "3"));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForRateLimit();
    const response = await fetch(url, {
      headers: {
        Authorization: `apikey ${apiKey}`,
        "User-Agent": "alpha-pon/0.1",
      },
      signal: AbortSignal.timeout(requestTimeoutMs()),
    });

    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 10_000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
    const payload = await response.json() as TimeSeriesPayload;
    if (payload.status === "error" || payload.code) {
      throw new Error(`Twelve Data API ${payload.code ?? "error"}: ${payload.message ?? "unknown error"}`);
    }
    return payload;
  }

  throw new Error("Twelve Data retry failed");
}

export async function fetchTwelveDataDailyQuotes(
  symbol: string,
  from: string,
  to: string,
): Promise<TwelveDataDailyQuote[]> {
  const cacheKey = `${symbol}:${from}:${to}`;
  const cached = responseCache.get(cacheKey);
  if (cached) return cached.map(row => ({ ...row }));

  const payload = await requestTimeSeries(symbol, from, to);
  const canonicalSymbol = payload.meta?.symbol ?? symbol;
  const rows = (payload.values ?? [])
    .map(value => {
      const close = numberOrZero(value.close);
      const volume = numberOrZero(value.volume);
      return {
        Symbol: canonicalSymbol,
        Date: normalizeDate(value.datetime),
        Open: numberOrZero(value.open),
        High: numberOrZero(value.high),
        Low: numberOrZero(value.low),
        Close: close,
        Volume: volume,
        // Twelve Dataの日/週/月価格はsplit-adjusted。shock用途ではsplit adjustmentを使用する。
        AdjustmentClose: close,
        AdjustmentVolume: volume,
      } satisfies TwelveDataDailyQuote;
    })
    .filter(row => row.AdjustmentClose > 0)
    .sort((a, b) => a.Date.localeCompare(b.Date));

  responseCache.set(cacheKey, rows);
  return rows.map(row => ({ ...row }));
}
