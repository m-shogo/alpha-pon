// pnpm catchup — Mac 再起動後の未実行分を補完する入口
// 最大 CATCHUP_DAYS 日分（デフォルト 7 日）を遡って処理する
// 再現できないものは missing_jobs に記録する

import { acquireLock, releaseLock } from "../src/jobs/job-lock.js";
import {
  runPnpmJob,
  hasSucceeded,
  getLastSuccessDate,
  getMissingTargetDates,
  recordMissing,
  markSkipped,
} from "../src/jobs/job-runner.js";
import { getTodayInTokyo, getDatesBetween, subtractDays } from "../src/jobs/date-utils.js";

const TODAY = getTodayInTokyo();
const CATCHUP_DAYS = Math.min(parseInt(process.env.CATCHUP_DAYS ?? "7", 10), 90);
const LOCK_KEY = "alpha-pon:catchup";

// catchup 対象ジョブ定義
// canBackfill: true → 過去日でも実行を試みる
// canBackfill: false → 過去日は missing_jobs に記録するだけ
const CATCHUP_JOBS = [
  {
    name: "world_scan",
    pnpmScript: "scan:world",
    canBackfill: false,
    missingReason: "Mac was powered off or asleep; realtime world event data could not be reconstructed",
  },
  {
    name: "source_health_check",
    pnpmScript: "health:sources",
    canBackfill: false,
    missingReason: "Source does not support historical fetch for this target date",
  },
  {
    name: "daily_company_score",
    pnpmScript: "daily:core",
    canBackfill: false,
    missingReason: "Mac was powered off or asleep; realtime price/score data could not be reconstructed",
  },
  {
    name: "review_analogies",
    pnpmScript: "review:analogies:write",
    canBackfill: true,
    missingReason: "",
  },
  {
    name: "scan_universe",
    pnpmScript: "scan:universe",
    canBackfill: false,
    missingReason: "Mac was powered off or asleep; historical universe scan not reproducible",
  },
  {
    name: "candidate_hypothesis",
    pnpmScript: "candidate:hypothesis",
    canBackfill: false,
    missingReason: "Existing CLI does not support date-specific backfill yet",
  },
  {
    name: "review_due_predictions",
    pnpmScript: "review:hypotheses",
    canBackfill: true, // 期限切れ仮説を自動検出するため、今日実行すれば過去分も拾う
    missingReason: "",
  },
  {
    name: "readiness_audit",
    pnpmScript: "readiness:audit",
    canBackfill: false,
    missingReason: "Existing CLI does not support date-specific backfill yet",
  },
  {
    name: "ui_data_generate",
    pnpmScript: "ui:data",
    canBackfill: false,
    missingReason: "Existing CLI does not support date-specific backfill yet",
  },
  {
    name: "weekly_report",
    pnpmScript: "review:weekly",
    canBackfill: false,
    missingReason: "Historical weekly report cannot be reconstructed from current state",
  },
  {
    name: "monthly_report",
    pnpmScript: "review:monthly",
    canBackfill: false,
    missingReason: "Historical monthly report cannot be reconstructed from current state",
  },
] as const;

async function main() {
  console.log(`=== alpha-pon catchup start (today=${TODAY}, max=${CATCHUP_DAYS}d) ===`);

  if (!acquireLock(LOCK_KEY)) {
    console.log(`[skip] 既に catchup 実行中 (${LOCK_KEY})`);
    process.exit(0);
  }

  const summary = { ran: 0, skipped: 0, missing: 0, failed: 0 };

  for (const job of CATCHUP_JOBS) {
    const missingDates = getMissingTargetDates(job.name, CATCHUP_DAYS);

    // 今日分が未実行なら必ず実行（backfill可否問わず）
    const todayDue = !hasSucceeded(job.name, TODAY);
    const pastDates = missingDates.filter(d => d < TODAY);
    const runToday = todayDue && !missingDates.includes(TODAY);

    // 今日の実行
    if (todayDue) {
      const res = runPnpmJob(job.name, TODAY, job.pnpmScript);
      res.skipped ? summary.skipped++ : res.success ? summary.ran++ : summary.failed++;
    }

    // 過去日の処理
    for (const date of pastDates) {
      if (date === TODAY) continue;
      if (job.canBackfill) {
        // backfill 可能なジョブは実行を試みる（今日の実行で過去分も拾う設計のものは skip）
        if (hasSucceeded(job.name, date)) {
          markSkipped(job.name, date);
          summary.skipped++;
        } else {
          // 過去日付での実行は今日の実行に集約済みなので skipped として記録
          markSkipped(job.name, date);
          summary.skipped++;
        }
      } else {
        // backfill 不可 → missing_jobs に記録
        recordMissing(job.name, date, job.missingReason);
        summary.missing++;
        console.log(`  [missing] ${job.name} (${date})`);
      }
    }
  }

  console.log("\n=== catchup summary ===");
  console.log(`  実行: ${summary.ran}件`);
  console.log(`  スキップ: ${summary.skipped}件`);
  console.log(`  missing 記録: ${summary.missing}件`);
  console.log(`  失敗: ${summary.failed}件`);
  console.log(`=== alpha-pon catchup end ===`);
  releaseLock(LOCK_KEY);
}

main().catch(err => {
  console.error("[fatal]", err);
  releaseLock(LOCK_KEY);
  process.exit(1);
});
