import { mkdirSync, writeFileSync, appendFileSync } from "fs";
import { todayJst } from "./date.js";
import { readListingEventSyncConfig } from "./listing-event-sync-config.js";
import {
  readListingEventSyncExistingInput,
  type ListingEventSyncExistingRow as ListingEvent,
} from "./listing-event-sync-input.js";
import { partitionListingSyncRows } from "./listing-event-sync-preview.js";

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
  warnings: string[];
};

const CONFIG_PATH = "config/listing-event-watch.yml";
const DATA_PATH = "data/listing_events.jsonl";

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
  lines.push(`- backfillRequiredCount: ${result.backfillRequiredCount}`);
  lines.push(`- inputWarnings: ${result.warnings.length}`, "");
  for (const warning of result.warnings) lines.push(`- warning: ${warning}`);
  if (result.warnings.length > 0) lines.push("");

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
  const configInput = readListingEventSyncConfig(CONFIG_PATH);
  const sourceEvents = configInput.rows.map(normalize);
  const existingInput = readListingEventSyncExistingInput(DATA_PATH);
  const existingEvents = existingInput.rows.map(normalize);
  const warnings = [...configInput.warnings, ...existingInput.warnings];
  const { appendable, duplicates } = partitionListingSyncRows(sourceEvents, existingEvents);
  const backfillRequired = sourceEvents.filter(event => !event.eventDate);

  if (write && warnings.length > 0) {
    throw new Error(`refusing to sync listing events while input has warnings=${warnings.length}`);
  }
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
    warnings,
  };
  writeReport(result);
  console.log(`listing event sync preview generated: appendable=${appendable.length}, write=${write}, warnings=${warnings.length}`);
}

main();