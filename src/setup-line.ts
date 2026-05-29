// LINE Messaging API セットアップヘルパー
// pnpm setup:line
//
// ローカルHTTPサーバーを起動してLINE WebhookでUser IDをキャプチャする

import { createServer } from "http";

const PORT = 3000;
const TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  console.log("\nLINE Messaging API セットアップ\n");

  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token) {
    console.log("まず .env に LINE_CHANNEL_TOKEN を設定してください\n");
    console.log("手順:");
    console.log("  1. https://developers.line.biz/ にアクセス");
    console.log("  2. Provider → Create a new channel → Messaging API");
    console.log("  3. チャネル設定 → Messaging API → チャネルアクセストークン発行（長期）");
    console.log("  4. .env に LINE_CHANNEL_TOKEN=<トークン> を設定");
    console.log("  5. LINEアプリでそのボットをQRコードで友達追加");
    console.log("  6. 再度 pnpm setup:line を実行\n");
    process.exit(1);
  }

  console.log("LINE_CHANNEL_TOKEN: 設定済み ✓\n");
  const userId = await captureUserId();

  console.log("\n✓ LINE User ID 取得成功\n");
  console.log(".env に以下を追加（またはすでにある行を更新）:");
  console.log(`LINE_USER_ID=${userId}\n`);
}

type LineWebhookBody = {
  events?: Array<{
    source?: { userId?: string };
  }>;
};

function captureUserId(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(200).end("OK");
        return;
      }

      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", () => {
        res.writeHead(200).end("OK");
        try {
          const data = JSON.parse(body) as LineWebhookBody;
          const userId = data.events?.[0]?.source?.userId;
          if (userId) {
            server.close();
            resolve(userId);
          }
        } catch {
          // パースエラーは無視して次のイベントを待つ
        }
      });
    });

    server.listen(PORT, () => {
      console.log(`ローカルサーバー起動: http://localhost:${PORT}/webhook\n`);
      console.log("【手順】");
      console.log("1. 別ターミナルでトンネルを作成:");
      console.log("     cloudflared tunnel --url http://localhost:3000");
      console.log("   ※未インストール: brew install cloudflare/cloudflare/cloudflared");
      console.log("");
      console.log("2. 発行された https://xxxx.trycloudflare.com を使い");
      console.log("   LINE Developers Console → Messaging API → Webhook URL に設定:");
      console.log("     https://xxxx.trycloudflare.com/webhook");
      console.log('   「Verify」ボタンを押して疎通確認');
      console.log("");
      console.log("3. LINEアプリでそのボットに何かメッセージを送信");
      console.log("");
      console.log(`※ User ID受信後は自動終了（${TIMEOUT_MS / 60000}分タイムアウト）\n`);
      console.log("待機中...");
    });

    server.on("error", reject);

    setTimeout(() => {
      server.close();
      reject(new Error(`タイムアウト: ${TIMEOUT_MS / 60000}分以内にメッセージが届きませんでした`));
    }, TIMEOUT_MS);
  });
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
