import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

type ListingEvent = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate?: string | null;
  reviewPrice?: number | null;
  publicPrice?: number | null;
  initialPrice?: number | null;
  topixRelativeReturn?: number | null;
  notes?: string[];
};

type QuoteResult = {
  code: string;
  date: string;
  price: number | null;
  source: "jquants" | "missing" | "error";
  error?: string;
};

const DATA_PATH = "data/listing_events.jsonl";
const OUT_CSV_PATH = process.env.LISTING_REVIEW_PRICE_CSV ?? "data/listing_review_prices.csv";
const BASE_URL = process.env.JQUANTS_BASE_URL ?? "https://api.jquants.com/v1";

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function addDays(date: string | null | undefined, days: number): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getIdToken(): Promise<string | null> {
  const mailaddress = process.env.JQUANTS_EMAIL;
  const password = process.env.JQUANTS_PASSWORD;
  if (!mailaddress || !password) return null;

  const authRes = await fetch(`${BASE_URL}/token/auth_user`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mailaddress, password }),
  });
  if (!authRes.ok) throw new Error(`J-Quants auth_user failed: ${authRes.status} ${await authRes.text()}`);
  const authJson = (await authRes.json()) as { refreshToken?: string };
  if (!authJson.refreshToken) throw new Error("J-Quants refreshToken missing");

  const refreshRes = await fetch(`${BASE_URL}/token/auth_refresh?refreshtoken=${encodeURIComponent(authJson.refreshToken)}`, { method: "POST" });
  if (!refreshRes.ok) throw new Error(`J-Quants auth_refresh failed: ${refreshRes.status} ${await refreshRes.text()}`);
  const refreshJson = (await refreshRes.json()) as { idToken?: string };
  if (!refreshJson.idToken) throw new Error("J-Quants idToken missing");
  return refreshJson.idToken;
}

function normalizeCode(code: string): string {
  return code.replace(/\.T$/, "").trim();
}

function pickPrice(row: Record<string, unknown>): number | null {
  const candidates = ["AdjustmentClose", "Close", "ClosePrice", "AdjustmentClosePrice"];
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function fetchQuote(idToken: string, code: string, date: string): Promise<QuoteResult> {
  try {
    const url = `${BASE_URL}/prices/daily_quotes?code=${encodeURIComponent(normalizeCode(code))}&date=${date.replace(/-/g, "")}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${idToken}` } });
    if (!res.ok) return { code, date, price: null, source: "error", error: `${res.status} ${await res.text()}` };
    const json = (await res.json()) as { daily_quotes?: Record<string, unknown>[] };
    const row = json.daily_quotes?.[0];
    return { code, date, price: row ? pickPrice(row) : null, source: row ? "jquants" : "missing" };
  } catch (e) {
    return { code, date, price: null, source: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

function targetEvents(events: ListingEvent[]): { event: ListingEvent; horizon: "30d" | "90d"; reviewDate: string }[] {
  const targets: { event: ListingEvent; horizon: "30d" | "90d"; reviewDate: string }[] = [];
  for (const event of events) {
    if (event.eventType !== "listing_day" || !event.code || !event.eventDate) continue;
    const d30 = addDays(event.eventDate, 30);
    const d90 = addDays(event.eventDate, 90);
    if (d30) targets.push({ event, horizon: "30d", reviewDate: d30 });
    if (d90) targets.push({ event, horizon: "90d", reviewDate: d90 });
  }
  return targets;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return s.includes(",") ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const writeCsv = process.argv.includes("--write-csv");
  const generatedAt = todayJst();
  const events = readJsonl<ListingEvent>(DATA_PATH);
  const targets = targetEvents(events);
  const lines: string[] = [];
  let idToken: string | null = null;
  let setupError: string | null = null;

  try {
    idToken = await getIdToken();
  } catch (e) {
    setupError = e instanceof Error ? e.message : String(e);
  }

  const results: (QuoteResult & { name: string; horizon: "30d" | "90d"; publicPrice?: number | null; initialPrice?: number | null })[] = [];
  if (idToken) {
    for (const target of targets) {
      const q = await fetchQuote(idToken, target.event.code!, target.reviewDate);
      results.push({ ...q, name: target.event.name, horizon: target.horizon, publicPrice: target.event.publicPrice ?? null, initialPrice: target.event.initialPrice ?? null });
    }
  }

  lines.push("# J-Quants 上場レビュー価格取得", "", `date: ${generatedAt}`, "");
  lines.push("> 買い推奨ではありません。上場後30日/90日のreviewPriceをJ-Quantsから取得するためのdry-runです。", "");
  lines.push(`- configured: ${Boolean(process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD)}`);
  lines.push(`- writeCsv: ${writeCsv}`);
  lines.push(`- targets: ${targets.length}`);
  lines.push(`- results: ${results.length}`);
  if (setupError) lines.push(`- setupError: ${setupError}`);
  if (!process.env.JQUANTS_EMAIL || !process.env.JQUANTS_PASSWORD) {
    lines.push("", "## setup needed", "");
    lines.push("JQUANTS_EMAIL / JQUANTS_PASSWORD を .env に設定してください。", "");
  }
  lines.push("", "## results", "");
  for (const r of results) lines.push(`- ${r.code} ${r.name} / ${r.horizon} / ${r.date} / price=${r.price ?? "missing"} / source=${r.source}${r.error ? ` / error=${r.error}` : ""}`);

  if (writeCsv && results.length > 0) {
    mkdirSync("data", { recursive: true });
    const csv = ["code,publicPrice,initialPrice,reviewPrice,topixRelativeReturn", ...results.map(r => [r.code, r.publicPrice ?? "", r.initialPrice ?? "", r.price ?? "", ""].map(csvEscape).join(","))].join("\n") + "\n";
    writeFileSync(OUT_CSV_PATH, csv, "utf-8");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/jquants_listing_review_prices_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/jquants_listing_review_prices_latest.json", JSON.stringify({ generatedAt, targets, results, setupError }, null, 2), "utf-8");
  console.log(`jquants listing review prices generated: results=${results.length}, writeCsv=${writeCsv}`);
}

main();
