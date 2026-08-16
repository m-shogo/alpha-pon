import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  parseListingEventMessageInput,
  type ListingEventMessageAlert,
} from "./listing-event-message-preview-input.js";

const ALERTS_PATH = "reports/listing_event_alerts_latest.json";

function readAlerts(path: string): { alerts: ListingEventMessageAlert[]; warnings: string[] } {
  if (!existsSync(path)) return { alerts: [], warnings: [] };
  return parseListingEventMessageInput(readFileSync(path, "utf-8"));
}

function oneLine(alert: ListingEventMessageAlert): string {
  const code = alert.code ? `${alert.code} ` : "";
  const date = alert.eventDate ?? "日付未登録";
  const days = alert.daysUntil == null ? "" : ` / ${alert.daysUntil}日後`;
  return `- [${alert.effectiveNotificationLevel}] ${code}${alert.name} / ${alert.eventType} / ${date}${days}\n  ${alert.reason}`;
}

function main() {
  const generatedAt = todayJst();
  const { alerts, warnings } = readAlerts(ALERTS_PATH);
  const priority = alerts.filter(alert => alert.effectiveNotificationLevel === "priority");
  const morning = alerts.filter(alert => alert.effectiveNotificationLevel === "morning_summary");
  const missing = alerts.filter(alert => alert.alertType === "missing_date");
  const messageLines: string[] = [];

  messageLines.push("【alpha-pon 上場イベント確認】");
  messageLines.push(`priority: ${priority.length} / morning: ${morning.length} / backfill: ${missing.length}`);
  if (warnings.length > 0) {
    messageLines.push(`input warning: ${warnings.join("; ")}`);
  }
  if (priority.length > 0) {
    messageLines.push("", "■ Priority");
    priority.slice(0, 10).forEach(alert => messageLines.push(oneLine(alert)));
  }
  if (missing.length > 0) {
    messageLines.push("", "■ Backfill needed");
    missing.slice(0, 10).forEach(alert => messageLines.push(oneLine(alert)));
  }
  if (priority.length === 0 && morning.length === 0 && missing.length === 0) {
    messageLines.push("本日の上場イベント確認対象はありません。");
  }
  messageLines.push("", "※調査・記録用。買い指示ではありません。");

  const message = messageLines.join("\n");
  const md = ["# listing event message preview", "", `date: ${generatedAt}`, "", "> 外部送信はしません。通知文として強すぎないか確認するためのpreviewです。", "", "```text", message, "```", ""].join("\n");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_message_preview_latest.md", md, "utf-8");
  writeFileSync("reports/listing_event_message_preview_latest.json", JSON.stringify({ generatedAt, message, priority, morning, missing, warnings }, null, 2), "utf-8");
  console.log(`listing event message preview generated: priority=${priority.length}, missing=${missing.length}, warnings=${warnings.length}`);
}

main();
