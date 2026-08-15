import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { isJQuantsConfigured } from "./fetcher/jquants.js";
import { normalizeSourceHealthObject, normalizeSourceHealthScoreRows } from "./source-health-input.js";

type ReadinessStatus = "done" | "partial" | "blocked" | "not_started";

type ReadinessItem = {
  id: string;
  label: string;
  status: ReadinessStatus;
  score: number;
  evidence: string[];
  nextActions: string[];
};

type ReadinessReport = {
  generatedAt: string;
  overallScore: number;
  overallStatus: ReadinessStatus;
  blockers: string[];
  items: ReadinessItem[];
};

type LatestScoreRow = {
  code?: string;
  dataQuality?: string;
  warnings?: string[];
  primaryDisclosureReview?: unknown;
};

type LatestScoreRows = {
  rows: LatestScoreRow[];
  state: "missing" | "ok" | "invalid_root";
};

type PipelineStatusSnapshot = {
  status?: string;
  completeWrapperFailedSteps?: string[];
};

type PipelineInput = {
  value: PipelineStatusSnapshot | null;
  state: "missing" | "ok" | "invalid_root";
};

type AccuracySummarySnapshot = {
  total?: number;
  byActionLabel?: Record<string, { total?: number }>;
  byScoreBand?: Record<string, { total?: number }>;
};

type RunCursorSnapshot = {
  jobName?: string;
  offset?: number;
  maxPerRun?: number;
  total?: number;
  updatedAt?: string;
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

function latestScoreRows(): LatestScoreRows {
  if (!existsSync("reports")) return { rows: [], state: "missing" };
  const scoreFiles = readDirSafe("reports")
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  const latest = scoreFiles.at(-1);
  if (!latest) return { rows: [], state: "missing" };
  const raw = readJson<unknown>(join("reports", latest));
  if (raw == null) return { rows: [], state: "invalid_root" };
  const normalized = normalizeSourceHealthScoreRows<LatestScoreRow>(raw);
  return {
    rows: normalized.rows,
    state: normalized.valid ? "ok" : "invalid_root",
  };
}

function pipelineInput(generatedValue: unknown): PipelineInput {
  if (generatedValue !== undefined) {
    const normalized = normalizeSourceHealthObject<PipelineStatusSnapshot>(generatedValue);
    return {
      value: normalized.value,
      state: normalized.valid ? "ok" : "invalid_root",
    };
  }

  if (!existsSync("reports/pipeline_status_latest.json")) {
    return { value: null, state: "missing" };
  }
  const raw = readJson<unknown>("reports/pipeline_status_latest.json");
  if (raw == null) return { value: null, state: "invalid_root" };
  const normalized = normalizeSourceHealthObject<PipelineStatusSnapshot>(raw);
  return {
    value: normalized.value,
    state: normalized.valid ? "ok" : "invalid_root",
  };
}

function readDirSafe(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function latestBackupEvidence(): { count: number; latest: string | null; latestAgeDays: number | null } {
  const dirs = readDirSafe("backups").filter(name => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(name)).sort();
  const latest = dirs.at(-1) ?? null;
  if (!latest) return { count: 0, latest: null, latestAgeDays: null };
  try {
    const mtime = statSync(join("backups", latest)).mtimeMs;
    const latestAgeDays = Math.floor((Date.now() - mtime) / (24 * 60 * 60 * 1000));
    return { count: dirs.length, latest, latestAgeDays };
  } catch {
    return { count: dirs.length, latest, latestAgeDays: null };
  }
}

function scoreToStatus(score: number): ReadinessStatus {
  if (score >= 85) return "done";
  if (score >= 45) return "partial";
  if (score > 0) return "blocked";
  return "not_started";
}

function item(input: Omit<ReadinessItem, "status">): ReadinessItem {
  return { ...input, status: scoreToStatus(input.score) };
}

function pct(score: number): string {
  return `${Math.round(score)}%`;
}

function buildReport(): ReadinessReport {
  const generated = readJson<{
    universeCandidates?: Array<{ dataSource?: string }>;
    hypothesisPredictions?: unknown[];
    hypothesisOutcomes?: Array<{ dataSource?: string; dataAvailability?: string }>;
    companyMemory?: unknown[];
    primaryDisclosureReviews?: Record<string, unknown>;
    dataQualityByCode?: Record<string, { dataQuality?: string; warnings?: string[] }>;
    pipelineStatus?: { status?: string; completeWrapperFailedSteps?: string[] };
  }>("apps/web/public/generated/alpha-pon-data.json");

  const pipelineSnapshot = pipelineInput(generated?.pipelineStatus);
  const pipeline = pipelineSnapshot.value;
  const hypotheses = generated?.hypothesisPredictions ?? readJsonl<unknown>("data/hypothesis_predictions.jsonl");
  const outcomesInput = generated?.hypothesisOutcomes;
  const outcomesState = outcomesInput === undefined ? "fallback" : Array.isArray(outcomesInput) ? "ok" : "invalid_root";
  const outcomes = outcomesInput === undefined
    ? readJsonl<{ dataSource?: string; dataAvailability?: string }>("data/hypothesis_outcomes.jsonl")
    : Array.isArray(outcomesInput)
      ? outcomesInput
      : [];
  const companyMemory = generated?.companyMemory ?? readJson<unknown[]>("reports/company_memory_latest.json") ?? [];
  const scoreSnapshot = latestScoreRows();
  const scoreRows = scoreSnapshot.rows;
  const primaryReviews = generated?.primaryDisclosureReviews ?? {};
  const primaryCountFromScores = scoreRows.filter(row => row.primaryDisclosureReview).length;
  const primaryCount = Math.max(Object.keys(primaryReviews).length, primaryCountFromScores);
  const dataQuality = scoreRows.length > 0
    ? scoreRows.map(row => ({ dataQuality: row.dataQuality, warnings: row.warnings ?? [] }))
    : Object.values(generated?.dataQualityByCode ?? {});
  const universeInput = generated?.universeCandidates;
  const universeState = universeInput === undefined ? "missing" : Array.isArray(universeInput) ? "ok" : "invalid_root";
  const universe = Array.isArray(universeInput) ? universeInput : [];
  const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");
  const accuracySummary = readJson<AccuracySummarySnapshot>("data/hypothesis_accuracy_summary.json");
  const runCursors = readJson<Record<string, RunCursorSnapshot>>("data/run-cursors.json") ?? {};
  const backup = latestBackupEvidence();
  const hasOutcomeDb = existsSync("data/hypothesis_outcomes.db");
  const hasJobsDb = existsSync("data/alpha-pon-jobs.db");
  const hasBackupScript = Boolean(packageJson?.scripts?.backup);
  const hasHealthScript = Boolean(packageJson?.scripts?.health);
  const dailyFull = packageJson?.scripts?.["daily:full"] ?? "";
  const hasPrimaryPipeline = dailyFull.includes("sync:tdnet") && dailyFull.includes("scan:edinet:annual");
  const hasCompanyMemoryPipeline = dailyFull.includes("memory:companies");

  const jquantsConfigured = isJQuantsConfigured();
  const mockUniverse = universe.filter(candidate => candidate.dataSource === "mock").length;
  const missingQuality = dataQuality.filter(row => row.dataQuality === "missing" || row.dataQuality === "unknown").length;
  const qualityWarnings = dataQuality.reduce((sum, row) => sum + (row.warnings?.length ?? 0), 0);
  const failedSteps = pipeline?.completeWrapperFailedSteps ?? [];
  const realOutcomes = outcomes.filter(outcome => outcome.dataSource === "jquants").length;
  const pricedOutcomes = outcomes.filter(outcome => outcome.dataAvailability === "ok" || outcome.dataAvailability === "partial").length;
  const outcomeScore = outcomesState === "invalid_root"
    ? 15
    : realOutcomes >= 10
      ? 92
      : hasOutcomeDb && pricedOutcomes > 0 && accuracySummary?.byActionLabel && accuracySummary.byScoreBand
        ? 78
        : hasOutcomeDb && pricedOutcomes > 0
          ? 72
          : pricedOutcomes > 0
            ? 65
            : hypotheses.length > 0
              ? 45
              : 15;
  const opsScore = hasBackupScript && hasHealthScript && backup.count > 0 && backup.latestAgeDays != null && backup.latestAgeDays <= 7 && hasOutcomeDb && hasJobsDb
    ? 92
    : hasBackupScript && hasHealthScript && backup.count > 0 && hasOutcomeDb
      ? 78
      : hasBackupScript || hasHealthScript
        ? 55
        : 20;

  const items: ReadinessItem[] = [
    item({
      id: "real-data",
      label: "J-Quants実データ運用",
      score: scoreSnapshot.state === "invalid_root" || universeState === "invalid_root"
        ? 20
        : jquantsConfigured && mockUniverse === 0 && missingQuality === 0
          ? 100
          : jquantsConfigured
            ? 65
            : 20,
      evidence: [
        `J-Quants設定: ${jquantsConfigured ? "set" : "missing"}`,
        `latest score input: ${scoreSnapshot.state}`,
        `universe input: ${universeState}`,
        `mock universe: ${mockUniverse}`,
        `dataQuality missing/unknown: ${missingQuality}`,
      ],
      nextActions: universeState === "invalid_root"
        ? ["generated universeCandidates のrootを配列へ修復して readiness:audit を再実行する"]
        : scoreSnapshot.state === "invalid_root"
          ? ["最新 scores_YYYY-MM-DD.json のrootを配列へ修復して readiness:audit を再実行する"]
          : jquantsConfigured
            ? ["pnpm daily:full を数日連続で実行し、mock と missing が消えるか確認する"]
            : [".env に JQUANTS_API_KEY を設定する", "pnpm daily:full を実データで再実行する"],
    }),
    item({
      id: "pipeline",
      label: "毎朝pipeline監視",
      score: pipelineSnapshot.state === "invalid_root"
        ? 20
        : pipeline?.status === "completed" && failedSteps.length === 0
          ? 95
          : pipeline
            ? 55
            : 20,
      evidence: [
        `pipeline input: ${pipelineSnapshot.state}`,
        `pipeline status: ${pipeline?.status ?? "missing"}`,
        `failed/skipped: ${failedSteps.join(", ") || "none"}`,
      ],
      nextActions: pipelineSnapshot.state === "invalid_root"
        ? ["pipeline status JSON のrootをobjectへ修復して readiness:audit を再実行する"]
        : failedSteps.length > 0
          ? ["ホームとreportsで失敗ステップを確認する", "J-Quants未設定由来の失敗を実データ設定で解消する"]
          : ["run-daily-complete.sh と launchd の継続実行を確認する"],
    }),
    item({
      id: "hypothesis-outcomes",
      label: "仮説検証の厚み",
      score: outcomeScore,
      evidence: [
        `outcome input: ${outcomesState}`,
        `hypotheses: ${hypotheses.length}`,
        `outcomes: ${outcomes.length}`,
        `priced outcomes: ${pricedOutcomes}`,
        `real outcomes: ${realOutcomes}`,
        `SQLite outcome DB: ${hasOutcomeDb ? "present" : "missing"}`,
        `score bands: ${accuracySummary?.byScoreBand ? "present" : "missing"}`,
      ],
      nextActions: outcomesState === "invalid_root"
        ? ["generated hypothesisOutcomes のrootを配列へ修復して readiness:audit を再実行する"]
        : ["reviewDueAt を過ぎた仮説を J-Quants 実データで review:hypotheses する", "1w/1m/3m と TOPIX比が入った outcome を蓄積する"],
    }),
    item({
      id: "primary-disclosures",
      label: "一次情報・危険開示連携",
      score: scoreSnapshot.state === "invalid_root"
        ? 20
        : primaryCount >= 3 && hasPrimaryPipeline
          ? 85
          : primaryCount > 0
            ? 65
            : hasPrimaryPipeline
              ? 45
              : 25,
      evidence: [
        `latest score input: ${scoreSnapshot.state}`,
        `primaryDisclosureReviews: ${primaryCount}`,
        `dataQuality warnings: ${qualityWarnings}`,
        `daily:full primary scans: ${hasPrimaryPipeline ? "included" : "missing"}`,
      ],
      nextActions: scoreSnapshot.state === "invalid_root"
        ? ["最新 scores_YYYY-MM-DD.json のrootを配列へ修復して readiness:audit を再実行する"]
        : primaryCount > 0
          ? ["個別銘柄ページで block/caution 開示を確認する", "一次情報の本文PDF確認結果を company memory に反映する"]
          : ["daily を再実行し、score JSON に primaryDisclosureReview を残す", "個別銘柄ページで block/caution 開示を確認する"],
    }),
    item({
      id: "company-memory",
      label: "銘柄ごとの反省ノート",
      score: companyMemory.length >= 5 && hasCompanyMemoryPipeline ? 90 : companyMemory.length > 0 && hasCompanyMemoryPipeline ? 75 : companyMemory.length > 0 ? 60 : 20,
      evidence: [`companyMemory records: ${companyMemory.length}`, `daily:full memory: ${hasCompanyMemoryPipeline ? "included" : "missing"}`],
      nextActions: hasCompanyMemoryPipeline
        ? ["weakRules と recentOutcomes を個別銘柄判断に使う", "外れ理由が出た銘柄を watchlist のルール調整へ反映する"]
        : ["pnpm memory:companies を daily pipeline に含める", "weakRules と recentOutcomes を個別銘柄判断に使う"],
    }),
    item({
      id: "ops-health-backup",
      label: "SQLite / backup / health 運用",
      score: opsScore,
      evidence: [
        `script:health ${hasHealthScript ? "present" : "missing"}`,
        `script:backup ${hasBackupScript ? "present" : "missing"}`,
        `outcome DB: ${hasOutcomeDb ? "present" : "missing"}`,
        `jobs DB: ${hasJobsDb ? "present" : "missing"}`,
        `backup count: ${backup.count}`,
        `latest backup: ${backup.latest ?? "none"}${backup.latestAgeDays == null ? "" : ` (${backup.latestAgeDays}d)`}`,
        `run cursors: ${Object.keys(runCursors).join(", ") || "none"}`,
      ],
      nextActions: backup.count > 0
        ? ["pnpm health と pnpm backup を daily 運用後に確認する", "README の復元手順に沿って復旧リハーサルを行う"]
        : ["pnpm backup を実行し、data DB と run-cursors の復元対象を作る"],
    }),
    item({
      id: "portfolio-mode",
      label: "ポートフォリオ表示・README",
      score: existsSync("README.md") && existsSync("apps/web/app/page.tsx") ? 75 : 30,
      evidence: ["APP_MODE private/portfolio 表示あり", "README に表示モード・安全運用を記載"],
      nextActions: ["スクリーンショットと公開用デモデータを整える", "README 冒頭にポートフォリオ向けの使い方を追加する"],
    }),
  ];

  const overallScore = Math.round(items.reduce((sum, entry) => sum + entry.score, 0) / items.length);
  const blockers = items
    .filter(entry => entry.status === "blocked" || entry.score < 45)
    .map(entry => `${entry.label}: ${entry.nextActions[0] ?? "要確認"}`);

  return {
    generatedAt: todayJst(),
    overallScore,
    overallStatus: scoreToStatus(overallScore),
    blockers,
    items,
  };
}

function renderMarkdown(report: ReadinessReport): string {
  const lines: string[] = [];
  lines.push("# alpha-pon readiness audit");
  lines.push("");
  lines.push(`date: ${report.generatedAt}`);
  lines.push("");
  lines.push("> 100%完成へ近づけるための残タスク監査です。買い推奨ではありません。");
  lines.push("");
  lines.push(`- overall: ${pct(report.overallScore)} / ${report.overallStatus}`);
  lines.push("");
  lines.push("## blockers");
  lines.push("");
  if (report.blockers.length === 0) lines.push("- none");
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  lines.push("");
  lines.push("## items");
  lines.push("");
  for (const entry of report.items) {
    lines.push(`### ${entry.label}`);
    lines.push("");
    lines.push(`- status: ${entry.status}`);
    lines.push(`- score: ${pct(entry.score)}`);
    lines.push(`- evidence: ${entry.evidence.join(" / ") || "-"}`);
    lines.push(`- next: ${entry.nextActions.join(" / ") || "-"}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`*alpha-pon readiness audit | ${report.generatedAt} | ※買い推奨ではありません*`);
  return lines.join("\n");
}

function main(): void {
  const report = buildReport();
  mkdirSync("reports", { recursive: true });
  mkdirSync(join("apps", "web", "public", "generated"), { recursive: true });
  writeFileSync("reports/readiness_latest.json", JSON.stringify(report, null, 2), "utf-8");
  writeFileSync("reports/readiness_latest.md", renderMarkdown(report), "utf-8");
  writeFileSync(join("apps", "web", "public", "generated", "readiness.json"), JSON.stringify(report, null, 2), "utf-8");
  console.log(`readiness: ${pct(report.overallScore)} (${report.overallStatus})`);
  for (const blocker of report.blockers) console.log(`  blocker: ${blocker}`);
}

main();
