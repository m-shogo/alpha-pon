import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type PipelineStep = {
  name?: string;
  criticality?: string;
  status?: string;
  code?: number;
  durationSec?: number;
};

type PipelineResult = {
  name?: string;
  status?: string;
};

type PipelineStatus = {
  date?: string;
  generatedAt?: string;
  runType?: string;
  status?: string;
  failedSteps?: string | string[];
  steps?: PipelineStep[];
  results?: PipelineResult[];
};

type ScoreLogEntry = {
  code: string;
  name: string;
  dataQuality?: string;
  warnings?: string[];
  marketContext?: unknown;
  financialQuality?: unknown;
  primaryDisclosureReview?: {
    decision?: string;
    sourceCoverage?: {
      tdnetCount?: number;
      edinetCount?: number;
      scannedEdinetDates?: string[];
      fetchErrorCount?: number;
    };
    warnings?: string[];
    blockers?: string[];
  };
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function latestScoreFile(): string | null {
  if (!existsSync("reports")) return null;
  const files = readdirSync("reports")
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  return files.at(-1) ? join("reports", files.at(-1)!) : null;
}

function extractScoreDate(path: string | null): string | null {
  if (!path) return null;
  return path.match(/scores_(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? null;
}

function countIncludes(entries: ScoreLogEntry[], keyword: string): number {
  return entries.filter(entry => (entry.warnings ?? []).some(warning => warning.includes(keyword))).length;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "N/A";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function failedStepNames(status: PipelineStatus | null): string[] {
  if (!status) return [];

  const fromFailedSteps = Array.isArray(status.failedSteps)
    ? status.failedSteps
    : typeof status.failedSteps === "string"
      ? status.failedSteps.split(",").map(step => step.trim()).filter(Boolean)
      : [];

  const fromSteps = (status.steps ?? [])
    .filter(step => step.status && !["ok", "skipped"].includes(step.status))
    .map(step => step.name ?? "unknown");

  const fromResults = (status.results ?? [])
    .filter(result => result.status && !["ok", "skip", "skipped"].includes(result.status))
    .map(result => result.name ?? "unknown");

  return [...new Set([...fromFailedSteps, ...fromSteps, ...fromResults])];
}

function formatStep(step: PipelineStep | PipelineResult): string {
  const duration = "durationSec" in step && typeof step.durationSec === "number" ? ` (${step.durationSec}s)` : "";
  return `${step.status ?? "unknown"}${duration}`;
}

function stepStatus(status: PipelineStatus | null, aliases: string[]): string {
  const step = status?.steps?.find(item => item.name && aliases.includes(item.name))
    ?? status?.results?.find(item => item.name && aliases.includes(item.name));
  if (!step) return "missing";
  return formatStep(step);
}

function main() {
  const date = todayJst();
  const pipeline = readJson<PipelineStatus>("reports/pipeline_status_latest.json");
  const scorePath = latestScoreFile();
  const scoreDate = extractScoreDate(scorePath);
  const scores = scorePath ? readJson<ScoreLogEntry[]>(scorePath) ?? [] : [];
  const total = scores.length;

  const dataOk = scores.filter(score => score.dataQuality === "ok").length;
  const dataPartial = scores.filter(score => score.dataQuality === "partial").length;
  const dataMissing = scores.filter(score => score.dataQuality === "missing" || !score.dataQuality).length;
  const marketContextCount = scores.filter(score => !!score.marketContext).length;
  const financialQualityCount = scores.filter(score => !!score.financialQuality).length;
  const primaryReviewCount = scores.filter(score => !!score.primaryDisclosureReview).length;
  const primaryConfirmed = scores.filter(score => score.primaryDisclosureReview?.decision === "confirmed").length;
  const primaryCaution = scores.filter(score => score.primaryDisclosureReview?.decision === "caution").length;
  const primaryBlock = scores.filter(score => score.primaryDisclosureReview?.decision === "block").length;
  const primaryMissing = scores.filter(score => score.primaryDisclosureReview?.decision === "missing" || !score.primaryDisclosureReview).length;
  const tdnetHits = scores.reduce((sum, score) => sum + (score.primaryDisclosureReview?.sourceCoverage?.tdnetCount ?? 0), 0);
  const edinetHits = scores.reduce((sum, score) => sum + (score.primaryDisclosureReview?.sourceCoverage?.edinetCount ?? 0), 0);
  const fetchErrors = scores.reduce((sum, score) => sum + (score.primaryDisclosureReview?.sourceCoverage?.fetchErrorCount ?? 0), 0);
  const jquantsWarnings = countIncludes(scores, "JQUANTS") + countIncludes(scores, "株価データ") + countIncludes(scores, "ベンチマーク");
  const primaryWarnings = countIncludes(scores, "一次情報");
  const failedSteps = failedStepNames(pipeline);

  const lines: string[] = [];
  lines.push("# alpha-pon 情報源ヘルスレポート");
  lines.push("");
  lines.push(`生成日: ${date}`);
  lines.push("");
  lines.push("> 情報収集の抜け漏れを確認するための運用レポートです。買い推奨ではありません。");
  lines.push("");

  lines.push("## pipeline status");
  lines.push("");
  lines.push(`- status: ${pipeline?.status ?? "missing"}`);
  lines.push(`- date: ${pipeline?.date ?? "N/A"}`);
  lines.push(`- generatedAt: ${pipeline?.generatedAt ?? "N/A"}`);
  lines.push(`- runType: ${pipeline?.runType ?? "N/A"}`);
  lines.push(`- failedSteps: ${failedSteps.length > 0 ? failedSteps.join(", ") : "none"}`);
  lines.push(`- world_scan / scan:world: ${stepStatus(pipeline, ["world_scan", "scan:world"])}`);
  lines.push(`- source_health_check / health:sources: ${stepStatus(pipeline, ["source_health_check", "health:sources"])}`);
  lines.push(`- daily_company_score / daily:core: ${stepStatus(pipeline, ["daily_company_score", "daily", "daily:core"])}`);
  lines.push(`- scan_universe / scan:universe: ${stepStatus(pipeline, ["scan_universe", "scan:universe"])}`);
  lines.push(`- candidate_hypothesis / candidate:hypothesis: ${stepStatus(pipeline, ["candidate_hypothesis", "candidate:hypothesis"])}`);
  lines.push(`- review_due_predictions / review:hypotheses: ${stepStatus(pipeline, ["review_due_predictions", "review:hypotheses"])}`);
  lines.push(`- ui_data_generate / ui:data: ${stepStatus(pipeline, ["ui_data_generate", "ui:data", "ui:data:base", "ui:data:pro"])}`);
  lines.push("");

  lines.push("## score log freshness");
  lines.push("");
  lines.push(`- score file: ${scorePath ?? "missing"}`);
  lines.push(`- score date: ${scoreDate ?? "N/A"}`);
  lines.push(`- isToday: ${scoreDate === date ? "yes" : "no"}`);
  lines.push("");

  lines.push("## 情報源カバレッジ");
  lines.push("");
  lines.push("| 項目 | 件数 | 割合 |");
  lines.push("|------|------|------|");
  lines.push(`| score entries | ${total} | 100% |`);
  lines.push(`| dataQuality ok | ${dataOk} | ${pct(dataOk, total)} |`);
  lines.push(`| dataQuality partial | ${dataPartial} | ${pct(dataPartial, total)} |`);
  lines.push(`| dataQuality missing | ${dataMissing} | ${pct(dataMissing, total)} |`);
  lines.push(`| marketContextあり | ${marketContextCount} | ${pct(marketContextCount, total)} |`);
  lines.push(`| financialQualityあり | ${financialQualityCount} | ${pct(financialQualityCount, total)} |`);
  lines.push(`| primaryDisclosureReviewあり | ${primaryReviewCount} | ${pct(primaryReviewCount, total)} |`);
  lines.push("");

  lines.push("## 一次情報カバレッジ");
  lines.push("");
  lines.push(`- confirmed/caution/block/missing: ${primaryConfirmed}/${primaryCaution}/${primaryBlock}/${primaryMissing}`);
  lines.push(`- TDnet hit count: ${tdnetHits}`);
  lines.push(`- EDINET hit count: ${edinetHits}`);
  lines.push(`- fetch error count: ${fetchErrors}`);
  const scannedDates = [...new Set(scores.flatMap(score => score.primaryDisclosureReview?.sourceCoverage?.scannedEdinetDates ?? []))];
  if (scannedDates.length > 0) lines.push(`- EDINET scanned dates: ${scannedDates.join(" / ")}`);
  lines.push("");

  lines.push("## 警告の濃さ");
  lines.push("");
  lines.push(`- J-Quants/株価/ベンチマーク系 warning: ${jquantsWarnings}`);
  lines.push(`- 一次情報 warning: ${primaryWarnings}`);
  lines.push("");

  const decisions: string[] = [];
  const healthyStatuses = ["ok", "completed", "completed_with_warnings"];
  if (!pipeline) decisions.push("- 🛑 pipeline_status_latest.json がありません。pnpm daily / pnpm health の実行状態を確認してください。");
  if (pipeline?.date && pipeline.date !== date) decisions.push(`- ⚠️ pipeline status が本日分ではありません（最終: ${pipeline.date}）。今日の自動実行を確認してください。`);
  if (pipeline?.status && pipeline.status === "partial_failed") decisions.push("- ⚠️ pipeline は一部失敗です。failedSteps と job_runs を確認してください。");
  if (pipeline?.status && !healthyStatuses.includes(pipeline.status) && pipeline.status !== "partial_failed") decisions.push(`- 🛑 pipeline status が ${pipeline.status} です。daily の成否を確認してください。`);
  if (failedSteps.length > 0) decisions.push(`- 🛑 pipeline failedSteps: ${failedSteps.join(", ")}`);
  if (!scorePath) decisions.push("- 🛑 scores JSON がありません。daily がレポートを生成できていない可能性があります。");
  if (scoreDate && scoreDate !== date) decisions.push(`- ⚠️ score log が本日分ではありません（最新: ${scoreDate}）。古いスコアを今日の判断材料として扱わないでください。`);
  if (total === 0) decisions.push("- 🛑 scores JSON が空です。daily がスコアを生成できていない可能性があります。");
  if (total > 0 && dataMissing / total > 0.5) decisions.push("- ⚠️ dataQuality missing が多いです。J-Quants設定やmock運用状態を確認してください。");
  if (total > 0 && marketContextCount / total < 0.5) decisions.push("- ⚠️ marketContext が少ないです。株価・ベンチマーク取得を確認してください。");
  if (total > 0 && primaryReviewCount / total < 0.8) decisions.push("- ⚠️ primaryDisclosureReview が少ないです。一次情報レビューの接続を確認してください。");
  if (fetchErrors > 0) decisions.push("- ⚠️ TDnet/EDINET取得エラーがあります。外部サイト・API状態を確認してください。");
  if (primaryMissing > primaryConfirmed + primaryCaution + primaryBlock && total > 0) decisions.push("- 🔎 一次情報missingが多いです。ニュース材料は公式IR/TDnet/EDINETの裏取り前提で扱ってください。");
  if (decisions.length === 0) decisions.push("- ✅ 大きな情報源異常は検出していません。継続してログを貯めてください。");

  lines.push("## 運用判断");
  lines.push("");
  lines.push(...decisions);
  lines.push("");

  lines.push("---");
  lines.push(`*alpha-pon source health | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `source_health_${date}.md`), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "source_health_latest.md"), lines.join("\n"), "utf-8");
  console.log(`レポート: reports/source_health_${date}.md`);
}

main();
