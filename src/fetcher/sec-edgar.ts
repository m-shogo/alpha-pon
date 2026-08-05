// SEC EDGAR public data client for US shock evidence.
// No API key is required, but SEC fair-access policy requires a declared User-Agent.
// Official docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces

const SEC_BASE_URL = "https://www.sec.gov";
const SEC_DATA_BASE_URL = "https://data.sec.gov";
let lastRequestAt = 0;
let tickerMapCache: Map<string, SecTickerEntry> | null = null;

export type SecTickerEntry = {
  cik: number;
  ticker: string;
  title: string;
};

export type SecRecentFiling = {
  cik: string;
  company: string;
  ticker: string;
  form: string;
  filingDate: string;
  reportDate: string | null;
  accessionNumber: string;
  primaryDocument: string;
  primaryDocumentDescription: string | null;
  filingUrl: string;
};

type SecTickerPayloadEntry = {
  cik_str?: number;
  ticker?: string;
  title?: string;
};

type SecTickerPayload = Record<string, SecTickerPayloadEntry>;

type SecSubmissionsPayload = {
  cik?: string;
  name?: string;
  tickers?: string[];
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
};

export function isSecEdgarConfigured(): boolean {
  return Boolean(process.env.SEC_USER_AGENT?.trim());
}

function requestTimeoutMs(): number {
  return Math.max(1000, Number(process.env.SEC_REQUEST_TIMEOUT_MS ?? "15000"));
}

function requestIntervalMs(): number {
  // SECの上限10 req/secより十分低い既定値（5 req/sec以下）。
  return Math.max(100, Number(process.env.SEC_REQUEST_INTERVAL_MS ?? "250"));
}

async function waitForRateLimit(): Promise<void> {
  const waitMs = Math.max(0, lastRequestAt + requestIntervalMs() - Date.now());
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
}

async function secJson<T>(url: string): Promise<T> {
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  if (!userAgent) {
    throw new Error("SEC_USER_AGENT が未設定（例: alpha-pon contact@example.com）");
  }
  await waitForRateLimit();
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    signal: AbortSignal.timeout(requestTimeoutMs()),
  });
  if (!response.ok) throw new Error(`SEC EDGAR HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
}

function padCik(cik: number | string): string {
  return String(cik).replace(/^0+/, "").padStart(10, "0");
}

function archiveCik(cik: number | string): string {
  return String(Number(cik));
}

function filingUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const accessionCompact = accessionNumber.replaceAll("-", "");
  return `${SEC_BASE_URL}/Archives/edgar/data/${archiveCik(cik)}/${accessionCompact}/${primaryDocument}`;
}

export async function fetchSecTickerMap(): Promise<Map<string, SecTickerEntry>> {
  if (tickerMapCache) return new Map(tickerMapCache);
  const payload = await secJson<SecTickerPayload>(`${SEC_BASE_URL}/files/company_tickers.json`);
  const result = new Map<string, SecTickerEntry>();
  for (const item of Object.values(payload)) {
    if (!item.ticker || !item.title || item.cik_str == null) continue;
    result.set(item.ticker.toUpperCase(), {
      cik: item.cik_str,
      ticker: item.ticker.toUpperCase(),
      title: item.title,
    });
  }
  tickerMapCache = result;
  return new Map(result);
}

export async function resolveSecTicker(symbol: string): Promise<SecTickerEntry | null> {
  const map = await fetchSecTickerMap();
  return map.get(symbol.trim().toUpperCase()) ?? null;
}

export async function fetchSecRecentFilings(
  symbol: string,
  options: {
    forms?: string[];
    since?: string | null;
    limit?: number;
  } = {},
): Promise<SecRecentFiling[]> {
  const ticker = await resolveSecTicker(symbol);
  if (!ticker) return [];

  const cik = padCik(ticker.cik);
  const payload = await secJson<SecSubmissionsPayload>(`${SEC_DATA_BASE_URL}/submissions/CIK${cik}.json`);
  const recent = payload.filings?.recent;
  if (!recent) return [];

  const forms = new Set((options.forms ?? ["8-K", "8-K/A", "6-K", "6-K/A", "10-Q", "10-K", "20-F", "20-F/A", "40-F", "40-F/A"]).map(value => value.toUpperCase()));
  const since = options.since ?? null;
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const rows: SecRecentFiling[] = [];
  const count = Math.max(
    recent.accessionNumber?.length ?? 0,
    recent.filingDate?.length ?? 0,
    recent.form?.length ?? 0,
  );

  for (let index = 0; index < count; index += 1) {
    const accessionNumber = recent.accessionNumber?.[index] ?? "";
    const filingDate = recent.filingDate?.[index] ?? "";
    const form = recent.form?.[index] ?? "";
    const primaryDocument = recent.primaryDocument?.[index] ?? "";
    if (!accessionNumber || !filingDate || !form || !primaryDocument) continue;
    if (!forms.has(form.toUpperCase())) continue;
    if (since && filingDate < since) continue;

    rows.push({
      cik,
      company: payload.name ?? ticker.title,
      ticker: ticker.ticker,
      form,
      filingDate,
      reportDate: recent.reportDate?.[index] || null,
      accessionNumber,
      primaryDocument,
      primaryDocumentDescription: recent.primaryDocDescription?.[index] || null,
      filingUrl: filingUrl(cik, accessionNumber, primaryDocument),
    });
    if (rows.length >= limit) break;
  }

  return rows;
}
