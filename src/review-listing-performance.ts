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
};

type ReviewRow = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate: string | null;
  horizon: "30d" | "90d";
  reviewDate: string | null;
  publicPrice: number | null;
  initialPrice: number | null;
  reviewPrice: number | null;
  publicPriceReturn: number | null;
  initialPriceReturn: number | null;
  topixRelativeReturn: number | null;
  dataQuality: "missing_price" | "partial" | "ready";
  missingFields: string[];
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

function addDays(date: string | null | undefined, days: number): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function calcReturn(base: number | null | undefined, price: number | null | undefined): number | null {
  if (base == null || price == null || base === 0) return null;
  return (price - base) / base;
}

function quality(row: Omit<ReviewRow, "dataQuality" | "missingFields">): { dataQuality: ReviewRow["dataQuality"]; missingFields: string[] } {
  const missingFields: string[] = [];
  if (!row.eventDate) missingFields.push("eventDate");
  if (!row.publicPrice) missingFields.push("publicPrice");
  if (!row.initialPrice) missingFields.push("initialPrice");
  if (!row.reviewPrice) missingFields.push("reviewPrice");
  if (row.topixRelativeReturn == null) missingFields.push("topixRelativeReturn");
  const dataQuality = missingFields.length === 0 ? "ready" : missingFields.includes("reviewPrice") ? "missing_price" : "partial";
  return { dataQuality, missingFields };
}

function buildRows(event: ListingEvent): ReviewRow[] {
  if (event.eventType !== "listing_day") return [];
  return ([30, 90] as const).map(days => {
    const horizon = `${days}d` as "30d" | "90d";
    const base = {
      id: `${event.id}-${horizon}`,
      code: event.code,
      name: event.name,
      eventType: event.eventType,
      eventDate: event.eventDate ?? null,
      horizon,
      reviewDate: addDays(event.eventDate, days),
      publicPrice: event.publicPrice ?? null,
      initialPrice: event.initialPrice ?? null,
      reviewPrice: event.reviewPrice ?? null,
      publicPriceReturn: calcReturn(event.publicPrice, event.reviewPrice),
      initialPriceReturn: calcReturn(event.initialPrice, event.reviewPrice),
      topixRelativeReturn: event.topixRelativeReturn ?? null,
    };
    return { ...base, ...quality(base) };
  });
}

function pct(value: number | null): string {
  return value == null ? "missing" : `${(value * 100).toFixed(1)}%`;
}

function main() {
  const today = todayJst();
  const events = readJsonl<ListingEvent>(DATA_PATH);
  const rows = events.flatMap(buildRows);
  const missing = rows.filter(row => row.dataQuality !== "ready");
  const lines: string[] = [];

  lines.push("# 上場後30日/90日レビュー", "", `date: ${today}`, "");
  lines.push("> 買い推奨ではありません。J-Quants/TOPIX連携前後で、上場後30日/90日の公開価格比・初値比・TOPIX比を確認する入口です。", "");
  lines.push(`- rows: ${rows.length}`);
  lines.push(`- missingOrPartial: ${missing.length}`, "");

  lines.push("## rows", "");
  for (const row of rows) {
    lines.push(`- ${row.code ?? "no-code"} ${row.name} / ${row.horizon} / reviewDate=${row.reviewDate ?? "missing"} / quality=${row.dataQuality} / public=${pct(row.publicPriceReturn)} / initial=${pct(row.initialPriceReturn)} / topix=${pct(row.topixRelativeReturn)}`);
    if (row.missingFields.length > 0) lines.push(`  - missing: ${row.missingFields.join(", ")}`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_performance_review_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_performance_review_latest.json", JSON.stringify({ generatedAt: today, rows }, null, 2), "utf-8");
  console.log(`listing performance review generated: rows=${rows.length}`);
}

main();
