import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
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

type NotificationPolicy = {
  policy?: {
    maxPriorityItems?: number;
    maxBackfillItems?: number;
    includeMorningSummary?: boolean;
    includeBackfillNeeded?: boolean;
    includeLogLevel?: boolean;
    suppressWhenNoPriority?: boolean;
    safetyFooter?: string;
  };
};

type SendResult = {
  target: "line" | "slack";
  configured: boolean;
  sent: boolean;
  status?: number;
  error?: string;
};

const ALERTS_PATH = "reports/listing_event_alerts_latest.json";
const POLICY_PATH = "config/listing-notification-policy.yml";

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readYaml<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return load(readFileSync(path, "utf-8")) as T;
}

function selectAlerts(alerts: Alert[], policy: Required<NonNullable<NotificationPolicy["policy"]>>) {
  const priority = alerts
    .filter(alert => alert.effectiveNotificationLevel === "priority")
    .slice(0, policy.maxPriorityItems);

  const morning = policy.includeMorningSummary
    ? alerts.filter(alert => alert.effectiveNotificationLevel === "morning_summary").slice(0, policy.maxPriorityItems)
    : [];

  const log = policy.includeLogLevel
    ? alerts.filter(alert => alert.effectiveNotificationLevel === "log").slice(0, policy.maxPriorityItems)
    : [];

  const backfill = policy.includeBackfillNeeded
    ? alerts.filter(alert => alert.alertType === "missing_date").slice(0, policy.maxBackfillItems)
    : [];

  return { priority, morning, log, backfill };
}

function lineFor(alert: Alert): string {
  const code = alert.code ? `${alert.code} ` : "";
  const date = alert.eventDate ?? "日付未登録";
  const days = alert.daysUntil == null ? "" : ` / ${alert.daysUntil}日後`;
  return `- ${code}${alert.name} / ${alert.eventType} / ${date}${days}\n  ${alert.reason}`;
}

function buildMessage(alerts: Alert[], policyConfig: NotificationPolicy): string {
  const policy = {
    maxPriorityItems: policyConfig.policy?.maxPriorityItems ?? 10,
    maxBackfillItems: policyConfig.policy?.maxBackfillItems ?? 5,
    includeMorningSummary: policyConfig.policy?.includeMorningSummary ?? false,
    includeBackfillNeeded: policyConfig.policy?.includeBackfillNeeded ?? true,
    includeLogLevel: policyConfig.policy?.includeLogLevel ?? false,
    suppressWhenNoPriority: policyConfig.policy?.suppressWhenNoPriority ?? false,
    safetyFooter: policyConfig.policy?.safetyFooter ?? "※調査・記録用。買い指示ではありません。",
  };

  const selected = selectAlerts(alerts, policy);
  const totalSelected = selected.priority.length + selected.morning.length + selected.log.length + selected.backfill.length;
  const lines: string[] = [];

  lines.push("【alpha-pon 上場イベント確認】");
  lines.push(`priority: ${selected.priority.length} / morning: ${selected.morning.length} / log: ${selected.log.length} / backfill: ${selected.backfill.length}`);

  if (policy.suppressWhenNoPriority && selected.priority.length === 0) {
    lines.push("priority が0件のため、詳細通知は抑制しました。reports を確認してください。");
    lines.push("", policy.safetyFooter);
    return lines.join("\n");
  }

  if (selected.priority.length > 0) {
    lines.push("", "■ Priority");
    selected.priority.forEach(alert => lines.push(lineFor(alert)));
  }
  if (selected.morning.length > 0) {
    lines.push("", "■ Morning summary");
    selected.morning.forEach(alert => lines.push(lineFor(alert)));
  }
  if (selected.log.length > 0) {
    lines.push("", "■ Log");
    selected.log.forEach(alert => lines.push(lineFor(alert)));
  }
  if (selected.backfill.length > 0) {
    lines.push("", "■ Backfill needed");
    selected.backfill.forEach(alert => lines.push(lineFor(alert)));
  }
  if (totalSelected === 0) lines.push("本日の上場イベント確認対象はありません。");
  lines.push("", policy.safetyFooter);
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
  const policy = readYaml<NotificationPolicy>(POLICY_PATH, {});
  const message = buildMessage(payload.alerts, policy);
  const results = [await sendLine(message, send), await sendSlack(message, send)];

  const lines: string[] = [];
  lines.push("# listing event alert sender policy", "", `date: ${generatedAt}`, "");
  lines.push("> 通常はdry-runです。`--send` がある時だけLINE/Slackへ送信します。通知ポリシーで件数と対象を制御します。買い推奨ではありません。", "");
  lines.push(`- send: ${send}`);
  lines.push(`- policyPath: ${POLICY_PATH}`);
  for (const result of results) lines.push(`- ${result.target}: configured=${result.configured} sent=${result.sent} status=${result.status ?? "-"} error=${result.error ?? "-"}`);
  lines.push("", "## message", "", "```text", message, "```", "");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_event_alert_sender_policy_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_event_alert_sender_policy_latest.json", JSON.stringify({ generatedAt, send, message, policy, results }, null, 2), "utf-8");
  console.log(`listing event alert sender policy generated: send=${send}`);
}

main();
