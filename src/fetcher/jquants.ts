// J-Quants API クライアント
// Docs: https://jpx-jquants.com/

const V1_BASE_URL = "https://api.jquants.com/v1";
const V2_BASE_URL = "https://api.jquants.com/v2";

type TokenCache = {
  idToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let lastV2RequestAt = 0;

function requestTimeoutMs(): number {
  return Math.max(1000, Number(process.env.JQUANTS_REQUEST_TIMEOUT_MS ?? "15000"));
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(requestTimeoutMs());
}

export function isJQuantsConfigured(): boolean {
  return Boolean(
    process.env.JQUANTS_API_KEY ||
    (process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD)
  );
}

function toCompactDate(date: string): string {
  return date.replace(/-/g, "");
}

function compactFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function v2DateCapCompact(): string {
  const delayDays = Number(process.env.JQUANTS_V2_DATA_DELAY_DAYS ?? "84");
  return compactFromDate(addDays(new Date(), -delayDays));
}

function normalizeV2QuoteRange(from: string, to: string): { from: string; to: string } {
  const compactFrom = toCompactDate(from);
  const compactTo = toCompactDate(to);
  const cap = v2DateCapCompact();
  const cappedTo = compactTo > cap ? cap : compactTo;
  const cappedFrom = compactFrom > cappedTo ? cappedTo : compactFrom;
  return { from: cappedFrom, to: cappedTo };
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getRefreshToken(): Promise<string> {
  const email = process.env.JQUANTS_EMAIL;
  const password = process.env.JQUANTS_PASSWORD;
  if (!email || !password) {
    throw new Error("JQUANTS_EMAIL / JQUANTS_PASSWORD が未設定");
  }

  const res = await fetch(`${V1_BASE_URL}/token/auth_user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailaddress: email, password }),
    signal: timeoutSignal(),
  });

  if (!res.ok) {
    throw new Error(`J-Quants認証失敗: ${res.status}`);
  }

  const data = (await res.json()) as { refreshToken: string };
  return data.refreshToken;
}

async function getIdToken(refreshToken: string): Promise<string> {
  const res = await fetch(
    `${V1_BASE_URL}/token/auth_refresh?refreshtoken=${encodeURIComponent(refreshToken)}`,
    { method: "POST", signal: timeoutSignal() }
  );

  if (!res.ok) {
    throw new Error(`J-Quants IDトークン取得失敗: ${res.status}`);
  }

  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

async function ensureToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.idToken;
  }

  const refreshToken = await getRefreshToken();
  const idToken = await getIdToken(refreshToken);
  tokenCache = { idToken, expiresAt: now + 23 * 60 * 60 * 1000 };
  return idToken;
}

async function getV1<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await ensureToken();
  const query = new URLSearchParams(params).toString();
  const url = `${V1_BASE_URL}${path}${query ? "?" + query : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: timeoutSignal(),
  });

  if (!res.ok) {
    throw new Error(`J-Quants V1 APIエラー ${path}: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function getV2Paginated<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const apiKey = process.env.JQUANTS_API_KEY;
  if (!apiKey) throw new Error("JQUANTS_API_KEY が未設定");

  const rows: T[] = [];
  const queryParams = { ...params };

  while (true) {
    await waitForV2RateLimit();
    const query = new URLSearchParams(queryParams).toString();
    const url = `${V2_BASE_URL}${path}${query ? "?" + query : ""}`;
    const res = await fetchV2(url, apiKey);

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json() as { message?: string };
        detail = body.message ? `: ${body.message}` : "";
      } catch {
        detail = "";
      }
      throw new Error(`J-Quants V2 APIエラー ${path}: ${res.status}${detail}`);
    }

    const payload = await res.json() as { data?: T[]; pagination_key?: string };
    rows.push(...(payload.data ?? []));
    if (!payload.pagination_key) break;
    queryParams.pagination_key = payload.pagination_key;
  }

  return rows;
}

async function waitForV2RateLimit(): Promise<void> {
  const intervalMs = Number(process.env.JQUANTS_V2_REQUEST_INTERVAL_MS ?? "3000");
  const waitMs = Math.max(0, lastV2RequestAt + intervalMs - Date.now());
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  lastV2RequestAt = Date.now();
}

async function fetchV2(url: string, apiKey: string): Promise<Response> {
  const maxAttempts = Number(process.env.JQUANTS_V2_RETRY_ATTEMPTS ?? "5");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "User-Agent": "alpha-pon/0.1",
      },
      signal: timeoutSignal(),
    });
    if (res.status !== 429 || attempt === maxAttempts) return res;
    await new Promise(resolve => setTimeout(resolve, attempt * 10000));
  }
  throw new Error("J-Quants V2 retry failed");
}

export type DailyQuote = {
  Code: string;
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  AdjustmentFactor: number;
  AdjustmentClose: number;
  AdjustmentVolume: number;
};

type V2DailyQuote = {
  Code: string;
  Date: string;
  O: number | null;
  H: number | null;
  L: number | null;
  C: number | null;
  Vo: number | null;
  AdjFactor: number | null;
  AdjC: number | null;
  AdjVo: number | null;
};

export type FinancialStatement = {
  DisclosedDate: string;
  DisclosedTime: string;
  LocalCode: string;
  NetSales: number | null;
  OperatingProfit: number | null;
  OrdinaryProfit: number | null;
  Profit: number | null;
  ForecastNetSales: number | null;
  ForecastOperatingProfit: number | null;
  TypeOfDocument: string;
  // J-Quantsのプラン/銘柄/書類により欠損する可能性があるため任意扱い。
  TotalAssets?: number | null;
  Equity?: number | null;
  NetAssets?: number | null;
  InterestBearingDebt?: number | null;
  CashAndEquivalents?: number | null;
  CashFlowsFromOperatingActivities?: number | null;
  CashFlowsFromInvestingActivities?: number | null;
  CashFlowsFromFinancingActivities?: number | null;
  Depreciation?: number | null;
  CapitalExpenditure?: number | null;
};

type V2FinancialSummary = {
  DiscDate: string;
  DiscTime: string;
  Code: string;
  DocType?: string;
  CurPerType?: string;
  Sales?: number | string | null;
  OP?: number | string | null;
  OdP?: number | string | null;
  NP?: number | string | null;
  FSales?: number | string | null;
  FOP?: number | string | null;
  TA?: number | string | null;
  Eq?: number | string | null;
  CashEq?: number | string | null;
  CFO?: number | string | null;
  CFI?: number | string | null;
  CFF?: number | string | null;
};

function normalizeV2Quote(row: V2DailyQuote): DailyQuote {
  return {
    Code: row.Code,
    Date: toCompactDate(row.Date),
    Open: row.O ?? 0,
    High: row.H ?? 0,
    Low: row.L ?? 0,
    Close: row.C ?? 0,
    Volume: row.Vo ?? 0,
    AdjustmentFactor: row.AdjFactor ?? 1,
    AdjustmentClose: row.AdjC ?? row.C ?? 0,
    AdjustmentVolume: row.AdjVo ?? row.Vo ?? 0,
  };
}

function normalizeV1Quote(row: DailyQuote): DailyQuote {
  return { ...row, Date: toCompactDate(row.Date) };
}

function normalizeV2Financial(row: V2FinancialSummary): FinancialStatement {
  const docType = [row.DocType, row.CurPerType].filter(Boolean).join(" ");
  return {
    DisclosedDate: row.DiscDate,
    DisclosedTime: row.DiscTime,
    LocalCode: row.Code,
    NetSales: numberOrNull(row.Sales),
    OperatingProfit: numberOrNull(row.OP),
    OrdinaryProfit: numberOrNull(row.OdP),
    Profit: numberOrNull(row.NP),
    ForecastNetSales: numberOrNull(row.FSales),
    ForecastOperatingProfit: numberOrNull(row.FOP),
    TypeOfDocument: docType,
    TotalAssets: numberOrNull(row.TA),
    Equity: numberOrNull(row.Eq),
    CashAndEquivalents: numberOrNull(row.CashEq),
    CashFlowsFromOperatingActivities: numberOrNull(row.CFO),
    CashFlowsFromInvestingActivities: numberOrNull(row.CFI),
    CashFlowsFromFinancingActivities: numberOrNull(row.CFF),
  };
}

export async function fetchDailyQuotes(
  code: string,
  from: string,
  to: string
): Promise<DailyQuote[]> {
  if (process.env.JQUANTS_API_KEY) {
    const range = normalizeV2QuoteRange(from, to);
    const rows = await getV2Paginated<V2DailyQuote>("/equities/bars/daily", {
      code,
      from: range.from,
      to: range.to,
    });
    return rows.map(normalizeV2Quote);
  }

  const data = await getV1<{ daily_quotes: DailyQuote[] }>("/prices/daily_quotes", {
    code,
    from,
    to,
  });
  return (data.daily_quotes ?? []).map(normalizeV1Quote);
}

export async function fetchFinancialStatements(
  code: string
): Promise<FinancialStatement[]> {
  if (process.env.JQUANTS_API_KEY) {
    const rows = await getV2Paginated<V2FinancialSummary>("/fins/summary", {
      code,
    });
    return rows.map(normalizeV2Financial);
  }

  const data = await getV1<{ statements: FinancialStatement[] }>("/fins/statements", {
    code,
  });
  return data.statements ?? [];
}

export type PriceStats = {
  current: number;
  high52w: number;
  drawdownPct: number;
  ma20: number;
  recoveredMa20: boolean;
  volumeAvg20: number;
  latestVolume: number;
  volumeRatioToAvg: number;
};

export function calcPriceStats(quotes: DailyQuote[]): PriceStats | null {
  if (quotes.length < 5) return null;

  const sorted = [...quotes].sort((a, b) => a.Date.localeCompare(b.Date));
  const latest = sorted[sorted.length - 1];
  const current = latest.AdjustmentClose;
  const year252 = sorted.slice(-252);
  const high52w = Math.max(...year252.map(q => q.AdjustmentClose));
  const drawdownPct = ((current - high52w) / high52w) * 100;
  const last20 = sorted.slice(-20).map(q => q.AdjustmentClose);
  const ma20 = last20.reduce((a, b) => a + b, 0) / last20.length;
  const recoveredMa20 = current > ma20;
  const last20vol = sorted.slice(-20).map(q => q.AdjustmentVolume);
  const volumeAvg20 = last20vol.reduce((a, b) => a + b, 0) / last20vol.length;
  const latestVolume = latest.AdjustmentVolume;
  const volumeRatioToAvg = volumeAvg20 > 0 ? latestVolume / volumeAvg20 : 1;

  return {
    current,
    high52w,
    drawdownPct,
    ma20,
    recoveredMa20,
    volumeAvg20,
    latestVolume,
    volumeRatioToAvg,
  };
}

export type FinancialStats = {
  revenueYoY: number | null;
  operatingProfitYoY: number | null;
  hasDownwardRevision: boolean;
};

export function calcFinancialStats(statements: FinancialStatement[]): FinancialStats {
  const annual = statements
    .filter(s =>
      s.TypeOfDocument.includes("Annual") ||
      s.TypeOfDocument.includes("Q4") ||
      s.TypeOfDocument.includes("FY")
    )
    .sort((a, b) => b.DisclosedDate.localeCompare(a.DisclosedDate));

  if (annual.length < 2) {
    return { revenueYoY: null, operatingProfitYoY: null, hasDownwardRevision: false };
  }

  const latest = annual[0];
  const prev = annual[1];

  const revenueYoY =
    prev.NetSales && prev.NetSales > 0 && latest.NetSales != null
      ? ((latest.NetSales - prev.NetSales) / prev.NetSales) * 100
      : null;

  const operatingProfitYoY =
    prev.OperatingProfit && Math.abs(prev.OperatingProfit) > 0 && latest.OperatingProfit != null
      ? ((latest.OperatingProfit - prev.OperatingProfit) / Math.abs(prev.OperatingProfit)) * 100
      : null;

  const hasDownwardRevision =
    latest.ForecastNetSales != null &&
    prev.ForecastNetSales != null &&
    latest.ForecastNetSales < prev.ForecastNetSales;

  return { revenueYoY, operatingProfitYoY, hasDownwardRevision };
}
