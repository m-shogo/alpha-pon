import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";

type Alert = {
  id: string;
  code?: string;
  name: string;
  eventType: string;
  eventDate?: string | null;
  alertType: "upcoming" | "review_due" | "missing_date";
  daysUntil: number | null;
  effectiveNotificationLevel: "priority" | "morning_summary" | "log";
  reason: string;
};

type AlertsPayload = {
  generatedAt: string;
  alerts: Alert[];
  totalEvents: number;
};

type SendResult = {
  target: "line" | "slack";
  configured: boolean;
  sent: boolean;
  status?: number;
  error?: string;
};

const ALERTS_PATH = "reports/listing_event_alerts_latest.json";

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function buildMessage(alerts: Alert[]): string {
  const priority = alerts.filter(alert => alert.effectiveNotificationLevel === "priority");
  const missing = alerts.filter(alert => alert.alertType === "missing_date");
  const lines: string[] = [];
  lines.push("【alpha-pon 上場イベント確認】");
  lines.push(`priority: ${priority.length} / backfill: ${missing.length}`);
  if (priority.length > 0) {
    lines.push("", "■ Priority");
    for (const alert of priority.slice(0, 10)) {
      const code = alert.code ? `${alert.code} ` : "";
      const date = alert.eventDate ?? "日付未登録";
      const days = alert.daysUntil == null ? "" : ` / ${alert.daysUntil}日後`;
      lines.push(`- ${code}${alert.name} / ${alert.eventType} / ${date}${days}`);
      lines.push(`  ${alert.reason}`);
    }
  }
  if (missing.length > 0) {
    lines.push("", "■ Backfill needed");
    for (const alert of missing.slice(0, 10)) {
      lines.push(`- ${alert.name} / ${alert.eventType} / 日付未登録`);
    }
  }
  if (priority.length === 0 && missing.length === 0) lines.push("本日の上場イベント確認対象はありません。");
  lines.push("", "※調査・記録用。買い指示ではありません。");
  return lines.join("\n");
}

async function sendLine(message: string, enabled: boolean): Promise<SendResult> {
  const token = process.env.LINE_CHANNEL_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) return { target: "line", configured: false, sent: false };
  if (!enabled) return { target: "line", configured: true, sent: false };
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text: message.slice(0, 4900) }] }),
    });
    return { target: "line", configured: true, sent: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
  } catch (e) {
    return { target: "line", configured: true, sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendSlack(message: string, enabled: boolean): Promise<SendResult> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return { target: "slack", configured: false, sent: false };
  if (!enabled) return { target: "slack", configured: true, sent: false };
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    return { target: "slack", configured: true, sent: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
  } catch (e) {
    return { target: "slack", configured: true, sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const send = process.argv.includes("--send");
  const generatedAt = todayJst();
  const payload = readJson<AlertsPayload>(ALERTS_PATH, { generatedAt, alerts: [], totalEvents: 0 });
  const message = buildMessage(payload.alerts);
  const results = [await sendLine(message, send), await sendSlack(message, send)];

  const lines: string[] = [];
  lines.push("# listing event alert sender", "", `date: ${generatedAt}`, "");
  lines.push("> 通常はdry-runです。`--send` がある時だけLINE/Slackへ送信します。買い推奨ではありません。", "");
  lines.push(`- send: ${send}`);
  for (const result of results) lines.push(`- ${result.target}: configured=${result.configured} sent=${result.sent} status=${result.status ?? "-"} error=${result.error ?? "-"}`);
  lines.push("", "## message", "", "```text", message, "```", "");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_alert_sender_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_event_alert_sender_latest.json", JSON.stringify({ generatedAt, send, message, results }, null, 2), "utf-8");
  console.log(`listing event alert sender generated: send=${send}`);
}

main();
