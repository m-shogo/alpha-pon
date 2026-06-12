// pnpm report:world-impact
// World Impact Intelligence レポートを生成する。
// 最新の仮説・pending・検証結果・外れ理由・改善ポイントを一枚の Markdown にまとめる。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  buildWorldImpactAudit,
  buildWorldImpactCalibration,
  loadWorldImpactJsonl,
  normalizeWorldImpactReview,
  renderWorldImpactIntelligenceMarkdown,
  type WorldEventImpactReview,
} from "./world-impact.js";

function readLatest(today: string): WorldEventImpactReview[] {
  const latest = join("data", "world_event_impacts_latest.json");
  if (!existsSync(latest)) return [];
  try {
    const parsed = JSON.parse(readFileSync(latest, "utf-8"));
    return Array.isArray(parsed) ? parsed.map(item => normalizeWorldImpactReview(item, today)) : [];
  } catch {
    return [];
  }
}

function main() {
  const today = todayJst();
  const { reviews: jsonlReviews, parseErrors } = loadWorldImpactJsonl(undefined, today);
  const latestReviews = readLatest(today);
  const reviews = latestReviews.length > 0 ? latestReviews : jsonlReviews;

  const audit = buildWorldImpactAudit(reviews, today, {
    jsonlParseErrors: parseErrors,
    jsonlKeys: jsonlReviews.map(review => review.reviewKey),
  });
  const calibration = buildWorldImpactCalibration(reviews, today);
  const markdown = renderWorldImpactIntelligenceMarkdown(reviews, audit, calibration, today);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "world-impact-intelligence.md"), markdown);

  console.log(`\n=== world impact intelligence (${today}) ===`);
  console.log(`totalReviews: ${audit.totalReviews}`);
  console.log(`pending: ${audit.reviewStatusCounts["pending"] ?? 0} / reviewed: ${audit.reviewStatusCounts["reviewed"] ?? 0} / insufficient_data: ${audit.reviewStatusCounts["insufficient_data"] ?? 0}`);
  console.log(`overdue: ${audit.overdueReviews} / priceDataPending: ${audit.priceDataPending}`);
  console.log(`healthStatus: ${audit.healthStatus}`);
  console.log("出力: reports/world-impact-intelligence.md");
}

main();
