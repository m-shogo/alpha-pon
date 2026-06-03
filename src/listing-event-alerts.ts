import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type NotificationLevel = "priority" | "morning_summary" | "log";
type ListingEventType =
  | "ipo_approved"
  | "bookbuilding"
  | "listing_day"
  | "first_earnings"
  | "lockup_expiry"
  | "post_ipo_30d"
  | "post_ipo_90d"
  | "pre_ipo";

type ListingEvent = {
  id: string;
  code?: string;
  name: string;
  market?: string;
  eventType: ListingEventType | string;
  eventDate?: string | null;
  source?: string;
  status?: string;
  notificationLevel?: NotificationLevel;
  whyWatch?: string;
  relatedPattern?: string;
  notes?: string[];
  evidenceToBackfill?: string[];
};

type Config = {
  requiredMilestones?: Record<string, { notificationLevel?: NotificationLevel }>;
  manualSeedEvents?: ListingEvent[];
};

type Alert = ListingEvent & {
  alertType: "upcoming" | "review_due" | "missing_date";
  daysUntil: number | null;
  effectiveNotificationLevel: NotificationLevel;
  reason: string;
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

function parseDate(date: string | null | undefined): Date | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(fromDate: string, toDate: string): number | null {
  const from = parseDate(fromDate);
  const to = parseDate(toDate);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function windowDays(eventType: string): number {
  if (eventType === "listing_day") return 7;
  if (eventType === "first_earnings") return 14;
  if (eventType === "lockup_expiry") return 30;
  if (eventType === "post_ipo_30d") return 3;
  if (eventType === "post_ipo_90d") return 7;
  if (eventType === "ipo_approved" || eventType === "bookbuilding") return 14;
  return 14;
}

function defaultLevel(eventType: string, config: Config): NotificationLevel {
  return config.requiredMilestones?.[eventType]?.notificationLevel ?? "morning_summary";
}

function toAlert(event: ListingEvent, today: string, config: Config): Alert | null {
  const level = event.notificationLevel ?? defaultLevel(event.eventType, config);
  const eventDate = event.eventDate ?? null;
  if (!eventDate) {
    return {
      ...event,
      eventDate,
      alertType: "missing_date",
      daysUntil: null,
      effectiveNotificationLevel: level,
      reason: "eventDate が未登録です。上場日/初回決算/ロックアップ解除日を backfill してください。",
    };
  }

  const daysUntil = daysBetween(today, eventDate);
  if (daysUntil === null) {
    return {
      ...event,
      alertType: "missing_date",
      daysUntil: null,
      effectiveNotificationLevel: level,
      reason: "eventDate の形式が不正です。YYYY-MM-DD で登録してください。",
    };
  }

  const window = windowDays(event.eventType);
  if (daysUntil >= 0 && daysUntil <= window) {
    return {
      ...event,
      alertType: "upcoming",
      daysUntil,
      effectiveNotificationLevel: level,
      reason: `${event.eventType} が ${daysUntil} 日以内です。通知候補として確認してください。`,
    };
  }

  if ((event.eventType === "post_ipo_30d" || event.eventType === "post_ipo_90d") && daysUntil <= 0 && daysUntil >= -7) {
    return {
      ...event,
      alertType: "review_due",
      daysUntil,
      effectiveNotificationLevel: level,
      reason: `${event.eventType} のレビュー期限です。公開価格比・初値比・TOPIX比・出来高を確認してください。`,
    };
  }

  return null;
}

function uniqueEvents(events: ListingEvent[]): ListingEvent[] {
  const seen = new Set<string>();
  const results: ListingEvent[] = [];
  for (const event of events) {
    const key = `${event.id}:${event.eventType}:${event.eventDate ?? "missing"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(event);
  }
  return results;
}

function list(lines: string[], items: string[] | undefined, indent = "  - ") {
  for (const item of items ?? []) lines.push(`${indent}${item}`);
}

function main() {
  const today = todayJst();
  const config = readYaml<Config>(CONFIG_PATH, {});
  const events = uniqueEvents([...(config.manualSeedEvents ?? []), ...readJsonl<ListingEvent>(DATA_PATH)]);
  const alerts = events.map(event => toAlert(event, today, config)).filter((alert): alert is Alert => alert !== null);
  const priority = alerts.filter(alert => alert.effectiveNotificationLevel === "priority");
  const missingDate = alerts.filter(alert => alert.alertType === "missing_date");
  const lines: string[] = [];

  lines.push("# 上場イベント通知候補", "", `date: ${today}`, "");
  lines.push("> 買い推奨ではありません。上場予定・上場日・初回決算・ロックアップ解除を見逃さないための通知候補です。", "");
  lines.push(`- totalEvents: ${events.length}`);
  lines.push(`- alerts: ${alerts.length}`);
  lines.push(`- priority: ${priority.length}`);
  lines.push(`- missingDate: ${missingDate.length}`, "");

  lines.push("## priority", "");
  for (const alert of priority) {
    lines.push(`### ${alert.name} (${alert.id})`, "");
    if (alert.code) lines.push(`- code: ${alert.code}`);
    lines.push(`- eventType: ${alert.eventType}`);
    lines.push(`- eventDate: ${alert.eventDate ?? "未登録"}`);
    lines.push(`- daysUntil: ${alert.daysUntil ?? "unknown"}`);
    lines.push(`- reason: ${alert.reason}`);
    if (alert.whyWatch) lines.push(`- whyWatch: ${alert.whyWatch}`);
    lines.push("- evidence/backfill:");
    list(lines, alert.evidenceToBackfill);
    lines.push("");
  }

  lines.push("## all alerts", "");
  for (const alert of alerts) {
    lines.push(`- [${alert.effectiveNotificationLevel}] ${alert.name} / ${alert.eventType} / ${alert.eventDate ?? "未登録"} / ${alert.reason}`);
  }
  lines.push("");

  if (missingDate.length > 0) {
    lines.push("## backfill needed", "");
    for (const alert of missingDate) {
      lines.push(`### ${alert.name} (${alert.id})`, "");
      lines.push(`- eventType: ${alert.eventType}`);
      lines.push(`- reason: ${alert.reason}`);
      lines.push("- evidenceToBackfill:");
      list(lines, alert.evidenceToBackfill);
      lines.push("");
    }
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_alerts_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_event_alerts_latest.json", JSON.stringify({ generatedAt: today, alerts, totalEvents: events.length }, null, 2), "utf-8");
  console.log(`listing event alerts generated: ${alerts.length}`);
}

main();
