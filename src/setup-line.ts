// LINE Messaging API セットアップヘルパー
// pnpm setup:line
//
// 実行前に .env に LINE_CHANNEL_TOKEN を設定しておく

import { fetchLineUserId } from "./notify.js";

async function main() {
  console.log("\nLINE Messaging API セットアップ\n");

  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token) {
    console.log("手順:");
    console.log("1. https://developers.line.biz/ にアクセス");
    console.log("2. Provider → Create a new channel → Messaging API");
    console.log("3. チャネル設定 → Messaging API → チャネルアクセストークン発行（長期）");
    console.log("4. .env に LINE_CHANNEL_TOKEN=<トークン> を設定");
    console.log("5. LINEアプリでそのボットをQRコードで友達追加");
    console.log("6. 再度 pnpm setup:line を実行してUser IDを取得");
    process.exit(1);
  }

  const userId = await fetchLineUserId();
  if (userId) {
    console.log(`\n.env に以下を追加:\nLINE_USER_ID=${userId}`);
  }
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
