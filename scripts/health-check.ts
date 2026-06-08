// pnpm health — alpha-pon の自動運用可否を確認する
// OK / WARN / ERROR を出力し、致命的エラーのみ exit(1)

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { openJobsDb } from "../src/jobs/db.js";
import { getTodayInTokyo } from "../src/jobs/date-utils.js";
import { getLastSuccessDate, APP_NAME } from "../src/jobs/job-runner.js";
import { buildOutcomeIntegrityReport } from "../src/hypothesis-outcome-integrity.js";

const TODAY = getTodayInTokyo();

type Level = "OK" | "WARN" | "ERROR";
const results: { level: Level; item: string; detail: string }[] = [];

function ok(item: string, detail = "") { results.push({ level: "OK", item, detail }); }
function warn(item: string, detail = "") { results.push({ level: "WARN", item, detail }); }
function error(item: string, detail = "") { results.push({ level: "ERROR", item, detail }); }

function tokyoDateFromMtime(path: string): string | null {
  if (!existsSync(path)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(statSync(path).mtime);
  const byType = new Map(parts.map(part => [part.type, part.value]));
  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

const successArtifactByJob: Record<string, string[]> = {
  world_scan: [
    `reports/world_events_${TODAY}.md`,
    "reports/world_events_latest.json",
  ],
  daily_company_score: [
    "reports/latest.md",
    "data/stock_scores_latest.json",
  ],
  review_due_predictions: [
    "data/hypothesis_outcomes.jsonl",
    "data/hypothesis_outcomes.db",
  ],
  ui_data_generate: [
    "apps/web/public/generated/alpha-pon-data.json",
    "apps/web/public/generated/hypotheses.json",
    "apps/web/public/generated/outcomes.json",
  ],
};

function todayFreshArtifacts(jobName: string): string[] {
  return (successArtifactByJob[jobName] ?? []).filter(path => tokyoDateFromMtime(path) === TODAY);
}

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
      const freshArtifacts = todayFreshArtifacts(jobName);
      freshArtifacts.length > 0
        ? ok(`最終成功: ${jobName}`, `job_runs 未記録 / artifact fresh: ${freshArtifacts.map(f => f.split("/").pop()).join(", ")}`)
        : warn(`最終成功: ${jobName}`, "未実行");
    } else if (last < TODAY) {
      const freshArtifacts = todayFreshArtifacts(jobName);
      freshArtifacts.length > 0
        ? ok(`最終成功: ${jobName}`, `${last} / artifact fresh: ${freshArtifacts.map(f => f.split("/").pop()).join(", ")}`)
        : warn(`最終成功: ${jobName}`, `${last}（今日まだ未実行）`);
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

  // job_locks チェック（残留ロックの検知）
  try {
    const db = openJobsDb();
    const locks = db.prepare(
      "SELECT job_key, locked_at FROM job_locks"
    ).all() as { job_key: string; locked_at: string }[];
    db.close();

    if (locks.length === 0) {
      ok("job_locks", "残留ロックなし");
    } else {
      const STALE_MS = 6 * 60 * 60 * 1000;
      for (const lock of locks) {
        const age = Date.now() - new Date(lock.locked_at).getTime();
        if (age >= STALE_MS) {
          warn("job_locks", `stale ロック（${Math.round(age / 3600000)}h前）: ${lock.job_key} — pnpm daily / catchup を再実行すると自動解除されます`);
        } else {
          warn("job_locks", `active ロック（${Math.round(age / 60000)}分前）: ${lock.job_key} — 別プロセスが実行中の可能性があります`);
        }
      }
    }
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

// ── special situation ops ────────────────────────────────────
type SpecialOpsSummary = {
  healthStatus?: "ok" | "needs_attention" | "action_required";
  actionItems?: Array<{ priority?: string; title?: string; command?: string; detail?: string }>;
  reviewDue?: { overdue?: number; historicalSeedOverdue?: number; dueToday?: number; dueThisWeek?: number };
  backfill?: { recentUpdatable?: number; historicalUpdatable?: number };
  outcomeStats?: { sampleTooSmall?: number };
};
const specialOps = readJson<SpecialOpsSummary>("reports/special_situation_ops_summary_latest.json");
if (!specialOps) {
  warn("special situation ops", "未生成（pnpm ops:special を実行してください）");
} else if (specialOps.healthStatus === "action_required") {
  const urgent = (specialOps.actionItems ?? []).filter(item => item.priority === "urgent");
  const command = urgent.find(item => item.command)?.command ?? "pnpm ops:special";
  warn(
    "special situation ops",
    `action_required: ${urgent.map(item => item.title).join(" / ") || "要対応あり"} / nextAction: ${command}`
  );
} else if (specialOps.healthStatus === "needs_attention") {
  const attention = (specialOps.actionItems ?? []).filter(item => item.priority === "attention");
  warn(
    "special situation ops",
    `needs_attention: ${attention.map(item => item.title).join(" / ") || "確認事項あり"} / nextAction: pnpm ops:special`
  );
} else {
  ok("special situation ops", "ok");
}

// ── hypothesis outcome duplicate / DB unique index ───────────
{
  const integrity = buildOutcomeIntegrityReport({ generatedAt: TODAY });
  if (integrity.status === "duplicate_found") {
    warn(
      "hypothesis_outcomes duplicate",
      `action_required: jsonl=${integrity.jsonl.duplicateGroups.length}, sqlite=${integrity.sqlite.duplicateGroups.length} / nextAction: pnpm outcomes:integrity`
    );
  } else if (integrity.status === "db_unavailable") {
    warn("hypothesis_outcomes db", `DB確認不可: ${integrity.sqlite.error ?? "unknown"} / nextAction: pnpm review:hypotheses`);
  } else {
    ok("hypothesis_outcomes duplicate", "重複なし");
  }
  integrity.sqlite.uniqueIndexExists
    ? ok("hypothesis_outcomes unique index", "idx_hypothesis_outcomes_unique")
    : warn("hypothesis_outcomes unique index", "未確認（pnpm review:hypotheses で schema 初期化）");
}

// ── Pro committee / UI generated data consistency ────────────
type CommitteeJson = { decisions?: Array<Record<string, unknown>> };
type AlphaPonData = {
  legendProCommittee?: { decisions?: Array<Record<string, unknown>> };
  stockProCommitteeJson?: { decisions?: Array<Record<string, unknown>> };
  buffettQuality?: unknown;
  valuationSnapshots?: unknown;
  irEventEvidence?: unknown;
};
const committeeJson = readJson<CommitteeJson>("reports/stock_pro_committee_latest.json");
const alphaData = readJson<AlphaPonData>("apps/web/public/generated/alpha-pon-data.json");
const committeeDecisionCount = committeeJson?.decisions?.length ?? 0;
const legendDecisionCount = alphaData?.legendProCommittee?.decisions?.length ?? 0;
if (!committeeJson) {
  warn("Pro委員会 JSON", "未生成（pnpm pro:committee を実行してください）");
} else if (committeeDecisionCount === 0) {
  warn("Pro委員会 decisions", "0件（pnpm pro:committee を確認）");
} else {
  ok("Pro委員会 decisions", `${committeeDecisionCount}件`);
}
if (!alphaData) {
  warn("UI generated alpha data", "読み込み不可（pnpm ui:data を実行してください）");
} else if (committeeDecisionCount !== legendDecisionCount) {
  warn(
    "legendProCommittee decisions",
    `件数ズレ: committee=${committeeDecisionCount}, ui=${legendDecisionCount} / nextAction: pnpm ui:data`
  );
} else {
  ok("legendProCommittee decisions", `${legendDecisionCount}件`);
}
for (const key of ["buffettQuality", "valuationSnapshots", "irEventEvidence", "stockProCommitteeJson"] as const) {
  alphaData && key in alphaData
    ? ok(`UI generated: ${key}`)
    : warn(`UI generated: ${key}`, "不足（pnpm ui:data を実行してください）");
}

// ── hypothesis DB ─────────────────────────────────────────────
existsSync("data/hypothesis_outcomes.db")
  ? ok("hypothesis_outcomes.db")
  : warn("hypothesis_outcomes.db", "未生成（review:hypotheses 実行前）");

// ── backup script & 状態確認 ─────────────────────────────────
{
  let pkg: Record<string, unknown> = {};
  try { pkg = JSON.parse(readFileSync("package.json", "utf-8")) as Record<string, unknown>; } catch { /* ignore */ }
  const pkgScripts = (pkg.scripts ?? {}) as Record<string, string>;

  pkgScripts["backup"]
    ? ok("script:backup")
    : warn("script:backup", "package.json に backup script がない");

  const BACKUP_ROOT = "backups";
  if (!existsSync(BACKUP_ROOT)) {
    warn("backup:dir", "backups/ 未作成（pnpm backup を実行してください）");
  } else {
    const dirs = readdirSync(BACKUP_ROOT)
      .filter(n => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(n))
      .sort();
    const count = dirs.length;
    const latest = dirs[count - 1] ?? null;
    if (count === 0) {
      warn("backup:latest", "バックアップ 0 件（pnpm backup を実行してください）");
    } else {
      const latestPath = join(BACKUP_ROOT, latest);
      const ageMs = Date.now() - statSync(latestPath).mtime.getTime();
      const ageDays = Math.floor(ageMs / 86400000);
      ageDays > 3
        ? warn("backup:latest", `${latest}（${ageDays}日前 — 古い可能性あり）`)
        : ok("backup:latest", `${latest}（${ageDays}日前）`);
    }
    count > 30
      ? warn("backup:count", `${count} 件（30件超過）`)
      : ok("backup:count", `${count} 件`);
  }
}

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
