import { todayJst } from "./date.js";

const token = process.env.LINE_CHANNEL_TOKEN;
const userId = process.env.LINE_USER_ID;

function nowJst(): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function main() {
  console.log("LINEテスト通知");

  if (!token) {
    console.error("LINE_CHANNEL_TOKEN が未設定です");
    process.exit(1);
  }
  if (!userId) {
    console.error("LINE_USER_ID が未設定です");
    process.exit(1);
  }

  const text = [
    "🧪 alpha-pon テスト通知",
    "",
    "LINE通知は正常です ✅",
    `日付: ${todayJst()}`,
    `時刻: ${nowJst()}`,
    "",
    "この通知が届けば設定完了です。",
    "※売買推奨ではありません。",
  ].join("\n");

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`LINEテスト通知送信失敗: ${res.status}`);
    console.error(body);
    process.exit(1);
  }

  console.log("LINEテスト通知送信成功");
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
