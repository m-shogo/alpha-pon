import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

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
};

const DATA_PATH = "data/listing_events.jsonl";
const DEFAULT_SOURCE_URL = process.env.JPX_LISTINGS_URL ?? "";

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function keyOf(event: ListingEvent): string {
  return `${event.id}:${event.eventType}:${event.eventDate ?? "missing"}`;
}

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const m = trimmed.match(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function parseCsvLike(text: string, sourceUrl: string): ParsedListing[] {
  const rows = text
    .split("\n")
    .map(row => row.trim())
    .filter(Boolean);
  const results: ParsedListing[] = [];
  for (const row of rows) {
    const cols = row.split(/,|\t/).map(col => col.trim().replace(/^"|"$/g, ""));
    const joined = cols.join(" ");
    const date = normalizeDate(joined);
    const code = cols.find(col => /^\d{4}|\d{3}[A-Z]$/.test(col));
    const name = cols.find(col => col && col !== code && !normalizeDate(col) && !/市場|コード|上場|承認|日付/.test(col));
    if (!name || !date) continue;
    results.push({ code, name, listingDate: date, sourceUrl, raw: row });
  }
  return results;
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
    source: "jpx_listing_sync",
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
  if (params.error) lines.push(`- error: ${params.error}`);
  lines.push("");

  if (!params.sourceUrl) {
    lines.push("## setup needed", "");
    lines.push("環境変数 `JPX_LISTINGS_URL` に、JPX新規上場情報のCSV/HTML/テキスト取得URLを設定してください。", "");
  }

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
    parsed = text ? parseCsvLike(text, sourceUrl) : [];
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const existing = readJsonl<ListingEvent>(DATA_PATH);
  const existingKeys = new Set(existing.map(keyOf));
  const events = parsed.map(toEvent);
  const appendable = events.filter(event => !existingKeys.has(keyOf(event)));
  const duplicates = events.filter(event => existingKeys.has(keyOf(event)));

  if (write && appendable.length > 0) {
    mkdirSync("data", { recursive: true });
    for (const event of appendable) appendFileSync(DATA_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  }

  writeReport({ generatedAt, sourceUrl, write, parsed, appendable, duplicates, error });
  console.log(`jpx listing sync generated: parsed=${parsed.length}, appendable=${appendable.length}, write=${write}`);
}

main();
