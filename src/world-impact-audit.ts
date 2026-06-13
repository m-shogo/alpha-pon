// pnpm audit:world-impact
// 世界ニュース影響仮説レビューの品質を監査する。
// v2: JSONL 破損行・latest との不一致・mechanism unknown・falsification/confidence 未設定も検出する。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import {
  buildWorldImpactAudit,
  loadWorldImpactJsonl,
  normalizeWorldImpactReview,
  renderWorldImpactAuditMarkdown,
  type WorldEventImpactReview,
} from "./world-impact.js";

function readLatest(today: string): WorldEventImpactReview[] | null {
  const latest = join("data", "world_event_impacts_latest.json");
  if (!existsSync(latest)) return null;
  try {
    const parsed = JSON.parse(readFileSync(latest, "utf-8"));
    return Array.isArray(parsed) ? parsed.map(item => normalizeWorldImpactReview(item, today)) : [];
  } catch {
    return [];
  }
}

function readRawRecords(): unknown[] {
  const path = join("data", "world_event_impacts.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
}

function main() {
  const today = todayJst();
  const { reviews: jsonlReviews, parseErrors } = loadWorldImpactJsonl(undefined, today);
  const latestReviews = readLatest(today);
  const reviews = latestReviews ?? jsonlReviews;
  const audit = buildWorldImpactAudit(reviews, today, {
    jsonlParseErrors: parseErrors,
    jsonlKeys: jsonlReviews.map(review => review.reviewKey),
    rawRecords: readRawRecords(),
  });

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
  console.log(`mechanismUnknown: ${audit.mechanismUnknown}`);
  console.log(`falsificationMissing: ${audit.falsificationMissing}`);
  console.log(`confidenceMissing: ${audit.confidenceMissing}`);
  console.log(`jsonlParseErrors: ${audit.jsonlParseErrors}`);
  console.log(`latestMismatch: ${audit.latestMismatch}`);
  console.log(`dueWithoutOutcome: ${audit.dueWithoutOutcome}`);
  console.log(`enum違反: result=${audit.resultEnumViolations} direction=${audit.directionEnumViolations} autoMissReason=${audit.autoMissReasonViolations} confidence範囲外=${audit.confidenceOutOfRange}`);
  console.log(`不整合: insufficientDataWithReturn=${audit.insufficientDataWithReturn} judgedWithoutReturn=${audit.judgedWithoutReturn} missReasonConflicts=${audit.missReasonConflicts}`);
  console.log("出力: reports/world-impact-audit.md / reports/world-impact-audit.json");
}

main();
