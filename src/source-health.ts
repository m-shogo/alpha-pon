import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type PipelineStep = {
  name: string;
  criticality: string;
  status: string;
  code: number;
  durationSec?: number;
};

type PipelineStatus = {
  date?: string;
  status?: string;
  failedSteps?: string;
  steps?: PipelineStep[];
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

function countIncludes(entries: ScoreLogEntry[], keyword: string): number {
  return entries.filter(entry => (entry.warnings ?? []).some(warning => warning.includes(keyword))).length;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "N/A";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function stepStatus(status: PipelineStatus | null, name: string): string {
  const step = status?.steps?.find(item => item.name === name);
  if (!step) return "missing";
  return `${step.status}${typeof step.durationSec === "number" ? ` (${step.durationSec}s)` : ""}`;
}

function main() {
  const date = todayJst();
  const pipeline = readJson<PipelineStatus>("reports/pipeline_status_latest.json");
  const scorePath = latestScoreFile();
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
  lines.push(`- failedSteps: ${pipeline?.failedSteps?.trim() || "none"}`);
  lines.push(`- scan:world: ${stepStatus(pipeline, "scan:world")}`);
  lines.push(`- daily: ${stepStatus(pipeline, "daily")}`);
  lines.push(`- learn:primary: ${stepStatus(pipeline, "learn:primary")}`);
  lines.push(`- maintain:data:write: ${stepStatus(pipeline, "maintain:data:write")}`);
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

  lines.push("## 運用判断");
  lines.push("");
  if (!pipeline) lines.push("- 🛑 pipeline_status_latest.json がありません。run-daily.sh の実行状態を確認してください。");
  if (pipeline?.status && !["completed", "completed_with_warnings"].includes(pipeline.status)) lines.push(`- 🛑 pipeline status が ${pipeline.status} です。daily の成否を確認してください。`);
  if (total === 0) lines.push("- 🛑 scores JSON がありません。daily がレポートを生成できていない可能性があります。");
  if (total > 0 && dataMissing / total > 0.5) lines.push("- ⚠️ dataQuality missing が多いです。J-Quants設定やmock運用状態を確認してください。");
  if (total > 0 && marketContextCount / total < 0.5) lines.push("- ⚠️ marketContext が少ないです。株価・ベンチマーク取得を確認してください。");
  if (total > 0 && primaryReviewCount / total < 0.8) lines.push("- ⚠️ primaryDisclosureReview が少ないです。一次情報レビューの接続を確認してください。");
  if (fetchErrors > 0) lines.push("- ⚠️ TDnet/EDINET取得エラーがあります。外部サイト・API状態を確認してください。");
  if (primaryMissing > primaryConfirmed + primaryCaution + primaryBlock && total > 0) lines.push("- 🔎 一次情報missingが多いです。ニュース材料は公式IR/TDnet/EDINETの裏取り前提で扱ってください。");
  if (lines.at(-1) === "## 運用判断") lines.push("- ✅ 大きな情報源異常は検出していません。継続してログを貯めてください。");
  lines.push("");

  lines.push("---");
  lines.push(`*alpha-pon source health | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", `source_health_${date}.md`), lines.join("\n"), "utf-8");
  writeFileSync(join("reports", "source_health_latest.md"), lines.join("\n"), "utf-8");
  console.log(`レポート: reports/source_health_${date}.md`);
}

main();
