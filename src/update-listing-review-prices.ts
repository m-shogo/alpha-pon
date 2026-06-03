import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

type ListingEvent = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate?: string | null;
  publicPrice?: number | null;
  initialPrice?: number | null;
  reviewPrice?: number | null;
  topixRelativeReturn?: number | null;
  notes?: string[];
};

type PriceRow = {
  code?: string;
  id?: string;
  reviewDate?: string;
  publicPrice?: number | null;
  initialPrice?: number | null;
  reviewPrice?: number | null;
  topixRelativeReturn?: number | null;
};

const DATA_PATH = "data/listing_events.jsonl";
const CSV_PATH = process.env.LISTING_REVIEW_PRICE_CSV ?? "data/listing_review_prices.csv";

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(path: string): PriceRow[] {
  if (!existsSync(path)) return [];
  const [headerLine, ...rows] = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  const headers = headerLine.split(",").map(h => h.trim());
  return rows.map(row => {
    const cols = row.split(",").map(v => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return {
      id: obj.id || undefined,
      code: obj.code || undefined,
      reviewDate: obj.reviewDate || undefined,
      publicPrice: parseNumber(obj.publicPrice),
      initialPrice: parseNumber(obj.initialPrice),
      reviewPrice: parseNumber(obj.reviewPrice),
      topixRelativeReturn: parseNumber(obj.topixRelativeReturn),
    };
  });
}

function matchRow(event: ListingEvent, rows: PriceRow[]): PriceRow | undefined {
  return rows.find(row => (row.id && row.id === event.id) || (row.code && event.code && row.code === event.code));
}

function mergeEvent(event: ListingEvent, row: PriceRow | undefined): ListingEvent {
  if (!row) return event;
  return {
    ...event,
    publicPrice: row.publicPrice ?? event.publicPrice ?? null,
    initialPrice: row.initialPrice ?? event.initialPrice ?? null,
    reviewPrice: row.reviewPrice ?? event.reviewPrice ?? null,
    topixRelativeReturn: row.topixRelativeReturn ?? event.topixRelativeReturn ?? null,
    notes: [...(event.notes ?? []), `review price imported ${todayJst()}`],
  };
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = todayJst();
  const events = readJsonl<ListingEvent>(DATA_PATH);
  const rows = parseCsv(CSV_PATH);
  const updated = events.map(event => mergeEvent(event, matchRow(event, rows)));
  const changed = updated.filter((event, i) => JSON.stringify(event) !== JSON.stringify(events[i]));

  const lines: string[] = [];
  lines.push("# listing review price import", "", `date: ${generatedAt}`, "");
  lines.push("> 買い推奨ではありません。J-Quants/TOPIX等から作ったCSVを listing_events.jsonl に反映するためのpreviewです。", "");
  lines.push(`- csvPath: ${CSV_PATH}`);
  lines.push(`- write: ${write}`);
  lines.push(`- events: ${events.length}`);
  lines.push(`- csvRows: ${rows.length}`);
  lines.push(`- changed: ${changed.length}`, "");

  if (!existsSync(CSV_PATH)) {
    lines.push("## setup needed", "");
    lines.push("CSVを用意してください。例: data/listing_review_prices.csv", "");
    lines.push("```csv");
    lines.push("code,publicPrice,initialPrice,reviewPrice,topixRelativeReturn");
    lines.push("285A,1455,1440,1800,0.12");
    lines.push("```");
  }

  lines.push("## changed", "");
  for (const event of changed) lines.push(`- ${event.code ?? "no-code"} ${event.name} / public=${event.publicPrice ?? "missing"} / initial=${event.initialPrice ?? "missing"} / review=${event.reviewPrice ?? "missing"} / topix=${event.topixRelativeReturn ?? "missing"}`);

  if (write) {
    mkdirSync("data", { recursive: true });
    writeFileSync(DATA_PATH, updated.map(event => JSON.stringify(event)).join("\n") + (updated.length ? "\n" : ""), "utf-8");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_review_price_import_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_review_price_import_latest.json", JSON.stringify({ generatedAt, csvPath: CSV_PATH, write, changed }, null, 2), "utf-8");
  console.log(`listing review price import generated: changed=${changed.length}, write=${write}`);
}

main();
