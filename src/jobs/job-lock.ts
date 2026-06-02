// ジョブ排他ロック管理
// job_locks テーブルを使い、同一 job_key の二重実行を防ぐ

import { openJobsDb } from "./db.js";
import { nowIso } from "./date-utils.js";

const STALE_LOCK_MS = 6 * 60 * 60 * 1000; // 6時間以上前のロックは stale

export function acquireLock(jobKey: string): boolean {
  const db = openJobsDb();
  try {
    const existing = db.prepare(
      "SELECT locked_at FROM job_locks WHERE job_key = ?"
    ).get(jobKey) as { locked_at: string } | undefined;

    if (existing) {
      const age = Date.now() - new Date(existing.locked_at).getTime();
      if (age < STALE_LOCK_MS) {
        db.close();
        return false; // 有効なロックが存在する
      }
      // stale lock → 解除して取得
      console.log(`[lock] stale lock を解除: ${jobKey} (${Math.round(age / 60000)}分前)`);
      db.prepare("DELETE FROM job_locks WHERE job_key = ?").run(jobKey);
    }

    db.prepare(
      "INSERT OR REPLACE INTO job_locks (job_key, locked_at) VALUES (?, ?)"
    ).run(jobKey, nowIso());
    db.close();
    return true;
  } catch (err) {
    db.close();
    console.error(`[lock] acquireLock 失敗:`, err);
    return false;
  }
}

export function releaseLock(jobKey: string): void {
  try {
    const db = openJobsDb();
    db.prepare("DELETE FROM job_locks WHERE job_key = ?").run(jobKey);
    db.close();
  } catch {
    // ロック解除は best-effort
  }
}
