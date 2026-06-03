import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { load } from "js-yaml";
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
};

type Config = {
  manualSeedEvents?: ListingEvent[];
};

type SyncResult = {
  generatedAt: string;
  write: boolean;
  sourceCount: number;
  existingCount: number;
  appendableCount: number;
  duplicateCount: number;
  backfillRequiredCount: number;
  appendable: ListingEvent[];
  duplicates: ListingEvent[];
  backfillRequired: ListingEvent[];
};

const CONFIG_PATH = "config/listing-event-watch.yml";
const DATA_PATH = "data/listing_events.jsonl";

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

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

function normalize(event: ListingEvent): ListingEvent {
  return {
    ...event,
    eventDate: event.eventDate ?? null,
    source: event.source ?? "manual_seed",
    status: event.status ?? "watch",
    notes: event.notes ?? [],
    evidenceToBackfill: event.evidenceToBackfill ?? [],
  };
}

function writeReport(result: SyncResult) {
  const lines: string[] = [];
  lines.push("# listing event sync preview", "", `date: ${result.generatedAt}`, "");
  lines.push("> 買い推奨ではありません。manualSeedEvents を listing_events.jsonl に同期するための preview です。", "");
  lines.push(`- write: ${result.write}`);
  lines.push(`- sourceCount: ${result.sourceCount}`);
  lines.push(`- existingCount: ${result.existingCount}`);
  lines.push(`- appendableCount: ${result.appendableCount}`);
  lines.push(`- duplicateCount: ${result.duplicateCount}`);
  lines.push(`- backfillRequiredCount: ${result.backfillRequiredCount}`, "");

  lines.push("## appendable", "");
  for (const event of result.appendable) {
    lines.push(`- ${event.name} / ${event.eventType} / ${event.eventDate ?? "未登録"} / ${event.notificationLevel ?? "unknown"}`);
  }
  lines.push("");

  lines.push("## backfill required", "");
  for (const event of result.backfillRequired) {
    lines.push(`### ${event.name} (${event.id})`, "");
    lines.push(`- eventType: ${event.eventType}`);
    lines.push(`- eventDate: ${event.eventDate ?? "未登録"}`);
    lines.push(`- whyWatch: ${event.whyWatch ?? ""}`);
    lines.push("- evidenceToBackfill:");
    for (const item of event.evidenceToBackfill ?? []) lines.push(`  - ${item}`);
    lines.push("");
  }

  lines.push("## duplicates", "");
  for (const event of result.duplicates) {
    lines.push(`- ${event.name} / ${event.eventType} / ${event.eventDate ?? "未登録"}`);
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_sync_preview_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_event_sync_preview_latest.json", JSON.stringify(result, null, 2), "utf-8");
}

function main() {
  const write = process.argv.includes("--write");
  const generatedAt = todayJst();
  const config = readYaml<Config>(CONFIG_PATH, { manualSeedEvents: [] });
  const sourceEvents = (config.manualSeedEvents ?? []).map(normalize);
  const existingEvents = readJsonl<ListingEvent>(DATA_PATH).map(normalize);
  const existingKeys = new Set(existingEvents.map(keyOf));
  const appendable = sourceEvents.filter(event => !existingKeys.has(keyOf(event)));
  const duplicates = sourceEvents.filter(event => existingKeys.has(keyOf(event)));
  const backfillRequired = sourceEvents.filter(event => !event.eventDate);

  if (write && appendable.length > 0) {
    mkdirSync("data", { recursive: true });
    for (const event of appendable) {
      appendFileSync(DATA_PATH, `${JSON.stringify(event)}\n`, "utf-8");
    }
  }

  const result: SyncResult = {
    generatedAt,
    write,
    sourceCount: sourceEvents.length,
    existingCount: existingEvents.length,
    appendableCount: appendable.length,
    duplicateCount: duplicates.length,
    backfillRequiredCount: backfillRequired.length,
    appendable,
    duplicates,
    backfillRequired,
  };
  writeReport(result);
  console.log(`listing event sync preview generated: appendable=${appendable.length}, write=${write}`);
}

main();
