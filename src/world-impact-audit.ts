// pnpm audit:world-impact
// 世界ニュース影響仮説レビューの品質を監査する。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  buildWorldImpactAudit,
  loadWorldImpactReviews,
  renderWorldImpactAuditMarkdown,
  type WorldEventImpactReview,
} from "./world-impact.js";

function readLatest(): WorldEventImpactReview[] {
  const latest = join("data", "world_event_impacts_latest.json");
  if (!existsSync(latest)) return loadWorldImpactReviews();
  try {
    const parsed = JSON.parse(readFileSync(latest, "utf-8"));
    return Array.isArray(parsed) ? parsed as WorldEventImpactReview[] : [];
  } catch {
    return [];
  }
}

function main() {
  const today = todayJst();
  const reviews = readLatest();
  const audit = buildWorldImpactAudit(reviews, today);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "world-impact-audit.json"), JSON.stringify(audit, null, 2) + "\n");
  writeFileSync(join("reports", "world-impact-audit.md"), renderWorldImpactAuditMarkdown(audit));

  console.log(`\n=== world impact audit (${today}) ===`);
  console.log(`healthStatus: ${audit.healthStatus}`);
  console.log(`totalReviews: ${audit.totalReviews}`);
  console.log(`pendingReviews: ${audit.pendingReviews}`);
  console.log(`overdueReviews: ${audit.overdueReviews}`);
  console.log(`priceDataPending: ${audit.priceDataPending}`);
  console.log(`unknownMatchedAsHit: ${audit.unknownMatchedAsHit}`);
  console.log("出力: reports/world-impact-audit.md / reports/world-impact-audit.json");
}

main();
