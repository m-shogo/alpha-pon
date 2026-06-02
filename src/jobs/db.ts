// ジョブ管理 SQLite DB
// テーブル: job_runs / missing_jobs / job_locks
// DB パス: data/alpha-pon-jobs.db (hypothesis_outcomes.db とは別)

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";

const DB_PATH = "data/alpha-pon-jobs.db";

export function openJobsDb(): DatabaseSync {
  mkdirSync("data", { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name      TEXT NOT NULL,
      job_name      TEXT NOT NULL,
      target_date   TEXT NOT NULL,
      status        TEXT NOT NULL CHECK(status IN ('pending','running','success','failed','skipped')),
      started_at    TEXT NOT NULL,
      finished_at   TEXT,
      error_message TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_job_runs_unique
      ON job_runs (app_name, job_name, target_date);

    CREATE TABLE IF NOT EXISTS missing_jobs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name    TEXT NOT NULL,
      job_name    TEXT NOT NULL,
      target_date TEXT NOT NULL,
      reason      TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS job_locks (
      job_key   TEXT PRIMARY KEY,
      locked_at TEXT NOT NULL
    );
  `);
  return db;
}
