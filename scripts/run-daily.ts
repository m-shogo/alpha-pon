// pnpm daily — supervisor から呼ばれる今日の通常処理入口
// 既存 CLI を job_runs で管理しながら順次実行する
// 注意: 買い推奨なし。調査候補・検証・反省用。

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { acquireLock, releaseLock } from "../src/jobs/job-lock.js";
import { runPnpmJob } from "../src/jobs/job-runner.js";
import { getTodayInTokyo } from "../src/jobs/date-utils.js";

const TODAY = getTodayInTokyo();
const LOCK_KEY = `alpha-pon:daily:${TODAY}`;

type DailyStatus = "ok" | "skip" | "fail";
type DailyResult = { name: string; status: DailyStatus };

// daily の主処理。pipeline_status_latest.json に依存する監査系はここに入れない。
// 監査系を途中で実行すると、前回の pipeline_status / score log を見て stale 判定しやすい。
const DAILY_JOBS = [
  { name: "world_scan",             pnpmScript: "scan:world" },
  { name: "daily_company_score",    pnpmScript: "daily:core" },
  { name: "review_analogies",       pnpmScript: "review:analogies:write" },
  { name: "scan_universe",          pnpmScript: "scan:universe" },
  { name: "candidate_hypothesis",   pnpmScript: "candidate:hypothesis" },
  { name: "review_due_predictions", pnpmScript: "review:hypotheses" },
  { name: "readiness_audit",        pnpmScript: "readiness:audit" },
  { name: "ui_data_generate",       pnpmScript: "ui:data" },
] as const;

// pipeline_status_latest.json と生成済み UI/report に依存する後段監査。
// 先に pipeline_status を書き、監査後にもう一度 status を更新する。
const POST_PIPELINE_JOBS = [
  { name: "source_health_check", pnpmScript: "health:sources" },
  { name: "ops_dashboard_report", pnpmScript: "report:ops" },
] as const;

function writePipelineStatus(results: DailyResult[]): void {
  mkdirSync("reports", { recursive: true });
  const failedSteps = results.filter(r => r.status === "fail").map(r => r.name);
  const payload = {
    app: "alpha-pon",
    date: TODAY,
    runType: "daily",
    status: failedSteps.length > 0 ? "partial_failed" : "ok",
    results,
    failedSteps,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join("reports", "pipeline_status_latest.json"), JSON.stringify(payload, null, 2), "utf-8");
}

// SIGTERM / SIGINT（Mac スリープ・強制終了）でもロックを解除する
function setupSignalHandlers() {
  const cleanup = (sig: string) => {
    console.log(`[signal] ${sig} received — ロックを解除して終了`);
    releaseLock(LOCK_KEY);
    process.exit(0);
  };
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGINT",  () => cleanup("SIGINT"));
}

async function main() {
  console.log(`=== alpha-pon daily start (${TODAY}) ===`);

  if (!acquireLock(LOCK_KEY)) {
    console.log(`[skip] 既にロック中 (${LOCK_KEY}) — 別プロセスが実行中か確認してください`);
    process.exit(0);
  }
  setupSignalHandlers();

  const results: DailyResult[] = [];

  try {
    for (const job of DAILY_JOBS) {
      const res = runPnpmJob(job.name, TODAY, job.pnpmScript);
      results.push({ name: job.name, status: res.skipped ? "skip" : res.success ? "ok" : "fail" });
    }

    // 後段監査が今日の pipeline status を読めるよう、いったん主処理結果を書き出す。
    writePipelineStatus(results);

    for (const job of POST_PIPELINE_JOBS) {
      const res = runPnpmJob(job.name, TODAY, job.pnpmScript);
      results.push({ name: job.name, status: res.skipped ? "skip" : res.success ? "ok" : "fail" });
      writePipelineStatus(results);
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
    process.exitCode = 1;
  }

  console.log(`=== alpha-pon daily end (${TODAY}) ===`);
}

main().catch(err => {
  console.error("[fatal]", err);
  releaseLock(LOCK_KEY);
  process.exit(1);
});
