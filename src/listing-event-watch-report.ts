import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { readListingEventSyncConfig } from "./listing-event-sync-config.js";

type Milestone = {
  label: string;
  notificationLevel: "priority" | "morning_summary" | "log";
  whyImportant: string;
  evidenceNeeded?: string[];
  doNotTouchReasons?: string[];
};

type Pattern = {
  label: string;
  whyImportant: string;
  requiredQuestions?: string[];
  relatedThemes?: string[];
};

type ManualSeedEvent = {
  id: string;
  name: string;
  code?: string;
  market?: string;
  eventType: string;
  status: string;
  notificationLevel: "priority" | "morning_summary" | "log";
  whyWatch: string;
  relatedPattern: string;
  evidenceToBackfill?: string[];
};

type Config = {
  watchPolicy?: {
    defaultNotificationLevel?: string;
    neverTreatAs?: string;
    importantReason?: string;
    safetyRules?: string[];
  };
  requiredMilestones?: Record<string, Milestone>;
  patternsToLearn?: Record<string, Pattern>;
  manualSeedEvents?: ManualSeedEvent[];
};

const CONFIG_PATH = "config/listing-event-watch.yml";

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function list(lines: string[], items: string[] | undefined, indent = "- ") {
  for (const item of items ?? []) lines.push(`${indent}${item}`);
}

function main() {
  const config = readYaml<Config>(CONFIG_PATH, {});
  const seedInput = readListingEventSyncConfig(CONFIG_PATH);
  const date = todayJst();
  const lines: string[] = [];

  lines.push("# 上場イベント監視レポート", "", `date: ${date}`, "");
  lines.push("> 買い推奨ではありません。上場予定・上場日・初回決算・ロックアップ解除を、情勢/需給/タイミング学習のために見逃さないレポートです。", "");
  lines.push(`- inputWarnings: ${seedInput.warnings.length}`);
  for (const warning of seedInput.warnings) lines.push(`- warning: ${warning}`);
  if (seedInput.warnings.length > 0) lines.push("");

  if (config.watchPolicy) {
    lines.push("## watch policy", "");
    lines.push(`- defaultNotificationLevel: ${config.watchPolicy.defaultNotificationLevel ?? "unknown"}`);
    lines.push(`- neverTreatAs: ${config.watchPolicy.neverTreatAs ?? "unknown"}`);
    lines.push(`- importantReason: ${config.watchPolicy.importantReason ?? ""}`, "");
    lines.push("### safety rules");
    list(lines, config.watchPolicy.safetyRules);
    lines.push("");
  }

  lines.push("## required milestones", "");
  for (const [milestoneId, milestone] of Object.entries(config.requiredMilestones ?? {})) {
    lines.push(`### ${milestone.label} (${milestoneId})`, "");
    lines.push(`- notificationLevel: ${milestone.notificationLevel}`);
    lines.push(`- whyImportant: ${milestone.whyImportant}`, "");
    lines.push("確認する証拠:");
    list(lines, milestone.evidenceNeeded);
    if ((milestone.doNotTouchReasons ?? []).length > 0) {
      lines.push("急がない/触らない理由:");
      list(lines, milestone.doNotTouchReasons);
    }
    lines.push("");
  }

  lines.push("## patterns to learn", "");
  for (const [patternId, pattern] of Object.entries(config.patternsToLearn ?? {})) {
    lines.push(`### ${pattern.label} (${patternId})`, "");
    lines.push(pattern.whyImportant, "");
    lines.push("問い:");
    list(lines, pattern.requiredQuestions);
    lines.push("関連テーマ:");
    list(lines, pattern.relatedThemes);
    lines.push("");
  }

  lines.push("## manual seed events", "");
  for (const event of seedInput.rows) {
    lines.push(`### ${event.name} (${event.id})`, "");
    if (event.code) lines.push(`- code: ${event.code}`);
    if (event.market) lines.push(`- market: ${event.market}`);
    lines.push(`- eventType: ${event.eventType}`);
    lines.push(`- status: ${event.status ?? "unknown"}`);
    lines.push(`- notificationLevel: ${event.notificationLevel ?? "morning_summary"}`);
    lines.push(`- relatedPattern: ${event.relatedPattern ?? "unknown"}`);
    lines.push(`- whyWatch: ${event.whyWatch ?? ""}`, "");
    lines.push("backfillする証拠:");
    list(lines, event.evidenceToBackfill);
    lines.push("");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_watch_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_event_watch_latest.json", JSON.stringify({
    generatedAt: date,
    ...config,
    manualSeedEvents: seedInput.rows,
    warnings: seedInput.warnings,
  }, null, 2), "utf-8");
  console.log("listing event watch report generated");
}

main();
