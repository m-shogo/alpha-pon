import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { listingReadinessFileStatus } from "./listing-automation-readiness-file.js";

type CheckStatus = "ok" | "warning" | "missing";

type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  reason: string;
  nextAction: string;
};

function envExists(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function checkAll(): Check[] {
  const checks: Check[] = [];

  checks.push({
    id: "jpx_listings_url",
    label: "JPX新規上場情報URL",
    status: envExists("JPX_LISTINGS_URL") ? "ok" : "missing",
    reason: envExists("JPX_LISTINGS_URL") ? "JPX_LISTINGS_URL が設定されています。" : "JPX_LISTINGS_URL が未設定です。JPX取得は setup needed になります。",
    nextAction: "export JPX_LISTINGS_URL=\"JPX新規上場情報のURL\" を設定して sync-jpx-listings.ts をdry-runしてください。",
  });

  const listingEventsStatus = listingReadinessFileStatus("data/listing_events.jsonl");
  checks.push({
    id: "listing_events_jsonl",
    label: "上場イベントDB",
    status: listingEventsStatus,
    reason: listingEventsStatus === "ok"
      ? "data/listing_events.jsonl は利用可能です。"
      : listingEventsStatus === "warning"
        ? "data/listing_events.jsonl は存在しますが、空または通常ファイルとして利用できません。"
        : "data/listing_events.jsonl がまだありません。manualSeedEventsのsync --write または JPX sync --write が必要です。",
    nextAction: "node --import tsx/esm src/sync-listing-events.ts --write を実行し、manualSeedEventsをDB化してください。",
  });

  const reviewPricePath = process.env.LISTING_REVIEW_PRICE_CSV ?? "data/listing_review_prices.csv";
  const reviewPriceStatus = listingReadinessFileStatus(reviewPricePath);
  checks.push({
    id: "review_price_csv",
    label: "上場レビュー価格CSV",
    status: reviewPriceStatus,
    reason: reviewPriceStatus === "ok"
      ? "J-Quants/TOPIX実データ用CSVは利用可能です。"
      : reviewPriceStatus === "warning"
        ? "上場レビュー価格CSVは存在しますが、空または通常ファイルとして利用できません。"
        : "上場レビュー価格CSVがありません。",
    nextAction: "data/listing_review_prices.csv を code,publicPrice,initialPrice,reviewPrice,topixRelativeReturn 形式で作ってください。",
  });

  const prospectusPath = process.env.PROSPECTUS_TEXT_PATH ?? "data/prospectus_text.txt";
  const prospectusStatus = listingReadinessFileStatus(prospectusPath);
  checks.push({
    id: "prospectus_text",
    label: "目論見書テキスト",
    status: prospectusStatus,
    reason: prospectusStatus === "ok"
      ? "テキスト化済み目論見書は利用可能です。"
      : prospectusStatus === "warning"
        ? "目論見書テキストは存在しますが、空または通常ファイルとして利用できません。"
        : "目論見書テキストがありません。",
    nextAction: "PDFからテキストを抽出して data/prospectus_text.txt に置き、extract-lockup-from-prospectus.ts を実行してください。",
  });

  checks.push({
    id: "line_config",
    label: "LINE通知設定",
    status: envExists("LINE_CHANNEL_TOKEN") && envExists("LINE_USER_ID") ? "ok" : "warning",
    reason: envExists("LINE_CHANNEL_TOKEN") && envExists("LINE_USER_ID") ? "LINE通知設定があります。" : "LINE通知の環境変数が不足しています。dry-runは可能です。",
    nextAction: "実送信する場合だけ LINE_CHANNEL_TOKEN / LINE_USER_ID を設定し、listing-event-alert-sender.ts --send を慎重に実行してください。",
  });

  checks.push({
    id: "slack_config",
    label: "Slack通知設定",
    status: envExists("SLACK_WEBHOOK_URL") ? "ok" : "warning",
    reason: envExists("SLACK_WEBHOOK_URL") ? "Slack webhook が設定されています。" : "SLACK_WEBHOOK_URL が未設定です。dry-runは可能です。",
    nextAction: "Slackへ実送信する場合だけ SLACK_WEBHOOK_URL を設定してください。",
  });

  return checks;
}

function main() {
  const generatedAt = todayJst();
  const checks = checkAll();
  const missing = checks.filter(check => check.status === "missing");
  const warning = checks.filter(check => check.status === "warning");
  const lines: string[] = [];

  lines.push("# listing automation readiness", "", `date: ${generatedAt}`, "");
  lines.push("> 買い推奨ではありません。上場イベント自動化を本番データで動かす前の準備状況チェックです。", "");
  lines.push(`- checks: ${checks.length}`);
  lines.push(`- missing: ${missing.length}`);
  lines.push(`- warning: ${warning.length}`, "");

  for (const check of checks) {
    lines.push(`## ${check.label} (${check.id})`, "");
    lines.push(`- status: ${check.status}`);
    lines.push(`- reason: ${check.reason}`);
    lines.push(`- nextAction: ${check.nextAction}`, "");
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/listing_automation_readiness_latest.md", lines.join("\n"), "utf-8");
  writeFileSync("reports/listing_automation_readiness_latest.json", JSON.stringify({ generatedAt, checks }, null, 2), "utf-8");
  console.log(`listing automation readiness generated: missing=${missing.length}, warning=${warning.length}`);
}

main();
