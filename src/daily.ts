import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { loadWatchlist, loadRules, loadThemes } from "./config.js";
import { scoreCandidate } from "./score/index.js";
import { fetchCandidateData } from "./fetcher/index.js";
import { generateReport, generateSummaryReport } from "./report.js";
import { sendUrgentNotifications, sendDailySummary } from "./notify.js";
import { filterSuppressed, recordNotification } from "./history.js";
import { todayJst } from "./date.js";
import { validateWatchlist } from "./validation.js";
import { saveAnalogyPredictionDb, saveAnalogyUsageDb } from "./analysis/analogy-db.js";
import type { AlertLevel, ScoreResult } from "./types.js";

const ALERT_ICONS: Record<AlertLevel, string> = {
  urgent: "🚨",
  daily: "📋",
  log: "📝",
  ignore: "➖",
};

type NotifyMode = "urgent_only" | "summary" | "off";

const useMock = process.argv.includes("--mock") || process.env.USE_MOCK === "true";
const notifyMode = (process.env.NOTIFY_MODE ?? "urgent_only") as NotifyMode;

function downgradeUnsafeAlert(result: ScoreResult): void {
  if (result.dataQuality !== "ok" && (result.alertLevel === "urgent" || result.alertLevel === "daily")) {
    result.warnings.push(`データ品質が${result.dataQuality}のため通知対象からログ扱いに変更`);
    result.alertLevel = "log";
  }

  if (result.candidate.rules.includes("earnings_drop") && result.alertLevel === "urgent") {
    result.warnings.push("earnings_dropは決算日特定が未実装のため即通知から朝まとめに変更");
    result.alertLevel = "daily";
  }
}

function isReviewSafeForNotification(result: ScoreResult): boolean {
  return (
    result.riskReview?.decision !== "reject" &&
    result.hypeRisk?.level !== "high" &&
    result.expertReview?.finalVerdict !== "block"
  );
}

async function main() {
  const today = todayJst();
  console.log(`\nalpha-pon 実行: ${today}${useMock ? " [モックデータ]" : ""}\n`);
  console.log(`通知モード: ${notifyMode}\n`);

  const watchlist = loadWatchlist();
  const validationErrors = validateWatchlist(watchlist);
  if (validationErrors.length > 0) {
    console.error("watchlist.yml に問題があります:");
    validationErrors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
  }

  const rules = loadRules();
  const themes = loadThemes();
  const { alertThresholds } = rules.scoring;
  const { sameCandidateDays, scoreImprovementThreshold } = rules.alertSuppression;

  const activeSymbols = watchlist.symbols.filter(
    s => s.status !== "ignore" && s.status !== "expired"
  );

  console.log(`対象銘柄: ${activeSymbols.length}件\n`);

  const results: ScoreResult[] = [];

  for (const candidate of activeSymbols) {
    process.stdout.write(`  ${candidate.code} ${candidate.name} ... `);
    try {
      const { data, dataQuality, warnings } = await fetchCandidateData(candidate, useMock);
      const result = scoreCandidate(candidate, data, themes, alertThresholds);
      result.dataQuality = dataQuality;
      result.warnings.push(...warnings);
      downgradeUnsafeAlert(result);
      results.push(result);
      console.log(`${result.score}点`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`失敗 (${message})`);
    }
  }

  results.sort((a, b) => b.score - a.score);

  mkdirSync("reports", { recursive: true });

  for (const result of results) {
    if (result.alertLevel === "ignore") continue;
    const content = generateReport(result);
    const filename = `${result.candidate.code}_${today}.md`;
    writeFileSync(join("reports", filename), content, "utf-8");
  }

  const summary = generateSummaryReport(results, today);
  writeFileSync(join("reports", "latest.md"), summary, "utf-8");
  saveAnalogyUsageDb(results, today);
  saveAnalogyPredictionDb(results, today);

  const jsonLog = results.map(r => ({
    code: r.candidate.code,
    name: r.candidate.name,
    priority: r.candidate.priority,
    status: r.candidate.status,
    tags: r.candidate.tags,
    rules: r.candidate.rules,
    score: r.score,
    alertLevel: r.alertLevel,
    reasons: r.reasons,
    negativeReasons: r.negativeReasons,
    warnings: r.warnings,
    breakdown: r.breakdown,
    dataQuality: r.dataQuality,
    marketContext: r.marketContext,
    financialQuality: r.financialQuality,
    hypeRisk: r.hypeRisk,
    riskReview: r.riskReview,
    expertReview: r.expertReview,
    hypothesisMap: r.hypothesisMap,
    createdAt: r.createdAt,
  }));
  writeFileSync(
    join("reports", `scores_${today}.json`),
    JSON.stringify(jsonLog, null, 2),
    "utf-8"
  );

  console.log("\n=== スコア結果 ===\n");
  for (const r of results) {
    const icon = ALERT_ICONS[r.alertLevel];
    const level = r.alertLevel.toUpperCase().padEnd(6);
    const review = r.riskReview?.decision ? ` / review:${r.riskReview.decision}` : "";
    const expert = r.expertReview?.finalVerdict ? ` / expert:${r.expertReview.finalVerdict}` : "";
    const hypothesis = r.hypothesisMap ? ` / hypotheses:${r.hypothesisMap.clusters.length}` : "";
    console.log(`${icon} [${level}] ${r.candidate.code} ${r.candidate.name}: ${r.score}点${review}${expert}${hypothesis}`);
    if (r.reasons.length > 0) {
      console.log(`        └ ${r.reasons[0]}`);
    }
    if (r.warnings.length > 0) {
      console.log(`        ⚠️  ${r.warnings[0]}`);
    }
  }

  const urgentCount = results.filter(r => r.alertLevel === "urgent").length;
  const dailyCount = results.filter(r => r.alertLevel === "daily").length;

  console.log(`\n即通知: ${urgentCount}件 / 朝まとめ: ${dailyCount}件`);
  console.log(`レポート: reports/latest.md`);
  console.log(`類推DB: data/analogy_usage/${today}.jsonl`);
  console.log(`予想DB: data/analogy_predictions/${today}.jsonl`);

  const { notifiable, suppressed } = filterSuppressed(
    results.filter(r => r.alertLevel !== "ignore" && r.alertLevel !== "log" && isReviewSafeForNotification(r)),
    sameCandidateDays,
    scoreImprovementThreshold
  );

  if (suppressed.length > 0) {
    console.log(`\n重複抑制: ${suppressed.map(r => r.candidate.code).join(", ")}`);
  }

  if (notifyMode === "off") {
    console.log("\n通知OFF: レポート生成のみ");
    return;
  }

  const urgentNotifiable = notifiable.filter(r => r.alertLevel === "urgent");
  if (urgentNotifiable.length > 0) {
    console.log("\n重要通知送信中...");
    await sendUrgentNotifications(urgentNotifiable);
  }

  if (notifyMode === "summary") {
    await sendDailySummary(notifiable, today);
  }

  notifiable.forEach(r => recordNotification(r));
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
