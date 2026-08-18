import { mkdirSync, appendFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { readJpxListingExistingInput } from "./jpx-listing-existing-input.js";

type ListingEvent = {
  id: string;
  code?: string;
  name: string;
  market?: string;
  eventType: string;
  eventDate?: string | null;
  source?: string;
  sourceUrl?: string;
  status?: string;
  notificationLevel?: "priority" | "morning_summary" | "log";
  whyWatch?: string;
  relatedPattern?: string;
  notes?: string[];
  evidenceToBackfill?: string[];
};

type ParsedListing = {
  code?: string;
  name: string;
  market?: string;
  listingDate?: string | null;
  sourceUrl?: string;
  raw: string;
  parser: "csv_like" | "html_table" | "regex_fallback";
};

const DATA_PATH = "data/listing_events.jsonl";
const DEFAULT_SOURCE_URL = process.env.JPX_LISTINGS_URL ?? "";

function keyOf(event: ListingEvent): string {
  return `${event.id}:${event.eventType}:${event.eventDate ?? "missing"}`;
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const m = trimmed.match(/(20\d{2})[年\/.-]\s*(\d{1,2})[月\/.-]\s*(\d{1,2})日?/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function looksLikeCode(value: string): boolean {
  return /^(\d{4}|\d{3}[A-Z])$/.test(value.trim());
}

function cleanCell(value: string): string {
  return stripHtml(value).replace(/^"|"$/g, "").trim();
}

function pickName(cols: string[], code: string | undefined): string | undefined {
  return cols.find(col => {
    if (!col || col === code) return false;
    if (normalizeDate(col)) return false;
    if (/市場|コード|上場|承認|日付|会社名|銘柄名|公募|売出|仮条件|公開価格/.test(col)) return false;
    if (looksLikeCode(col)) return false;
    return /[一-龥ぁ-んァ-ヶA-Za-z]/.test(col);
  });
}

function parseCsvLike(text: string, sourceUrl: string): ParsedListing[] {
  const rows = text
    .split("\n")
    .map(row => row.trim())
    .filter(Boolean);
  const results: ParsedListing[] = [];
  for (const row of rows) {
    const cols = row.split(/,|\t/).map(cleanCell).filter(Boolean);
    const joined = cols.join(" ");
    const date = normalizeDate(joined);
    const code = cols.find(looksLikeCode);
    const name = pickName(cols, code);
    if (!name || !date) continue;
    results.push({ code, name, listingDate: date, sourceUrl, raw: row, parser: "csv_like" });
  }
  return results;
}

function parseHtmlTables(text: string, sourceUrl: string): ParsedListing[] {
  const rows = [...text.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(match => match[0]);
  const results: ParsedListing[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => cleanCell(match[1])).filter(Boolean);
    if (cells.length < 2) continue;
    const joined = cells.join(" ");
    const date = normalizeDate(joined);
    const code = cells.find(looksLikeCode);
    const name = pickName(cells, code);
    if (!name || !date) continue;
    results.push({ code, name, listingDate: date, sourceUrl, raw: stripHtml(row), parser: "html_table" });
  }
  return results;
}

function parseRegexFallback(text: string, sourceUrl: string): ParsedListing[] {
  const plain = stripHtml(text);
  const chunks = plain.split(/(?=20\d{2}[年\/.-]\s*\d{1,2}[月\/.-]\s*\d{1,2}日?)/g);
  const results: ParsedListing[] = [];
  for (const chunk of chunks) {
    const date = normalizeDate(chunk);
    if (!date) continue;
    const code = chunk.match(/\b(\d{4}|\d{3}[A-Z])\b/)?.[1];
    const name = chunk
      .replace(date, " ")
      .replace(/20\d{2}[年\/.-]\s*\d{1,2}[月\/.-]\s*\d{1,2}日?/g, " ")
      .split(/\s+/)
      .find(part => part && part !== code && /[一-龥ぁ-んァ-ヶA-Za-z]/.test(part) && !/上場|承認|市場|コード|日付/.test(part));
    if (!name) continue;
    results.push({ code, name, listingDate: date, sourceUrl, raw: chunk.slice(0, 300), parser: "regex_fallback" });
  }
  return results;
}

function dedupeParsed(items: ParsedListing[]): ParsedListing[] {
  const seen = new Set<string>();
  const results: ParsedListing[] = [];
  for (const item of items) {
    const key = `${item.code ?? item.name}:${item.listingDate ?? "missing"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}

function parseListings(text: string, sourceUrl: string): ParsedListing[] {
  return dedupeParsed([...parseHtmlTables(text, sourceUrl), ...parseCsvLike(text, sourceUrl), ...parseRegexFallback(text, sourceUrl)]);
}

function toEvent(item: ParsedListing): ListingEvent {
  const safeName = item.name.replace(/\s+/g, "_");
  const id = `jpx-${item.code ?? safeName}-${item.listingDate ?? "missing"}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  return {
    id,
    code: item.code,
    name: item.name,
    market: item.market ?? "TSE",
    eventType: "listing_day",
    eventDate: item.listingDate ?? null,
    source: `jpx_listing_sync:${item.parser}`,
    sourceUrl: item.sourceUrl,
    status: "watch",
    notificationLevel: "priority",
    whyWatch: "JPX新規上場情報から検出。上場日・初値・出来高・初回決算・ロックアップ解除を記録する起点。",
    evidenceToBackfill: ["公開価格", "初値", "初日出来高", "初回決算日", "ロックアップ解除条件"],
    notes: ["JPX新規上場情報", "買い推奨ではなく上場イベント監視"],
  };
}

async function fetchSource(url: string): Promise<string | null> {
  if (!url) return null;
  const response = await fetch(url, { headers: { "user-agent": "alpha-pon listing sync dry-run" } });
  if (!response.ok) throw new Error(`JPX listing fetch failed: ${response.status}`);
  return await response.text();
}

function writeReport(params: {
  generatedAt: string;
  sourceUrl: string;
  write: boolean;
  parsed: ParsedListing[];
  appendable: ListingEvent[];
  duplicates: ListingEvent[];
  warnings: string[];
  error?: string;
}) {
  const lines: string[] = [];
  lines.push("# JPX新規上場情報 sync", "", `date: ${params.generatedAt}`, "");
  lines.push("> 買い推奨ではありません。JPX等の新規上場情報を listing_events.jsonl に取り込むための dry-run / preview です。", "");
  lines.push(`- sourceUrl: ${params.sourceUrl || "未設定"}`);
  lines.push(`- write: ${params.write}`);
  lines.push(`- parsed: ${params.parsed.length}`);
  lines.push(`- appendable: ${params.appendable.length}`);
  lines.push(`- duplicates: ${params.duplicates.length}`);
  lines.push(`- inputWarnings: ${params.warnings.length}`);
  for (const warning of params.warnings) lines.push(`- warning: ${warning}`);
  if (params.error) lines.push(`- error: ${params.error}`);
  lines.push("");

  if (!params.sourceUrl) {
    lines.push("## setup needed", "");
    lines.push("環境変数 `JPX_LISTINGS_URL` に、JPX新規上場情報のCSV/HTML/テキスト取得URLを設定してください。", "");
  }

  lines.push("## parsed", "");
  for (const item of params.parsed.slice(0, 30)) {
    lines.push(`- [${item.parser}] ${item.code ?? "no-code"} ${item.name} / ${item.listingDate ?? "未登録"}`);
  }
  lines.push("");

  lines.push("## appendable", "");
  for (const event of params.appendable) {
    lines.push(`- ${event.code ?? "no-code"} ${event.name} / ${event.eventDate ?? "未登録"} / ${event.sourceUrl ?? ""}`);
  }
  lines.push("");

  lines.push("## duplicates", "");
  for (const event of params.duplicates) {
    lines.push(`- ${event.code ?? "no-code"} ${event.name} / ${event.eventDate ?? "未登録"}`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/jpx_listing_sync_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/jpx_listing_sync_latest.json", JSON.stringify(params, null, 2), "utf-8");
}

async function main() {
  const write = process.argv.includes("--write");
  const sourceUrl = DEFAULT_SOURCE_URL;
  const generatedAt = todayJst();
  let parsed: ParsedListing[] = [];
  let error: string | undefined;

  try {
    const text = await fetchSource(sourceUrl);
    parsed = text ? parseListings(text, sourceUrl) : [];
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const existingInput = readJpxListingExistingInput(DATA_PATH);
  const existingKeys = new Set(existingInput.rows.map(keyOf));
  const events = parsed.map(toEvent);
  const appendable = events.filter(event => !existingKeys.has(keyOf(event)));
  const duplicates = events.filter(event => existingKeys.has(keyOf(event)));

  if (write && appendable.length > 0) {
    mkdirSync("data", { recursive: true });
    for (const event of appendable) appendFileSync(DATA_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  }

  writeReport({ generatedAt, sourceUrl, write, parsed, appendable, duplicates, warnings: existingInput.warnings, error });
  console.log(`jpx listing sync generated: parsed=${parsed.length}, appendable=${appendable.length}, write=${write}, warnings=${existingInput.warnings.length}`);
}

main();