import { execSync } from "child_process";
import type { ScoreResult, AlertLevel } from "./types.js";

const ALERT_EMOJI: Record<AlertLevel, string> = {
  urgent: "🚨",
  daily: "📋",
  log: "📝",
  ignore: "➖",
};

function buildNotifyTitle(result: ScoreResult): string {
  const emoji = ALERT_EMOJI[result.alertLevel];
  return `${emoji} 調査候補: ${result.candidate.code} ${result.candidate.name}`;
}

function buildNotifyBody(result: ScoreResult): string {
  const topReasons = result.reasons.slice(0, 3).join(" / ");
  return `スコア ${result.score}点 | ${topReasons}\n※買い推奨ではありません`;
}

function notifyMacOS(title: string, body: string): void {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeBody = body.replace(/"/g, '\\"');
  try {
    execSync(
      `osascript -e 'display notification "${safeBody}" with title "${safeTitle}"'`,
      { stdio: "ignore" }
    );
  } catch {
    // macOS通知が使えない環境では無視
  }
}

async function notifySlack(
  webhookUrl: string,
  result: ScoreResult
): Promise<void> {
  const fields = [
    { title: "スコア", value: `${result.score} / 100`, short: true },
    { title: "レベル", value: result.alertLevel.toUpperCase(), short: true },
    { title: "検出理由", value: result.reasons.slice(0, 4).map(r => `• ${r}`).join("\n"), short: false },
  ];

  if (result.negativeReasons.length > 0) {
    fields.push({
      title: "注意点",
      value: result.negativeReasons.slice(0, 3).map(r => `• ${r}`).join("\n"),
      short: false,
    });
  }

  const color = result.alertLevel === "urgent" ? "danger" : "warning";

  const payload = {
    attachments: [
      {
        color,
        title: `【調査候補】${result.candidate.code} ${result.candidate.name}`,
        fields,
        footer: "alpha-pon | ※買い推奨ではありません",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.warn(`Slack通知失敗: ${res.status}`);
  }
}

async function notifyDailySummarySlack(
  webhookUrl: string,
  results: ScoreResult[],
  date: string
): Promise<void> {
  const urgent = results.filter(r => r.alertLevel === "urgent");
  const daily = results.filter(r => r.alertLevel === "daily");
  const notifiable = [...urgent, ...daily];

  if (notifiable.length === 0) {
    const payload = {
      text: `📋 alpha-pon ${date} — 通知対象なし（全${results.length}件スコア不足）`,
    };
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return;
  }

  const lines = [
    `📋 *alpha-pon 朝まとめ ${date}*`,
    `🚨 即通知: ${urgent.length}件 / 📋 朝まとめ: ${daily.length}件`,
    "",
    ...notifiable.map(r => {
      const emoji = r.alertLevel === "urgent" ? "🚨" : "📋";
      return `${emoji} *${r.candidate.code} ${r.candidate.name}* — ${r.score}点\n　${r.reasons[0] ?? ""}`;
    }),
    "",
    "_※買い推奨ではありません_",
  ];

  const payload = { text: lines.join("\n") };
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function sendUrgentNotifications(results: ScoreResult[]): Promise<void> {
  const urgent = results.filter(r => r.alertLevel === "urgent");
  const slackUrl = process.env.SLACK_WEBHOOK_URL;

  for (const result of urgent) {
    const title = buildNotifyTitle(result);
    const body = buildNotifyBody(result);

    notifyMacOS(title, body);
    console.log(`  通知送信: ${title}`);

    if (slackUrl) {
      await notifySlack(slackUrl, result);
    }
  }
}

export async function sendDailySummary(
  results: ScoreResult[],
  date: string
): Promise<void> {
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (!slackUrl) return;

  await notifyDailySummarySlack(slackUrl, results, date);
}
