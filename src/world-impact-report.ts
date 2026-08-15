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
  renderWorldImpactIntelligenceMarkdown,
} from "./world-impact.js";
import {
  applyWorldImpactJsonlFallbackError,
  applyWorldImpactLatestSnapshotError,
  resolveWorldImpactReportInput,
  type WorldImpactLatestSnapshotInput,
} from "./world-impact-report-input.js";

function readLatest(): WorldImpactLatestSnapshotInput {
  const latest = join("data", "world_event_impacts_latest.json");
  if (!existsSync(latest)) return { present: false };
  try {
    return { present: true, parsed: JSON.parse(readFileSync(latest, "utf-8")) };
  } catch {
    return { present: true, parseError: true };
  }
}

function main() {
  const today = todayJst();
  const { reviews: jsonlReviews, parseErrors } = loadWorldImpactJsonl(undefined, today);
  const resolved = resolveWorldImpactReportInput(readLatest(), jsonlReviews, today);
  const reviews = resolved.reviews;

  const audit = buildWorldImpactAudit(reviews, today, {
    jsonlParseErrors: parseErrors,
    jsonlKeys: jsonlReviews.map(review => review.reviewKey),
  });
  applyWorldImpactLatestSnapshotError(audit, resolved.latestSnapshotError);
  applyWorldImpactJsonlFallbackError(audit, resolved.jsonlFallbackError);
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
