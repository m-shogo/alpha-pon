// JPX情報スクレイパー
// 新規上場: https://www.jpx.co.jp/listing/stocks/new/index.html
// 適時開示: https://www.release.tdnet.info/inbs/I_main_00.html
// 注意: watchlist 50銘柄以内・低頻度manual/dry-run・キャッシュあり・robots/利用条件を尊重

import { addDaysJst, todayJst, toCompactDate } from "../date.js";

export type IpoEntry = {
  code: string;
  name: string;
  market: string;
  listingDate: string;
  offerPrice: number | null;
};

// JPXの新規上場CSV形式（実際のURLは定期的に変わるため要確認）
// 無料で確認できる代替: https://ipodata.jp/ 等の公開情報も参照
const JPX_IPO_LIST_URL =
  "https://www.jpx.co.jp/listing/stocks/new/index.html";

export async function fetchIpoList(): Promise<IpoEntry[]> {
  try {
    const res = await fetch(JPX_IPO_LIST_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; alpha-pon/0.1; personal investment research tool)",
      },
    });
    if (!res.ok) {
      throw new Error(`JPXアクセス失敗: ${res.status}`);
    }

    const html = await res.text();
    return parseIpoHtml(html);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`IPO情報取得失敗: ${message}`);
  }
}

function parseIpoHtml(html: string): IpoEntry[] {
  const entries: IpoEntry[] = [];

  // テーブル行を抽出（JPXのHTML構造に依存）
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatch) return entries;

  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows.slice(1)) { // ヘッダー行をスキップ
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? []).map(
        td => td.replace(/<[^>]+>/g, "").trim()
      );

      if (cells.length >= 3) {
        const code = cells[0]?.replace(/\s/g, "") ?? "";
        const name = cells[1] ?? "";
        const dateStr = cells[2] ?? "";
        const market = cells[3] ?? "TSE";

        if (/^\d{4}[A-Z0-9]?$/.test(code)) {
          entries.push({
            code,
            name,
            market,
            listingDate: normalizeDateStr(dateStr),
            offerPrice: null,
          });
        }
      }
    }
  }

  return entries;
}

function normalizeDateStr(str: string): string {
  // "2025年11月15日" → "2025-11-15"
  const match = str.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return str;
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

export function calcDaysSinceListing(listingDate: string): number {
  const listed = new Date(listingDate);
  if (isNaN(listed.getTime())) return 0;
  return Math.floor((Date.now() - listed.getTime()) / (1000 * 60 * 60 * 24));
}

// -------------------------------------------------------
// TDnet 適時開示情報閲覧サービス（公式 public viewer）
// -------------------------------------------------------

export type TdnetDisclosure = {
  /** 発行体の固有名コード（TDnet 5桁表示の場合は予備コードを除いた先頭4文字） */
  code: string;
  /** TDnet一覧に表示された会社コード。5桁表示のsource metadataを保持する。 */
  sourceCode?: string;
  companyName: string;
  title: string;
  /** source publication time only. Market Event EventTimeへ流用してはいけない。 */
  publishedAt: string;
  url: string;
};

export type TdnetDisclosureSnapshot = {
  observationDate: string;
  disclosures: TdnetDisclosure[];
  explicitEmpty: boolean;
  pageCount: number;
  pageUrls: string[];
};

export type TdnetFetchOptions = {
  observationDate?: string;
  fetchImpl?: typeof fetch;
  maxPages?: number;
};

export const TDNET_PUBLIC_BASE_URL = "https://www.release.tdnet.info/inbs/";
export const TDNET_PUBLIC_MAIN_URL = `${TDNET_PUBLIC_BASE_URL}I_main_00.html`;
const TDNET_NO_DISCLOSURES_PATTERN = /に開示された情報はありません。?/;
const DEFAULT_TDNET_MAX_PAGES = 20;
const TDNET_USER_AGENT = "Mozilla/5.0 (compatible; alpha-pon/0.1; personal investment research tool)";

function validateObservationDate(value: string): string {
  try {
    if (addDaysJst(value, 0) !== value) throw new Error("non-canonical date");
    return value;
  } catch {
    throw new Error("TDnet observationDate must be a real YYYY-MM-DD date");
  }
}

export function buildTdnetListUrl(observationDate: string, page: number): string {
  const normalizedDate = validateObservationDate(observationDate);
  if (!Number.isInteger(page) || page < 1 || page > 999) {
    throw new Error("TDnet page must be an integer between 1 and 999");
  }
  return `${TDNET_PUBLIC_BASE_URL}I_list_${String(page).padStart(3, "0")}_${toCompactDate(normalizedDate)}.html`;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cellByClass(row: string, className: string): string | null {
  const escaped = escapeRegExp(className);
  const match = row.match(new RegExp(
    `<td\\b(?=[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escaped}\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/td>`,
    "i",
  ));
  return match?.[1] ?? null;
}

function tdnetIssuerCode(sourceCode: string): string {
  const normalized = sourceCode.replace(/\s+/g, "").toUpperCase();
  // TDnet displays the 4-character solid-name code plus a 1-character reserve code.
  // Preserve the raw 5-character value separately and use the issuer-level first four
  // characters for Alpha Pon company identity.
  if (/^[0-9A-Z]{5}$/.test(normalized)) return normalized.slice(0, 4);
  if (/^[0-9A-Z]{4}$/.test(normalized)) return normalized;
  throw new Error(`TDnet row has invalid company code: ${sourceCode}`);
}

function tdnetPublishedAt(observationDate: string, sourceTime: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(sourceTime.trim());
  if (!match) throw new Error(`TDnet row has invalid disclosure time: ${sourceTime}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`TDnet row has invalid disclosure time: ${sourceTime}`);
  }
  return `${observationDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
}

function tdnetDocumentUrl(href: string): string {
  const resolved = new URL(href, TDNET_PUBLIC_BASE_URL);
  if (
    resolved.protocol !== "https:"
    || resolved.hostname !== "www.release.tdnet.info"
    || !resolved.pathname.startsWith("/inbs/")
  ) {
    throw new Error(`TDnet row has non-official document URL: ${resolved.toString()}`);
  }
  return resolved.toString();
}

export function parseTdnetListHtml(html: string, observationDate: string): TdnetDisclosure[] {
  const normalizedDate = validateObservationDate(observationDate);
  const table = html.match(/<table\b(?=[^>]*\bid\s*=\s*["']main-list-table["'])[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];

  const rows = table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  const entries: TdnetDisclosure[] = [];

  for (const row of rows) {
    const hasTdnetCells = /\bkj(?:Time|Code|Name|Title)\b/i.test(row);
    if (!hasTdnetCells) continue;

    const timeCell = cellByClass(row, "kjTime");
    const codeCell = cellByClass(row, "kjCode");
    const nameCell = cellByClass(row, "kjName");
    const titleCell = cellByClass(row, "kjTitle");
    if (timeCell === null || codeCell === null || nameCell === null || titleCell === null) {
      throw new Error("TDnet row structure is incomplete");
    }

    const sourceTime = decodeHtmlText(timeCell);
    const sourceCode = decodeHtmlText(codeCell).replace(/\s+/g, "").toUpperCase();
    const companyName = decodeHtmlText(nameCell);
    const title = decodeHtmlText(titleCell);
    const href = titleCell.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1]?.trim();

    if (!companyName) throw new Error("TDnet row has empty company name");
    if (!title) throw new Error("TDnet row has empty title");
    if (!href) throw new Error("TDnet row has no disclosure document link");

    entries.push({
      code: tdnetIssuerCode(sourceCode),
      sourceCode,
      companyName,
      title,
      publishedAt: tdnetPublishedAt(normalizedDate, sourceTime),
      url: tdnetDocumentUrl(href),
    });
  }

  return entries;
}

export async function fetchTdnetDisclosureSnapshot(
  options: TdnetFetchOptions = {},
): Promise<TdnetDisclosureSnapshot> {
  const observationDate = validateObservationDate(options.observationDate ?? todayJst());
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? DEFAULT_TDNET_MAX_PAGES;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 999) {
    throw new Error("TDnet maxPages must be an integer between 1 and 999");
  }

  const disclosures: TdnetDisclosure[] = [];
  const pageUrls: string[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildTdnetListUrl(observationDate, page);
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: { "User-Agent": TDNET_USER_AGENT } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`TDnet public viewer request failed: ${message}`);
    }

    if (response.status === 404) {
      if (page === 1) throw new Error(`TDnet public viewer first page not found: ${url}`);
      return {
        observationDate,
        disclosures,
        explicitEmpty: false,
        pageCount: pageUrls.length,
        pageUrls,
      };
    }
    if (!response.ok) {
      throw new Error(`TDnet public viewer request failed: status=${response.status}`);
    }

    const html = await response.text();
    pageUrls.push(url);

    if (TDNET_NO_DISCLOSURES_PATTERN.test(decodeHtmlText(html))) {
      if (page !== 1 || disclosures.length > 0) {
        throw new Error("TDnet public viewer returned inconsistent explicit-empty pagination");
      }
      return {
        observationDate,
        disclosures: [],
        explicitEmpty: true,
        pageCount: 1,
        pageUrls,
      };
    }

    const pageDisclosures = parseTdnetListHtml(html, observationDate);
    if (pageDisclosures.length === 0) {
      throw new Error("TDnet public viewer page structure was not recognized");
    }
    disclosures.push(...pageDisclosures);
  }

  throw new Error(`TDnet public viewer exceeded maxPages=${maxPages}; refusing a potentially truncated snapshot`);
}

export async function fetchTdnetDisclosures(options: TdnetFetchOptions = {}): Promise<TdnetDisclosure[]> {
  try {
    return (await fetchTdnetDisclosureSnapshot(options)).disclosures;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`TDnet開示取得失敗: ${message}`);
  }
}
