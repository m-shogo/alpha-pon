// J-Quants API クライアント
// Docs: https://jpx-jquants.com/

import {
  DEFAULT_ADAPTIVE_RATE_LIMIT,
  initialRateLimitState,
  onRequestSucceeded,
  onRequestThrottled,
  waitMsBefore,
  type AdaptiveRateLimitConfig,
  type AdaptiveRateLimitState,
} from "./adaptive-rate-limit.js";

const V1_BASE_URL = "https://api.jquants.com/v1";
const V2_BASE_URL = "https://api.jquants.com/v2";

type TokenCache = {
  idToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
// 相手（J-Quants Free）の制限はレートではなくバースト枠。
// 固定間隔では必ず溢れるため、429 の観測から間隔を学習する。
/**
 * 適応レート制限の状態。**最初に使うときに作る。**
 *
 * かつてはモジュール読み込み時に既定値で作っていた。そのため
 * `JQUANTS_V2_REQUEST_INTERVAL_MS` を main() の中で設定しても
 * **一切反映されなかった**（状態は import の時点で 3秒で確定していた）。
 * 価格の取り込みは 20秒のつもりで 3秒で走っていた。
 * 設定する場所と効く場所の順序に依存する作りをやめる。
 */
let v2RateLimitState: AdaptiveRateLimitState | null = null;

function rateLimitState(): AdaptiveRateLimitState {
  v2RateLimitState ??= initialRateLimitState(v2RateLimitConfig());
  return v2RateLimitState;
}

export function parseJQuantsRequestTimeoutMs(value: string | undefined): number {
  const parsed = Number(value ?? "15000");
  return Number.isSafeInteger(parsed) && parsed >= 1000 ? parsed : 15000;
}

export function parseJQuantsV2RequestIntervalMs(value: string | undefined): number {
  const parsed = Number(value ?? "3000");
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 60_000 ? parsed : 3000;
}

export function parseJQuantsV2RetryAttempts(value: string | undefined): number {
  const parsed = Number(value ?? "5");
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : 5;
}

export function parseJQuantsV2DataDelayDays(value: string | undefined): number {
  const parsed = Number(value ?? "84");
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 3650 ? parsed : 84;
}

function requestTimeoutMs(): number {
  return parseJQuantsRequestTimeoutMs(process.env.JQUANTS_REQUEST_TIMEOUT_MS);
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

function validatedCompactDate(date: string, field: string): string {
  const compact = toCompactDate(date);
  if (!/^\d{8}$/.test(compact)) throw new Error(`${field} must be YYYY-MM-DD or YYYYMMDD`);
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  if (year < 1) throw new Error(`${field} is not a valid date`);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${field} is not a valid date`);
  }
  return compact;
}

function jstDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function compactJstDate(date: Date): string {
  return jstDate(date).replace(/-/g, "");
}

export function jquantsV2DateCapCompact(
  now: Date = new Date(),
  delayDays = parseJQuantsV2DataDelayDays(process.env.JQUANTS_V2_DATA_DELAY_DAYS),
): string {
  if (!Number.isSafeInteger(delayDays) || delayDays < 0) {
    throw new Error(`JQUANTS_V2_DATA_DELAY_DAYS must be a non-negative integer: ${delayDays}`);
  }
  if (Number.isNaN(now.getTime())) throw new Error("J-Quants V2 cap clock is invalid");
  const todayJst = jstDate(now);
  const noonJst = new Date(`${todayJst}T12:00:00+09:00`);
  const capDate = new Date(noonJst.getTime() - delayDays * 86_400_000);
  return compactJstDate(capDate);
}

export function normalizeV2QuoteRange(
  from: string,
  to: string,
  now: Date = new Date(),
  delayDays = parseJQuantsV2DataDelayDays(process.env.JQUANTS_V2_DATA_DELAY_DAYS),
): { from: string; to: string } | null {
  const compactFrom = validatedCompactDate(from, "J-Quants quote from");
  const compactTo = validatedCompactDate(to, "J-Quants quote to");
  if (compactFrom > compactTo) throw new Error("J-Quants quote from must be on or before to");
  const cap = jquantsV2DateCapCompact(now, delayDays);

  // If the requested range starts after the entitlement cap, there is no
  // eligible row. Never shift `from` backwards to the cap date: doing so would
  // silently return a different trading day than the caller requested.
  if (compactFrom > cap) return null;

  return {
    from: compactFrom,
    to: compactTo > cap ? cap : compactTo,
  };
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

function v2RateLimitConfig(): AdaptiveRateLimitConfig {
  return {
    ...DEFAULT_ADAPTIVE_RATE_LIMIT,
    baseIntervalMs: parseJQuantsV2RequestIntervalMs(process.env.JQUANTS_V2_REQUEST_INTERVAL_MS),
  };
}

async function waitForV2RateLimit(): Promise<void> {
  const waitMs = waitMsBefore(rateLimitState(), Date.now());
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

/** 現在のスロットル状況。長時間の一括取得で進捗を出すために使う。 */
export function jquantsV2RateLimitSnapshot(): {
  currentIntervalMs: number;
  totalThrottles: number;
  consecutiveThrottles: number;
} {
  const state = rateLimitState();
  return {
    currentIntervalMs: state.currentIntervalMs,
    totalThrottles: state.totalThrottles,
    consecutiveThrottles: state.consecutiveThrottles,
  };
}

/**
 * 状態を捨てる。次に使うときに、そのときの設定で作り直される。
 *
 * テスト用。通常は遅延初期化があるので呼ぶ必要はない。
 */
export function resetJQuantsV2RateLimit(): void {
  v2RateLimitState = null;
}

function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function fetchV2(url: string, apiKey: string): Promise<Response> {
  const maxAttempts = parseJQuantsV2RetryAttempts(process.env.JQUANTS_V2_RETRY_ATTEMPTS);
  const config = v2RateLimitConfig();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await waitForV2RateLimit();
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "User-Agent": "alpha-pon/0.1",
      },
      signal: timeoutSignal(),
    });
    if (res.status !== 429) {
      v2RateLimitState = onRequestSucceeded(rateLimitState(), Date.now(), config);
      return res;
    }
    // バースト枠が尽きている。短い間隔で叩き直しても枠を削るだけ。
    v2RateLimitState = onRequestThrottled(
      rateLimitState(), Date.now(), config, parseRetryAfterMs(res),
    );
    if (attempt === maxAttempts) return res;
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
    if (!range) return [];
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

/**
 * Single-trading-day snapshot of the whole cash market.
 *
 * `/equities/bars/daily?date=` returns every code that had a bar on that date
 * in ONE request, which is ~4,400x cheaper than looping codes and makes the
 * returned code set the point-in-time universe for that date.
 *
 * Returns `null` (not `[]`) when the date is outside the plan entitlement, so
 * callers can tell "not allowed to ask" apart from "market was closed".
 */
export async function fetchDailyQuotesByDate(
  date: string,
  now: Date = new Date(),
): Promise<DailyQuote[] | null> {
  if (!process.env.JQUANTS_API_KEY) {
    throw new Error("fetchDailyQuotesByDate requires the V2 API (JQUANTS_API_KEY)");
  }
  const compact = validatedCompactDate(date, "J-Quants quote date");
  if (compact > jquantsV2DateCapCompact(now)) return null;

  const rows = await getV2Paginated<V2DailyQuote>("/equities/bars/daily", { date: compact });
  return rows.map(normalizeV2Quote);
}

/**
 * 決算開示を「1日ぶんまとめて」取る。
 *
 * `/fins/summary?date=` は **その日に開示された全銘柄ぶん** を1リクエストで返す。
 * 実測（2026-09-11）:
 *   - `DiscDate` が問い合わせた日と食い違う行は 0（3日・2,248行で確認）
 *   - `Code` は日内で一意ではない（1社が同日に決算＋予想修正などを出す）
 *   - `DiscNo` は日内・日跨ぎとも重複なし（5日・3,613行）だが、
 *     EDINET の docID が実際に衝突した前例があるので **同一性はハッシュで見る**
 *   - 土日・休場日は HTTP 200 で 0件（正常な空）
 *   - 契約範囲外は HTTP 400（`getV2Paginated` が例外にする）
 *
 * 契約範囲の上限は価格と同一（実測 2024-06-19 〜 2026-06-19 = 84日遅延）。
 * 範囲外を叩く前に `null` を返して区別する。「聞いてはいけない」と
 * 「聞いたが開示が無かった」を混ぜないため。
 */
/**
 * 上場銘柄マスタを「1日ぶんまとめて」取る。
 *
 * `/equities/master?date=` は **その日の全上場銘柄** を1リクエストで返す。
 * 実測（2026-09-12）:
 *   項目 Date / Code / CoName / CoNameEn / S17 / S17Nm / S33 / S33Nm /
 *        ScaleCat / Mkt / MktNm / Mrgn / MrgnNm / ProdCat
 *   件数 4,367〜4,443（日によって増減する。上場・廃止があるため）
 *   契約 2024-06-20 〜 2026-06-20（価格・決算と同じ2年ローリング）
 *
 * なぜ日次で取るか（実測した変化の量）:
 *   2024-06-20 → 2024-12-20  属性変化 175 / 新規 93 / 消滅 50
 *   2024-12-20 → 2025-06-20  属性変化 465 / 新規 63 / 消滅 73
 *   2025-06-20 → 2025-12-19  属性変化 207 / 新規105 / 消滅 72
 *   2025-12-19 → 2026-06-19  属性変化  84 / 新規100 / 消滅 90
 *   業種・規模区分・市場区分は動く。**「変わらないはず」で1枚に畳まない。**
 */
export async function fetchEquityMasterByDate(
  date: string,
  now: Date = new Date(),
): Promise<Record<string, unknown>[] | null> {
  if (!process.env.JQUANTS_API_KEY) {
    throw new Error("fetchEquityMasterByDate requires the V2 API (JQUANTS_API_KEY)");
  }
  const compact = validatedCompactDate(date, "J-Quants master date");
  if (compact > jquantsV2DateCapCompact(now)) return null;

  return await getV2Paginated<Record<string, unknown>>("/equities/master", { date });
}

export async function fetchFinancialSummaryByDate(
  date: string,
  now: Date = new Date(),
): Promise<Record<string, unknown>[] | null> {
  if (!process.env.JQUANTS_API_KEY) {
    throw new Error("fetchFinancialSummaryByDate requires the V2 API (JQUANTS_API_KEY)");
  }
  const compact = validatedCompactDate(date, "J-Quants fins date");
  if (compact > jquantsV2DateCapCompact(now)) return null;

  return await getV2Paginated<Record<string, unknown>>("/fins/summary", { date });
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
