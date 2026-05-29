import { execSync } from "child_process";
import type { ScoreResult, AlertLevel } from "./types.js";

// -------------------------------------------------------
// macOS ネイティブ通知
// osascript は追加インストール不要、macOS全バージョン対応
// sound name: "Glass" | "Ping" | "Funk" | "Basso" | "Pop" など
// -------------------------------------------------------

const SOUND_BY_LEVEL: Record<AlertLevel, string> = {
  urgent: "Funk",   // 警告音
  daily:  "Glass",  // 軽い通知音
  log:    "",
  ignore: "",
};

function sanitize(s: string): string {
  // AppleScript文字列エスケープ: " と \ だけ
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function notifyMacOS(result: ScoreResult): void {
  const sound = SOUND_BY_LEVEL[result.alertLevel];
  const title = sanitize(`【調査候補】${result.candidate.code} ${result.candidate.name}`);
  const subtitle = sanitize(`スコア ${result.score}/100`);
  const body = sanitize(result.reasons.slice(0, 2).join(" | ") + "\n※買い推奨ではありません");

  const soundClause = sound ? ` sound name "${sound}"` : "";
  const script = `display notification "${body}" with title "${title}" subtitle "${subtitle}"${soundClause}`;

  try {
    execSync(`osascript -e '${script}'`, { stdio: "ignore", timeout: 5000 });
  } catch {
    // SSH経由など通知が使えない環境では無視
  }
}

// -------------------------------------------------------
// LINE Messaging API
//
// LINE Notifyは2025年4月廃止。Messaging APIが現在の正解。
//
// セットアップ:
//   1. https://developers.line.biz/ でProviderとチャネル作成
//   2. チャネル設定 → Messaging API → チャネルアクセストークン発行
//   3. LINEアプリでそのボットを友達追加
//   4. https://api.line.me/v2/profile を呼んでuserId取得
//      or ボットにメッセージを送ってWebhookで取得
//   5. .envに LINE_CHANNEL_TOKEN と LINE_USER_ID を設定
//
// 無料枠: 200件/月（個人利用は余裕）
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

function buildLineSummaryText(results: ScoreResult[], date: string): string {
  const urgent = results.filter(r => r.alertLevel === "urgent");
  const daily  = results.filter(r => r.alertLevel === "daily");
  const notifiable = [...urgent, ...daily];

  if (notifiable.length === 0) {
    return `📋 alpha-pon ${date}\n通知対象なし（全${results.length}件スコア不足）`;
  }

  const lines = [
    `📋 alpha-pon 朝まとめ ${date}`,
    `🚨 即通知: ${urgent.length}件 / 📋 朝まとめ: ${daily.length}件`,
    "",
    ...notifiable.map(r => {
      const icon = r.alertLevel === "urgent" ? "🚨" : "📋";
      return `${icon} ${r.candidate.code} ${r.candidate.name}  ${r.score}点\n  ${r.reasons[0] ?? ""}`;
    }),
    "",
    "※買い推奨ではありません",
  ];
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

// -------------------------------------------------------
// 公開API
// -------------------------------------------------------

export async function sendUrgentNotifications(results: ScoreResult[]): Promise<void> {
  for (const result of results) {
    // macOS: 個別に即通知
    notifyMacOS(result);
    console.log(`  macOS通知: ${result.candidate.code} ${result.candidate.name} ${result.score}点`);

    // LINE: Flexカードで個別送信
    await pushLine([buildLineFlexCard(result)]);
  }
}

export async function sendDailySummary(
  results: ScoreResult[],
  date: string
): Promise<void> {
  const notifiable = results.filter(
    r => r.alertLevel === "urgent" || r.alertLevel === "daily"
  );
  if (notifiable.length === 0) return;

  // LINE: テキストサマリーをまとめて1通
  const text = buildLineSummaryText(results, date);
  await pushLine([{ type: "text", text }]);
}

// LINE User ID取得ヘルパー（初回セットアップ用）
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
