// ジョブ実行・記録ユーティリティ
// job_runs / missing_jobs テーブルへの読み書きと、pnpm スクリプト実行を担う

import { spawnSync } from "child_process";
import { openJobsDb } from "./db.js";
import { nowIso, getTodayInTokyo, getDatesBetween, subtractDays } from "./date-utils.js";

export const APP_NAME = "alpha-pon";

// ── job_runs 読み書き ──────────────────────────────────────────

export function hasSucceeded(jobName: string, targetDate: string): boolean {
  const db = openJobsDb();
  const row = db.prepare(
    "SELECT id FROM job_runs WHERE app_name=? AND job_name=? AND target_date=? AND status='success'"
  ).get(APP_NAME, jobName, targetDate) as { id: number } | undefined;
  db.close();
  return row != null;
}

export function markRunning(jobName: string, targetDate: string): void {
  const db = openJobsDb();
  db.prepare(`
    INSERT INTO job_runs (app_name, job_name, target_date, status, started_at)
    VALUES (?,?,?,'running',?)
    ON CONFLICT(app_name,job_name,target_date)
    DO UPDATE SET status='running', started_at=excluded.started_at, error_message=NULL, finished_at=NULL
  `).run(APP_NAME, jobName, targetDate, nowIso());
  db.close();
}

export function markSuccess(jobName: string, targetDate: string): void {
  const db = openJobsDb();
  db.prepare(`
    INSERT INTO job_runs (app_name, job_name, target_date, status, started_at, finished_at)
    VALUES (?,?,?,'success',?,?)
    ON CONFLICT(app_name,job_name,target_date)
    DO UPDATE SET status='success', finished_at=excluded.finished_at, error_message=NULL
  `).run(APP_NAME, jobName, targetDate, nowIso(), nowIso());
  db.close();
}

export function markFailed(jobName: string, targetDate: string, error: string): void {
  const db = openJobsDb();
  db.prepare(`
    INSERT INTO job_runs (app_name, job_name, target_date, status, started_at, finished_at, error_message)
    VALUES (?,?,?,'failed',?,?,?)
    ON CONFLICT(app_name,job_name,target_date)
    DO UPDATE SET status='failed', finished_at=excluded.finished_at, error_message=excluded.error_message
  `).run(APP_NAME, jobName, targetDate, nowIso(), nowIso(), error.slice(0, 500));
  db.close();
}

export function markSkipped(jobName: string, targetDate: string): void {
  const db = openJobsDb();
  db.prepare(`
    INSERT INTO job_runs (app_name, job_name, target_date, status, started_at, finished_at)
    VALUES (?,?,?,'skipped',?,?)
    ON CONFLICT(app_name,job_name,target_date)
    DO UPDATE SET status='skipped', finished_at=excluded.finished_at
  `).run(APP_NAME, jobName, targetDate, nowIso(), nowIso());
  db.close();
}

export function recordMissing(jobName: string, targetDate: string, reason: string): void {
  const db = openJobsDb();
  const exists = db.prepare(
    "SELECT id FROM missing_jobs WHERE app_name=? AND job_name=? AND target_date=?"
  ).get(APP_NAME, jobName, targetDate);
  if (!exists) {
    db.prepare(
      "INSERT INTO missing_jobs (app_name,job_name,target_date,reason) VALUES (?,?,?,?)"
    ).run(APP_NAME, jobName, targetDate, reason);
  }
  db.close();
}

export function getLastSuccessDate(jobName: string): string | null {
  const db = openJobsDb();
  const row = db.prepare(
    "SELECT target_date FROM job_runs WHERE app_name=? AND job_name=? AND status='success' ORDER BY target_date DESC LIMIT 1"
  ).get(APP_NAME, jobName) as { target_date: string } | undefined;
  db.close();
  return row?.target_date ?? null;
}

export function getMissingTargetDates(jobName: string, maxDays: number): string[] {
  const today = getTodayInTokyo();
  const last = getLastSuccessDate(jobName);
  if (!last) return []; // 一度も成功していない → catchup 対象外（初回 daily で取得する）
  const from = subtractDays(today, maxDays);
  const start = last < from ? from : subtractDays(last, -1); // last の翌日から
  if (start > today) return [];
  return getDatesBetween(start, today).filter(d => !hasSucceeded(jobName, d));
}

// ── ジョブ実行 ────────────────────────────────────────────────

export type RunResult = { success: boolean; skipped?: boolean; error?: string };

export function runPnpmJob(
  jobName: string,
  targetDate: string,
  pnpmScript: string,
  opts: { extraEnv?: Record<string, string>; silent?: boolean } = {}
): RunResult {
  if (hasSucceeded(jobName, targetDate)) {
    if (!opts.silent) console.log(`  [skip] ${jobName} (${targetDate}) 既に success`);
    return { success: true, skipped: true };
  }

  if (!opts.silent) console.log(`  [run]  ${jobName} (${targetDate})`);
  markRunning(jobName, targetDate);

  const result = spawnSync("pnpm", pnpmScript.split(" "), {
    stdio: "inherit",
    env: { ...process.env, ...(opts.extraEnv ?? {}) },
    shell: false,
  });

  if (result.status === 0) {
    markSuccess(jobName, targetDate);
    if (!opts.silent) console.log(`  [ok]   ${jobName}`);
    return { success: true };
  }

  const errMsg = result.stderr?.toString?.() ?? `exit ${result.status ?? "?"}`;
  markFailed(jobName, targetDate, errMsg);
  if (!opts.silent) console.log(`  [fail] ${jobName}: ${errMsg.slice(0, 100)}`);
  return { success: false, error: errMsg };
}
