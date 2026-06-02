import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

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

function latestScoreRows(): LatestScoreRow[] {
  if (!existsSync("reports")) return [];
  const scoreFiles = readDirSafe("reports")
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  const latest = scoreFiles.at(-1);
  return latest ? readJson<LatestScoreRow[]>(join("reports", latest)) ?? [] : [];
}

function readDirSafe(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
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

  const pipeline = generated?.pipelineStatus ?? readJson<{ status?: string; completeWrapperFailedSteps?: string[] }>("reports/pipeline_status_latest.json");
  const hypotheses = generated?.hypothesisPredictions ?? readJsonl<unknown>("data/hypothesis_predictions.jsonl");
  const outcomes = generated?.hypothesisOutcomes ?? readJsonl<{ dataSource?: string; dataAvailability?: string }>("data/hypothesis_outcomes.jsonl");
  const companyMemory = generated?.companyMemory ?? readJson<unknown[]>("reports/company_memory_latest.json") ?? [];
  const scoreRows = latestScoreRows();
  const primaryReviews = generated?.primaryDisclosureReviews ?? {};
  const primaryCountFromScores = scoreRows.filter(row => row.primaryDisclosureReview).length;
  const primaryCount = Math.max(Object.keys(primaryReviews).length, primaryCountFromScores);
  const dataQuality = scoreRows.length > 0
    ? scoreRows.map(row => ({ dataQuality: row.dataQuality, warnings: row.warnings ?? [] }))
    : Object.values(generated?.dataQualityByCode ?? {});
  const universe = generated?.universeCandidates ?? [];
  const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");
  const dailyFull = packageJson?.scripts?.["daily:full"] ?? "";
  const hasPrimaryPipeline = dailyFull.includes("sync:tdnet") && dailyFull.includes("scan:edinet:annual");
  const hasCompanyMemoryPipeline = dailyFull.includes("memory:companies");

  const jquantsConfigured = Boolean(process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD);
  const mockUniverse = universe.filter(candidate => candidate.dataSource === "mock").length;
  const missingQuality = dataQuality.filter(row => row.dataQuality === "missing" || row.dataQuality === "unknown").length;
  const qualityWarnings = dataQuality.reduce((sum, row) => sum + (row.warnings?.length ?? 0), 0);
  const failedSteps = pipeline?.completeWrapperFailedSteps ?? [];
  const realOutcomes = outcomes.filter(outcome => outcome.dataSource === "jquants").length;
  const pricedOutcomes = outcomes.filter(outcome => outcome.dataAvailability === "ok" || outcome.dataAvailability === "partial").length;

  const items: ReadinessItem[] = [
    item({
      id: "real-data",
      label: "J-Quants実データ運用",
      score: jquantsConfigured && mockUniverse === 0 && missingQuality === 0 ? 100 : jquantsConfigured ? 65 : 20,
      evidence: [
        `J-Quants設定: ${jquantsConfigured ? "set" : "missing"}`,
        `mock universe: ${mockUniverse}`,
        `dataQuality missing/unknown: ${missingQuality}`,
      ],
      nextActions: jquantsConfigured
        ? ["pnpm daily:full を数日連続で実行し、mock と missing が消えるか確認する"]
        : [".env に JQUANTS_EMAIL / JQUANTS_PASSWORD を設定する", "pnpm daily:full を実データで再実行する"],
    }),
    item({
      id: "pipeline",
      label: "毎朝pipeline監視",
      score: pipeline?.status === "completed" && failedSteps.length === 0 ? 95 : pipeline ? 55 : 20,
      evidence: [`pipeline status: ${pipeline?.status ?? "missing"}`, `failed/skipped: ${failedSteps.join(", ") || "none"}`],
      nextActions: failedSteps.length > 0
        ? ["ホームとreportsで失敗ステップを確認する", "J-Quants未設定由来の失敗を実データ設定で解消する"]
        : ["run-daily-complete.sh と launchd の継続実行を確認する"],
    }),
    item({
      id: "hypothesis-outcomes",
      label: "仮説検証の厚み",
      score: realOutcomes >= 10 ? 90 : pricedOutcomes > 0 ? 65 : hypotheses.length > 0 ? 45 : 15,
      evidence: [`hypotheses: ${hypotheses.length}`, `outcomes: ${outcomes.length}`, `priced outcomes: ${pricedOutcomes}`, `real outcomes: ${realOutcomes}`],
      nextActions: ["reviewDueAt を過ぎた仮説を J-Quants 実データで review:hypotheses する", "1w/1m/3m と TOPIX比が入った outcome を蓄積する"],
    }),
    item({
      id: "primary-disclosures",
      label: "一次情報・危険開示連携",
      score: primaryCount >= 3 && hasPrimaryPipeline ? 85 : primaryCount > 0 ? 65 : hasPrimaryPipeline ? 45 : 25,
      evidence: [
        `primaryDisclosureReviews: ${primaryCount}`,
        `dataQuality warnings: ${qualityWarnings}`,
        `daily:full primary scans: ${hasPrimaryPipeline ? "included" : "missing"}`,
      ],
      nextActions: primaryCount > 0
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
