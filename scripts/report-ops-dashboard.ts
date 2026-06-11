// pnpm report:ops — 運用司令塔 v1
// 既存の生成物・レポートを読み取り、統合サマリーを生成する。
// 出力:
//   reports/ops-dashboard.md
//   reports/ops-dashboard.json
//   apps/web/public/generated/ops-dashboard.json  （/ops ページ用）
// このスクリプト自体は読み取り + レポート出力のみで、データを書き換えない。

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getTodayInTokyo } from "../src/jobs/date-utils.js";
import {
  buildOpsDashboard,
  findForbiddenWording,
  renderOpsDashboardMarkdown,
  type OpsAlphaDataLike,
  type OpsIntegrityLike,
  type OpsOutcomeLike,
  type OpsPipelineStatusLike,
  type OpsSpecialOpsLike,
  type SafeWordingFinding,
} from "../src/ops-dashboard.js";

const ROOT = process.cwd();

function readJson<T>(path: string): T | null {
  const full = join(ROOT, path);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8")) as T;
  } catch {
    return null;
  }
}

// ── 安全表現スキャン（生成物のみ。ソースは tests/safe-wording.test.ts が担当） ──

function collectSafeWordingTargets(): string[] {
  const targets: string[] = [];
  const generatedDir = join(ROOT, "apps/web/public/generated");
  if (existsSync(generatedDir)) {
    for (const name of readdirSync(generatedDir)) {
      if (name.endsWith(".json") && name !== "ops-dashboard.json") {
        targets.push(`apps/web/public/generated/${name}`);
      }
    }
  }
  const reportsDir = join(ROOT, "reports");
  if (existsSync(reportsDir)) {
    for (const name of readdirSync(reportsDir)) {
      if ((name.endsWith("_latest.md") || name === "latest.md") && name !== "ops-dashboard.md") {
        targets.push(`reports/${name}`);
      }
    }
  }
  return targets;
}

function scanSafeWording(): { scannedFiles: number; findings: SafeWordingFinding[] } {
  const targets = collectSafeWordingTargets();
  const findings: SafeWordingFinding[] = [];
  for (const rel of targets) {
    try {
      findings.push(...findForbiddenWording(readFileSync(join(ROOT, rel), "utf-8"), rel));
    } catch {
      // 読めないファイルはスキップ（監査対象外）
    }
  }
  return { scannedFiles: targets.length, findings };
}

// ── メイン ───────────────────────────────────────────────────

const today = getTodayInTokyo();
const safeWording = scanSafeWording();

type OutcomesFile = { outcomes?: OpsOutcomeLike[] };
const outcomesFile = readJson<OutcomesFile>("apps/web/public/generated/outcomes.json");

const dashboard = buildOpsDashboard({
  today,
  pipelineStatus: readJson<OpsPipelineStatusLike>("reports/pipeline_status_latest.json"),
  alphaData: readJson<OpsAlphaDataLike>("apps/web/public/generated/alpha-pon-data.json"),
  outcomes: outcomesFile?.outcomes ?? null,
  specialOps: readJson<OpsSpecialOpsLike>("reports/special_situation_ops_summary_latest.json"),
  integrity: readJson<OpsIntegrityLike>("reports/hypothesis_outcome_integrity_latest.json"),
  safeWordingScannedFiles: safeWording.scannedFiles,
  safeWordingFindings: safeWording.findings,
});

const json = JSON.stringify(dashboard, null, 2) + "\n";
const markdown = renderOpsDashboardMarkdown(dashboard);

mkdirSync(join(ROOT, "reports"), { recursive: true });
writeFileSync(join(ROOT, "reports/ops-dashboard.json"), json);
writeFileSync(join(ROOT, "reports/ops-dashboard.md"), markdown);

const webGeneratedDir = join(ROOT, "apps/web/public/generated");
if (existsSync(webGeneratedDir)) {
  writeFileSync(join(webGeneratedDir, "ops-dashboard.json"), json);
}

console.log(`\n=== alpha-pon ops dashboard (${today}) ===\n`);
console.log(`healthStatus: ${dashboard.healthStatus}`);
console.log("");
if (dashboard.priorityIssues.length === 0) {
  console.log("優先対応: なし");
} else {
  console.log("優先対応 TOP5:");
  for (const issue of dashboard.priorityIssues) {
    console.log(`  ${issue.rank}. [${issue.severity}] ${issue.title}`);
    if (issue.command) console.log(`     → ${issue.command}`);
  }
}
console.log("");
console.log("次の安全コマンド:");
for (const cmd of dashboard.nextSafeCommands) {
  console.log(`  - ${cmd.command} — ${cmd.reason}`);
}
console.log("");
console.log("出力: reports/ops-dashboard.md / reports/ops-dashboard.json / apps/web/public/generated/ops-dashboard.json");
