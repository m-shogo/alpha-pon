import { execFileSync } from "child_process";
import type { ScoreResult, AlertLevel } from "./types.js";
import { recordTextNotification, shouldSendTextNotification } from "./notification-dedupe.js";

// -------------------------------------------------------
// macOS ネイティブ通知
// -------------------------------------------------------

const SOUND_BY_LEVEL: Record<AlertLevel, string> = {
  urgent: "Funk",
  daily:  "Glass",
  log:    "",
  ignore: "",
};

const MORNING_LITE_ITEM_LIMIT = 5;

function appleScriptString(value: string): string {
  return JSON.stringify(value);
}

function notifyMacOS(result: ScoreResult): void {
  const sound = SOUND_BY_LEVEL[result.alertLevel];
  const title = `【調査候補】${result.candidate.code} ${result.candidate.name}`;
  const subtitle = `スコア ${result.score}/100`;
  const body = result.reasons.slice(0, 2).join(" | ") + "\n※買い推奨ではありません";

  const soundClause = sound ? ` sound name ${appleScriptString(sound)}` : "";
  const script =
    `display notification ${appleScriptString(body)} ` +
    `with title ${appleScriptString(title)} ` +
    `subtitle ${appleScriptString(subtitle)}` +
    soundClause;

  try {
    execFileSync("osascript", ["-e", script], { stdio: "ignore", timeout: 5000 });
  } catch {
    // SSH経由など通知が使えない環境では無視
  }
}

function notifyMacOSText(title: string, body: string, sound = "Basso"): void {
  const script =
    `display notification ${appleScriptString(body)} ` +
    `with title ${appleScriptString(title)} ` +
    `sound name ${appleScriptString(sound)}`;

  try {
    execFileSync("osascript", ["-e", script], { stdio: "ignore", timeout: 5000 });
  } catch {
    // SSH経由など通知が使えない環境では無視
  }
}

// -------------------------------------------------------
// LINE Messaging API
// -------------------------------------------------------

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: object;
};

function buildLineFlexCard(result: ScoreResult): LineFlexMessage {
  const isUrgent = result.alertLevel === "urgent";
  const headerColor = isUrgent ? "#C0392B" : "#2980B9";
  const levelLabel = isUrgent ? "🚨 即通知" : "📋 朝まとめ";

  const reasonItems = result.reasons.slice(0, 4).map(r => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "・", size: "sm", color: "#888888", flex: 0 },
      { type: "text", text: r, size: "sm", color: "#333333", wrap: true },
    ],
    margin: "xs",
  }));

  const negItems = result.negativeReasons.slice(0, 2).map(r => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: "⚠", size: "sm", color: "#E67E22", flex: 0 },
      { type: "text", text: r, size: "sm", color: "#666666", wrap: true },
    ],
    margin: "xs",
  }));

  const body: object[] = [
    {
      type: "box",
      layout: "horizontal",
      contents: [
        {
          type: "text",
          text: "スコア",
          size: "sm",
          color: "#888888",
          flex: 1,
        },
        {
          type: "text",
          text: `${result.score} / 100`,
          size: "xl",
          weight: "bold",
          color: headerColor,
          align: "end",
        },
      ],
    },
    { type: "separator", margin: "md" },
    {
      type: "text",
      text: "検出理由",
      size: "xs",
      color: "#888888",
      margin: "md",
    },
    ...reasonItems,
  ];

  if (negItems.length > 0) {
    body.push(
      { type: "text", text: "注意点", size: "xs", color: "#888888", margin: "md" },
      ...negItems
    );
  }

  body.push(
    { type: "separator", margin: "md" },
    {
      type: "text",
      text: "※買い推奨ではありません",
      size: "xxs",
      color: "#AAAAAA",
      margin: "sm",
    }
  );

  return {
    type: "flex",
    altText: `【調査候補】${result.candidate.code} ${result.candidate.name} スコア${result.score}点`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        contents: [
          {
            type: "text",
            text: levelLabel,
            color: "#FFFFFF",
            size: "xs",
            weight: "bold",
          },
          {
            type: "text",
            text: `${result.candidate.code} ${result.candidate.name}`,
            color: "#FFFFFF",
            size: "lg",
            weight: "bold",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: body,
      },
    },
  };
}

function evidenceLabel(result: ScoreResult): string {
  const decision = result.primaryDisclosureReview?.decision;
  if (decision === "confirmed") return "事実/一次情報";
  if (decision === "caution") return "事実/注意情報";
  if (decision === "block") return "ブロック情報";
  return "一次情報不足";
}

function nextCheck(result: ScoreResult): string {
  return (
    result.nextSteps[0] ??
    result.expertReview?.requiredBeforeNotification[0] ??
    result.primaryDisclosureReview?.evidenceNeeded[0] ??
    result.negativeReasons[0] ??
    "一次情報と次イベント日程を確認"
  );
}

function buildLineSummaryText(results: ScoreResult[], date: string): string {
  const urgent = results.filter(r => r.alertLevel === "urgent");
  const daily  = results.filter(r => r.alertLevel === "daily");
  const allItems = [...urgent, ...daily];
  const visibleItems = allItems.slice(0, MORNING_LITE_ITEM_LIMIT);

  if (allItems.length === 0) {
    return [
      `🌅 Alpha Pon Morning Lite ${date}`,
      "5分朝刊 / 重要な変化だけ",
      "",
      "通知対象なし",
      "",
      "※売買推奨ではありません。事実・報道・噂は混ぜず、未確認は一次情報不足として扱います。",
    ].join("\n");
  }

  const lines = [
    `🌅 Alpha Pon Morning Lite ${date}`,
    "5分朝刊 / 重要な変化だけ",
    `🚨 即通知候補: ${urgent.length}件 / 📌 朝確認: ${daily.length}件`,
    "",
    "🔥 今日見るもの",
    ...visibleItems.flatMap((r, index) => {
      const icon = r.alertLevel === "urgent" ? "🚨" : "📌";
      return [
        `${index + 1}. ${icon} ${r.candidate.code} ${r.candidate.name} ${r.score}点`,
        `   区分: ${evidenceLabel(r)}`,
        `   なぜ重要: ${r.reasons[0] ?? "重要変化の兆候を検出"}`,
        `   次に確認: ${nextCheck(r)}`,
      ];
    }),
  ];

  const hiddenCount = allItems.length - visibleItems.length;
  if (hiddenCount > 0) {
    lines.push("", `ほか${hiddenCount}件はノイズ削減のため省略`);
  }

  lines.push(
    "",
    "※売買推奨ではありません。事実・報道・噂は混ぜず、未確認は一次情報不足として扱います。"
  );
  return lines.join("\n");
}

async function pushLine(messages: object[]): Promise<void> {
  const token  = process.env.LINE_CHANNEL_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) return;

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: userId, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`LINE通知失敗: ${res.status} ${body}`);
  }
}

async function pushDedupedText(text: string): Promise<void> {
  if (!shouldSendTextNotification(text)) {
    console.log("重複通知スキップ");
    return;
  }
  await pushLine([{ type: "text", text }]);
  recordTextNotification(text);
}

// -------------------------------------------------------
// 公開API
// -------------------------------------------------------

export async function sendUrgentNotifications(results: ScoreResult[]): Promise<void> {
  for (const result of results) {
    notifyMacOS(result);
    console.log(`  macOS通知: ${result.candidate.code} ${result.candidate.name} ${result.score}点`);
    await pushLine([buildLineFlexCard(result)]);
  }
}

export async function sendDailySummary(
  results: ScoreResult[],
  date: string
): Promise<void> {
  const text = buildLineSummaryText(results, date);
  await pushDedupedText(text);
}

export async function sendPipelineFailureNotification(step: string, message: string): Promise<void> {
  const title = "🚨 alpha-pon 自動実行失敗";
  const body = `${step}\n${message.slice(0, 500)}`;
  notifyMacOSText(title, body, "Basso");
  await pushLine([{ type: "text", text: `${title}\n\nstep: ${step}\n${message.slice(0, 1000)}` }]);
}

export async function sendPipelineSummaryNotification(text: string): Promise<void> {
  await pushDedupedText(text);
}

export async function fetchLineUserId(): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token) {
    console.error("LINE_CHANNEL_TOKEN が未設定");
    return null;
  }
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`LINE profile取得失敗: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { userId: string; displayName: string };
  console.log(`LINE userId: ${data.userId}  (${data.displayName})`);
  return data.userId;
}