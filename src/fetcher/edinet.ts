// EDINET API v2 authenticated client
// Official registration is required. Keep EDINET_API_KEY local and never log it.

import { addDaysJst, todayJst } from "../date.js";

export const EDINET_API_KEY_ENV = "EDINET_API_KEY";
export const EDINET_API_BASE_URL = "https://api.edinet-fsa.go.jp/api/v2";
const EDINET_API_KEY_QUERY_PARAM = "Subscription-Key";
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

type EdinetDocListResponse = {
  metadata: {
    message: string | null;
    resultset: { count: number };
  };
  results: EdinetDoc[];
};

export type EdinetDoc = {
  seqNumber: number;
  docID: string;
  edinetCode: string;
  secCode: string;
  JCN: string;
  filerName: string;
  fundCode: string;
  ordinanceCode: string;
  formCode: string;
  docTypeCode: string;
  periodStart: string;
  periodEnd: string;
  submitDateTime: string;
  docDescription: string;
  issuerEdinetCode: string;
  subjectEdinetCode: string;
  subsidiaryEdinetCode: string;
  currentReportReason: string;
  parentDocID: string;
  opeDateTime: string;
  withdrawalStatus: string;
  docInfoEditStatus: string;
  disclosureStatus: string;
  xbrlFlag: string;
  pdfFlag: string;
  attachDocFlag: string;
  englishDocFlag: string;
  csvFlag: string;
  legalStatus: string;
};

export type EdinetClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  retryBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type EdinetConfigurationStatus = {
  source: "edinet";
  configured: boolean;
  state: "ready" | "credentials_missing";
  apiKeyEnv: typeof EDINET_API_KEY_ENV;
  baseUrl: string;
};

export class EdinetCredentialsMissingError extends Error {
  readonly code = "credentials_missing";
  readonly source = "edinet";

  constructor() {
    super(`${EDINET_API_KEY_ENV} is not configured`);
    this.name = "EdinetCredentialsMissingError";
  }
}

export class EdinetApiError extends Error {
  readonly code = "edinet_api_error";
  readonly source = "edinet";
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, retryable: boolean) {
    super(`EDINET API request failed (status=${status}, retryable=${retryable})`);
    this.name = "EdinetApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function isEdinetCredentialsMissingError(
  error: unknown
): error is EdinetCredentialsMissingError {
  return error instanceof EdinetCredentialsMissingError;
}

export function getEdinetConfigurationStatus(
  options: Pick<EdinetClientOptions, "apiKey" | "baseUrl"> = {}
): EdinetConfigurationStatus {
  const apiKey = options.apiKey ?? process.env[EDINET_API_KEY_ENV];
  const configured = typeof apiKey === "string" && apiKey.trim().length > 0;
  return {
    source: "edinet",
    configured,
    state: configured ? "ready" : "credentials_missing",
    apiKeyEnv: EDINET_API_KEY_ENV,
    baseUrl: normalizeBaseUrl(options.baseUrl ?? EDINET_API_BASE_URL),
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveApiKey(options: EdinetClientOptions): string {
  const apiKey = options.apiKey ?? process.env[EDINET_API_KEY_ENV];
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new EdinetCredentialsMissingError();
  }
  return apiKey.trim();
}

function buildAuthenticatedUrl(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  baseUrl: string
): URL {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set(EDINET_API_KEY_QUERY_PARAM, apiKey);
  return url;
}

function retryDelayMs(response: Response, attempt: number, retryBaseMs: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return retryBaseMs * attempt;
}

function isStrictGregorianDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

async function requestEdinetJson<T>(
  path: string,
  params: Record<string, string>,
  options: EdinetClientOptions
): Promise<T> {
  const apiKey = resolveApiKey(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryBaseMs = Math.max(0, options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS);
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const baseUrl = options.baseUrl ?? EDINET_API_BASE_URL;
  const url = buildAuthenticatedUrl(path, params, apiKey, baseUrl);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: "application/json",
        },
      });
    } catch {
      if (attempt >= maxAttempts) {
        throw new EdinetApiError(0, true);
      }
      await sleep(retryBaseMs * attempt);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryable = RETRYABLE_STATUS_CODES.has(response.status);
    if (!retryable || attempt >= maxAttempts) {
      throw new EdinetApiError(response.status, retryable);
    }

    await sleep(retryDelayMs(response, attempt, retryBaseMs));
  }

  throw new EdinetApiError(0, true);
}

const IMPORTANT_FORM_CODES = new Set([
  "030000",
  "043000",
  "050000",
]);

export const STRUCTURAL_KEYWORDS = [
  "スピンオフ",
  "パーシャルスピンオフ",
  "会社分割",
  "吸収分割",
  "新設分割",
  "子会社株式の譲渡",
  "上場準備",
  "新規上場申請",
  "事業ポートフォリオ",
  "MBO",
  "TOB",
  "公開買付",
];

export async function fetchEdinetDocList(
  date: string,
  options: EdinetClientOptions = {}
): Promise<EdinetDoc[]> {
  if (!isStrictGregorianDate(date)) {
    throw new Error("EDINET date must be a real Gregorian date in YYYY-MM-DD format");
  }

  const data = await requestEdinetJson<EdinetDocListResponse>(
    "documents.json",
    { date, type: "2" },
    options
  );

  if (!data.metadata || !Array.isArray(data.results)) {
    throw new Error("EDINET API returned an invalid document-list response");
  }

  return data.results;
}

export function filterBySecCode(docs: EdinetDoc[], secCode: string): EdinetDoc[] {
  const normalized = secCode.replace(/[A-Z]/g, "0").padEnd(5, "0");
  return docs.filter(d => d.secCode === normalized || d.secCode === secCode);
}

export function findStructuralEvents(docs: EdinetDoc[]): EdinetDoc[] {
  return docs.filter(doc => {
    const text = `${doc.docDescription} ${doc.currentReportReason}`;
    return STRUCTURAL_KEYWORDS.some(kw => text.includes(kw));
  });
}

export function findImportantDocs(docs: EdinetDoc[]): EdinetDoc[] {
  return docs.filter(d => IMPORTANT_FORM_CODES.has(d.formCode));
}

export function findAnnualReports(docs: EdinetDoc[]): EdinetDoc[] {
  return docs.filter(d => d.formCode === "030000" && d.pdfFlag === "1");
}

export function filterBySecCodes(docs: EdinetDoc[], secCodes: string[]): EdinetDoc[] {
  const normalized = new Set(
    secCodes.map(c => c.replace(/[A-Z]/g, "0").padEnd(5, "0"))
  );
  return docs.filter(d => normalized.has(d.secCode));
}

export function buildPdfUrl(docID: string): string {
  return `${EDINET_API_BASE_URL}/documents/${encodeURIComponent(docID)}?type=2`;
}

export function toSecCode(code: string): string {
  return code.replace(/[A-Z]/g, "0").padEnd(5, "0");
}

export async function scanEdinetDays(
  days: number,
  options: EdinetClientOptions = {}
): Promise<Map<string, EdinetDoc[]>> {
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error("EDINET scan days must be a positive safe integer");
  }

  const result = new Map<string, EdinetDoc[]>();
  const base = todayJst();

  for (let i = 0; i < days; i++) {
    const dateStr = addDaysJst(base, -i);
    const weekday = new Date(`${dateStr}T00:00:00+09:00`).getDay();
    if (weekday === 0 || weekday === 6) continue;

    try {
      const docs = await fetchEdinetDocList(dateStr, options);
      const structural = findStructuralEvents(docs);
      if (structural.length > 0) {
        for (const doc of structural) {
          const code = doc.secCode;
          if (!result.has(code)) result.set(code, []);
          result.get(code)!.push(doc);
        }
      }
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      if (isEdinetCredentialsMissingError(error)) break;
    }
  }

  return result;
}
