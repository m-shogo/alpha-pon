// JPX情報スクレイパー
// 新規上場: https://www.jpx.co.jp/listing/stocks/new/index.html
// 適時開示: https://www.jpx.co.jp/listing/ir-news/index.html
// 注意: watchlist 50銘柄以内・1日1回・キャッシュあり・robots.txt遵守

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
// JPX 適時開示スクレイパー（TDnet 無料ページ）
// -------------------------------------------------------

export type TdnetDisclosure = {
  code: string;
  companyName: string;
  title: string;
  publishedAt: string;
  url: string;
};

const JPX_IR_NEWS_URL = "https://www.jpx.co.jp/listing/ir-news/index.html";

export async function fetchTdnetDisclosures(): Promise<TdnetDisclosure[]> {
  try {
    const res = await fetch(JPX_IR_NEWS_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; alpha-pon/0.1; personal investment research tool)",
      },
    });
    if (!res.ok) {
      throw new Error(`JPX IR Newsアクセス失敗: ${res.status}`);
    }
    const html = await res.text();
    return parseTdnetHtml(html);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`TDnet開示取得失敗: ${message}`);
  }
}

function parseTdnetHtml(html: string): TdnetDisclosure[] {
  const entries: TdnetDisclosure[] = [];

  // JPXのテーブル行を抽出（構造変更に対して複数パターン対応）
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatch) return entries;

  for (const table of tableMatch) {
    const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows.slice(1)) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? []).map(td =>
        td.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
      );

      if (cells.length < 3) continue;

      // URLを抽出
      const urlMatch = row.match(/href="([^"]*pdf[^"]*)"/i);
      const url = urlMatch
        ? `https://www.jpx.co.jp${urlMatch[1]}`
        : JPX_IR_NEWS_URL;

      // コード（4桁数字 or 4桁+英字）
      const codeMatch = cells.join(" ").match(/\b(\d{4}[A-Z0-9]?)\b/);
      if (!codeMatch) continue;

      const code = codeMatch[1];
      const companyName = cells[1] ?? "";
      const title = cells[cells.length - 1] ?? "";
      const dateStr = cells[0] ?? "";

      entries.push({
        code,
        companyName,
        title,
        publishedAt: normalizeDateStr(dateStr),
        url,
      });
    }
  }

  return entries;
}
