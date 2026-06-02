// pnpm health — alpha-pon の自動運用可否を確認する
// OK / WARN / ERROR を出力し、致命的エラーのみ exit(1)

import { existsSync } from "fs";
import { spawnSync } from "child_process";
import { openJobsDb } from "../src/jobs/db.js";
import { getTodayInTokyo } from "../src/jobs/date-utils.js";
import { getLastSuccessDate, APP_NAME } from "../src/jobs/job-runner.js";

const TODAY = getTodayInTokyo();

type Level = "OK" | "WARN" | "ERROR";
const results: { level: Level; item: string; detail: string }[] = [];

function ok(item: string, detail = "") { results.push({ level: "OK", item, detail }); }
function warn(item: string, detail = "") { results.push({ level: "WARN", item, detail }); }
function error(item: string, detail = "") { results.push({ level: "ERROR", item, detail }); }

// ── Node / pnpm ──────────────────────────────────────────────
const nodeVer = spawnSync("node", ["--version"], { encoding: "utf-8" });
nodeVer.status === 0
  ? ok("Node.js", nodeVer.stdout.trim())
  : error("Node.js", "node コマンドが見つからない");

const pnpmVer = spawnSync("pnpm", ["--version"], { encoding: "utf-8" });
pnpmVer.status === 0
  ? ok("pnpm", `v${pnpmVer.stdout.trim()}`)
  : error("pnpm", "pnpm コマンドが見つからない");

// ── DB 接続 ──────────────────────────────────────────────────
let dbOk = false;
try {
  const db = openJobsDb();
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all() as { name: string }[];
  const tableNames = tables.map(t => t.name);
  db.close();

  for (const t of ["job_runs", "missing_jobs", "job_locks"]) {
    tableNames.includes(t)
      ? ok(`DB テーブル: ${t}`)
      : error(`DB テーブル: ${t}`, "テーブルが存在しない");
  }
  dbOk = true;
} catch (e) {
  error("DB 接続", String(e));
}

// ── package.json scripts ─────────────────────────────────────
let pkg: Record<string, unknown> = {};
try {
  pkg = JSON.parse(
    (await import("fs")).readFileSync("package.json", "utf-8")
  ) as Record<string, unknown>;
} catch { /* ignore */ }
const scripts = (pkg.scripts ?? {}) as Record<string, string>;

for (const cmd of ["catchup", "daily", "health"]) {
  scripts[cmd]
    ? ok(`package.json scripts.${cmd}`)
    : error(`package.json scripts.${cmd}`, "エントリが未登録");
}

// ── 重要な既存 CLI ───────────────────────────────────────────
const importantScripts: Record<string, string> = {
  "scan:world":          "world_scan",
  "health:sources":      "source_health_check",
  "daily:core":          "daily_company_score",
  "review:hypotheses":   "review_due_predictions",
  "review:analogies:write": "review_analogies",
  "scan:universe":       "scan_universe",
  "candidate:hypothesis": "candidate_hypothesis",
  "review:weekly":       "weekly_report",
  "review:monthly":      "monthly_report",
  "ui:data":             "ui_data_generate",
  "readiness:audit":     "readiness_audit",
};
for (const [key, jobName] of Object.entries(importantScripts)) {
  scripts[key]
    ? ok(`CLI: ${key}`, `→ ${jobName}`)
    : warn(`CLI: ${key}`, "package.json に未登録（未接続）");
}

// ── 最後の success 実行日 ────────────────────────────────────
if (dbOk) {
  const monitoredJobs = [
    "world_scan", "daily_company_score", "review_due_predictions", "ui_data_generate",
  ];
  for (const jobName of monitoredJobs) {
    const last = getLastSuccessDate(jobName);
    if (!last) {
      warn(`最終成功: ${jobName}`, "未実行");
    } else if (last < TODAY) {
      warn(`最終成功: ${jobName}`, `${last}（今日まだ未実行）`);
    } else {
      ok(`最終成功: ${jobName}`, last);
    }
  }

  // failed が残っていないか
  try {
    const db = openJobsDb();
    const failed = db.prepare(
      "SELECT job_name, target_date FROM job_runs WHERE app_name=? AND status='failed' ORDER BY target_date DESC LIMIT 5"
    ).all(APP_NAME) as { job_name: string; target_date: string }[];
    db.close();
    failed.length === 0
      ? ok("failed jobs", "なし")
      : warn("failed jobs", failed.map(r => `${r.job_name}(${r.target_date})`).join(", "));
  } catch { /* ignore */ }

  // missing_jobs 件数
  try {
    const db = openJobsDb();
    const count = (db.prepare(
      "SELECT COUNT(*) as n FROM missing_jobs WHERE app_name=?"
    ).get(APP_NAME) as { n: number }).n;
    db.close();
    count === 0
      ? ok("missing_jobs", "0件")
      : warn("missing_jobs", `${count}件（catchup で補完できなかった処理）`);
  } catch { /* ignore */ }
}

// ── 生成データファイル ────────────────────────────────────────
const generatedFiles = [
  "apps/web/public/generated/alpha-pon-data.json",
  "apps/web/public/generated/hypotheses.json",
  "apps/web/public/generated/outcomes.json",
];
for (const f of generatedFiles) {
  existsSync(f)
    ? ok(`生成データ: ${f.split("/").pop()}`)
    : warn(`生成データ: ${f.split("/").pop()}`, "ファイルが存在しない（pnpm ui:data を実行してください）");
}

// ── hypothesis DB ─────────────────────────────────────────────
existsSync("data/hypothesis_outcomes.db")
  ? ok("hypothesis_outcomes.db")
  : warn("hypothesis_outcomes.db", "未生成（review:hypotheses 実行前）");

// ── 出力 ──────────────────────────────────────────────────────
console.log(`\n=== alpha-pon health check (${TODAY}) ===\n`);
for (const r of results) {
  const prefix = r.level === "OK" ? "✓" : r.level === "WARN" ? "△" : "✗";
  const detail = r.detail ? `  ${r.detail}` : "";
  console.log(`[${r.level}] ${prefix} ${r.item}${detail}`);
}

const errors = results.filter(r => r.level === "ERROR");
const warns = results.filter(r => r.level === "WARN");
console.log(
  `\n合計: ${results.filter(r => r.level === "OK").length} OK, ` +
  `${warns.length} WARN, ${errors.length} ERROR`
);

if (errors.length > 0) {
  console.log("\n[ERROR] 致命的エラーがあります。修正してください。");
  process.exit(1);
}
process.exit(0);
