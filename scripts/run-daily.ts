// pnpm daily — supervisor から呼ばれる今日の通常処理入口
// 既存 CLI を job_runs で管理しながら順次実行する
// 注意: 買い推奨なし。調査候補・検証・反省用。

import { acquireLock, releaseLock } from "../src/jobs/job-lock.js";
import { runPnpmJob } from "../src/jobs/job-runner.js";
import { getTodayInTokyo } from "../src/jobs/date-utils.js";

const TODAY = getTodayInTokyo();
const LOCK_KEY = `alpha-pon:daily:${TODAY}`;

// daily で実行するジョブ一覧
// pnpmScript: package.json の scripts キー名（既存 CLI をそのまま呼ぶ）
const DAILY_JOBS = [
  { name: "world_scan",             pnpmScript: "scan:world" },
  { name: "source_health_check",    pnpmScript: "health:sources" },
  { name: "daily_company_score",    pnpmScript: "daily:core" },
  { name: "review_analogies",       pnpmScript: "review:analogies:write" },
  { name: "scan_universe",          pnpmScript: "scan:universe" },
  { name: "candidate_hypothesis",   pnpmScript: "candidate:hypothesis" },
  { name: "review_due_predictions", pnpmScript: "review:hypotheses" },
  { name: "readiness_audit",        pnpmScript: "readiness:audit" },
  { name: "ui_data_generate",       pnpmScript: "ui:data" },
] as const;

async function main() {
  console.log(`=== alpha-pon daily start (${TODAY}) ===`);

  if (!acquireLock(LOCK_KEY)) {
    console.log(`[skip] 既にロック中 (${LOCK_KEY}) — 別プロセスが実行中か確認してください`);
    process.exit(0);
  }

  const results: { name: string; status: string }[] = [];

  try {
    for (const job of DAILY_JOBS) {
      const res = runPnpmJob(job.name, TODAY, job.pnpmScript);
      results.push({ name: job.name, status: res.skipped ? "skip" : res.success ? "ok" : "fail" });
    }
  } finally {
    releaseLock(LOCK_KEY);
  }

  console.log("\n=== daily summary ===");
  for (const r of results) {
    const icon = r.status === "ok" ? "✓" : r.status === "skip" ? "–" : "✗";
    console.log(`  ${icon} ${r.name} [${r.status}]`);
  }

  const failed = results.filter(r => r.status === "fail");
  if (failed.length > 0) {
    console.log(`\n[warn] 失敗 ${failed.length}件: ${failed.map(r => r.name).join(", ")}`);
  }

  console.log(`=== alpha-pon daily end (${TODAY}) ===`);
}

main().catch(err => {
  console.error("[fatal]", err);
  releaseLock(LOCK_KEY);
  process.exit(1);
});
