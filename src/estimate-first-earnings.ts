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
  status?: string;
  notificationLevel?: "priority" | "morning_summary" | "log";
  whyWatch?: string;
  relatedPattern?: string;
  notes?: string[];
  evidenceToBackfill?: string[];
  estimated?: boolean;
  confidence?: "low" | "medium" | "high";
};

const DATA_PATH = "data/listing_events.jsonl";

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

function addDays(date: string, days: number): string | null {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function estimateFirstEarnings(listing: ListingEvent): ListingEvent | null {
  if (listing.eventType !== "listing_day" || !listing.eventDate) return null;
  const estimatedDate = addDays(listing.eventDate, 75);
  if (!estimatedDate) return null;
  return {
    id: `${listing.id}-first-earnings-estimated`,
    code: listing.code,
    name: listing.name,
    market: listing.market,
    eventType: "first_earnings",
    eventDate: estimatedDate,
    source: "estimated_from_listing_day",
    status: "estimated_watch",
    notificationLevel: "morning_summary",
    whyWatch: "上場日から機械的に推定した初回決算候補日。公式日程確認前のため、priorityではなく確認待ち扱い。",
    relatedPattern: listing.relatedPattern,
    estimated: true,
    confidence: "low",
    notes: ["初回決算予定日の推定", "公式確認前", "買い推奨ではない"],
    evidenceToBackfill: ["公式決算発表予定日", "決算短信", "会社IRカレンダー", "上場後初回決算資料"],
  };
}

function writeReport(params: {
  generatedAt: string;
  write: boolean;
  estimated: ListingEvent[];
  appendable: ListingEvent[];
  duplicates: ListingEvent[];
}) {
  const lines: string[] = [];
  lines.push("# 初回決算予定日 推定レポート", "", `date: ${params.generatedAt}`, "");
  lines.push("> 買い推奨ではありません。上場日から初回決算候補日を仮置きし、公式確認が必要なイベントとして扱います。", "");
  lines.push(`- write: ${params.write}`);
  lines.push(`- estimated: ${params.estimated.length}`);
  lines.push(`- appendable: ${params.appendable.length}`);
  lines.push(`- duplicates: ${params.duplicates.length}`, "");
  lines.push("## appendable estimates", "");
  for (const event of params.appendable) {
    lines.push(`- ${event.code ?? "no-code"} ${event.name} / ${event.eventDate} / confidence=${event.confidence}`);
  }
  lines.push("", "## duplicates", "");
  for (const event of params.duplicates) {
    lines.push(`- ${event.code ?? "no-code"} ${event.name} / ${event.eventDate}`);
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/first_earnings_estimate_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/first_earnings_estimate_latest.json", JSON.stringify(params, null, 2), "utf-8");
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = todayJst();
  const events = readJsonl<ListingEvent>(DATA_PATH);
  const existingKeys = new Set(events.map(keyOf));
  const estimated = events.map(estimateFirstEarnings).filter((event): event is ListingEvent => event !== null);
  const appendable = estimated.filter(event => !existingKeys.has(keyOf(event)));
  const duplicates = estimated.filter(event => existingKeys.has(keyOf(event)));
  if (write && appendable.length > 0) {
    mkdirSync("data", { recursive: true });
    for (const event of appendable) appendFileSync(DATA_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  }
  writeReport({ generatedAt, write, estimated, appendable, duplicates });
  console.log(`first earnings estimates generated: appendable=${appendable.length}, write=${write}`);
}

main();
