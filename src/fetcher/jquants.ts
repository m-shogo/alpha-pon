// J-Quants API Free プランクライアント
// Docs: https://jpx-jquants.com/

const BASE_URL = "https://api.jquants.com/v1";

type TokenCache = {
  idToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

async function getRefreshToken(): Promise<string> {
  const email = process.env.JQUANTS_EMAIL;
  const password = process.env.JQUANTS_PASSWORD;
  if (!email || !password) {
    throw new Error("JQUANTS_EMAIL / JQUANTS_PASSWORD が未設定");
  }

  const res = await fetch(`${BASE_URL}/token/auth_user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mailaddress: email, password }),
  });

  if (!res.ok) {
    throw new Error(`J-Quants認証失敗: ${res.status}`);
  }

  const data = (await res.json()) as { refreshToken: string };
  return data.refreshToken;
}

async function getIdToken(refreshToken: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/token/auth_refresh?refreshtoken=${encodeURIComponent(refreshToken)}`,
    { method: "POST" }
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

  // IDトークンは約24時間有効
  tokenCache = { idToken, expiresAt: now + 23 * 60 * 60 * 1000 };
  return idToken;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await ensureToken();
  const query = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${path}${query ? "?" + query : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`J-Quants APIエラー ${path}: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// --- 型定義 ---

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
};

// --- API呼び出し関数 ---

export async function fetchDailyQuotes(
  code: string,
  from: string,
  to: string
): Promise<DailyQuote[]> {
  const data = await get<{ daily_quotes: DailyQuote[] }>("/prices/daily_quotes", {
    code,
    from,
    to,
  });
  return data.daily_quotes ?? [];
}

export async function fetchFinancialStatements(
  code: string
): Promise<FinancialStatement[]> {
  const data = await get<{ statements: FinancialStatement[] }>("/fins/statements", {
    code,
  });
  return data.statements ?? [];
}

// --- 計算ヘルパー ---

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

  // 52週高値
  const year252 = sorted.slice(-252);
  const high52w = Math.max(...year252.map(q => q.AdjustmentClose));
  const drawdownPct = ((current - high52w) / high52w) * 100;

  // 20日移動平均
  const last20 = sorted.slice(-20).map(q => q.AdjustmentClose);
  const ma20 = last20.reduce((a, b) => a + b, 0) / last20.length;
  const recoveredMa20 = current > ma20;

  // 出来高
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
      s.TypeOfDocument.includes("Q4")
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

  // 予想の下方修正チェック（前回予想より今回予想が低い）
  const hasDownwardRevision =
    latest.ForecastNetSales != null &&
    prev.ForecastNetSales != null &&
    latest.ForecastNetSales < prev.ForecastNetSales;

  return { revenueYoY, operatingProfitYoY, hasDownwardRevision };
}
