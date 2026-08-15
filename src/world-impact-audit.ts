// pnpm audit:world-impact
// 世界ニュース影響仮説レビューの品質を監査する。
// v2: JSONL 破損行・latest との不一致・mechanism unknown・falsification/confidence 未設定も検出する。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { countInvalidWorldImpactAuditRows } from "./world-impact-audit-input.js";
import {
  buildWorldImpactAudit,
  loadWorldImpactJsonl,
  renderWorldImpactAuditMarkdown,
} from "./world-impact.js";
import {
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
  const resolved = resolveWorldImpactReportInput(readLatest(), jsonlReviews, today);
  const rawRecords = readRawRecords();
  const invalidJsonlRows = countInvalidWorldImpactAuditRows(rawRecords, today);
  const audit = buildWorldImpactAudit(resolved.reviews, today, {
    jsonlParseErrors: parseErrors,
    jsonlKeys: jsonlReviews.map(review => review.reviewKey),
    rawRecords,
  });
  applyWorldImpactLatestSnapshotError(audit, resolved.latestSnapshotError);
  if (invalidJsonlRows > 0) {
    audit.healthStatus = "action_required";
    audit.priorityIssues.unshift({
      severity: "urgent",
      category: "jsonl_validation",
      title: `World Impact JSONL に不正row: ${invalidJsonlRows}件`,
      detail: "data/world_event_impacts.jsonl の日付・identity・outcome shapeを修復してください。壊れたrowを正常なaudit入力として扱いません。",
    });
  }

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
  console.log(`jsonlValidationErrors: ${invalidJsonlRows}`);
  console.log(`latestMismatch: ${audit.latestMismatch}`);
  console.log(`dueWithoutOutcome: ${audit.dueWithoutOutcome}`);
  console.log(`enum違反: result=${audit.resultEnumViolations} direction=${audit.directionEnumViolations} autoMissReason=${audit.autoMissReasonViolations} confidence範囲外=${audit.confidenceOutOfRange}`);
  console.log(`不整合: insufficientDataWithReturn=${audit.insufficientDataWithReturn} judgedWithoutReturn=${audit.judgedWithoutReturn} missReasonConflicts=${audit.missReasonConflicts}`);
  console.log("出力: reports/world-impact-audit.md / reports/world-impact-audit.json");
}

main();
