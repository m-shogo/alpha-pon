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
import type { AlertLevel, ScoreResult } from "./types.js";

const ALERT_ICONS: Record<AlertLevel, string> = {
  urgent: "🚨",
  daily: "📋",
  log: "📝",
  ignore: "➖",
};

const useMock = process.argv.includes("--mock") || process.env.USE_MOCK === "true";

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

async function main() {
  const today = todayJst();
  console.log(`\nalpha-pon 実行: ${today}${useMock ? " [モックデータ]" : ""}\n`);

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
      // フェッチャーの品質情報で上書き
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

  // 個別レポート（通知対象のみ）
  for (const result of results) {
    if (result.alertLevel === "ignore") continue;
    const content = generateReport(result);
    const filename = `${result.candidate.code}_${today}.md`;
    writeFileSync(join("reports", filename), content, "utf-8");
  }

  // サマリーレポート
  const summary = generateSummaryReport(results, today);
  writeFileSync(join("reports", "latest.md"), summary, "utf-8");

  // JSON記録（バックテスト用）
  const jsonLog = results.map(r => ({
    code: r.candidate.code,
    name: r.candidate.name,
    score: r.score,
    alertLevel: r.alertLevel,
    reasons: r.reasons,
    negativeReasons: r.negativeReasons,
    breakdown: r.breakdown,
    dataQuality: r.dataQuality,
    createdAt: r.createdAt,
  }));
  writeFileSync(
    join("reports", `scores_${today}.json`),
    JSON.stringify(jsonLog, null, 2),
    "utf-8"
  );

  // コンソール出力
  console.log("\n=== スコア結果 ===\n");
  for (const r of results) {
    const icon = ALERT_ICONS[r.alertLevel];
    const level = r.alertLevel.toUpperCase().padEnd(6);
    console.log(`${icon} [${level}] ${r.candidate.code} ${r.candidate.name}: ${r.score}点`);
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

  // 重複通知抑制
  const { notifiable, suppressed } = filterSuppressed(
    results.filter(r => r.alertLevel !== "ignore" && r.alertLevel !== "log"),
    sameCandidateDays,
    scoreImprovementThreshold
  );

  if (suppressed.length > 0) {
    console.log(`\n重複抑制: ${suppressed.map(r => r.candidate.code).join(", ")}`);
  }

  // 通知送信
  const urgentNotifiable = notifiable.filter(r => r.alertLevel === "urgent");
  if (urgentNotifiable.length > 0) {
    console.log("\n通知送信中...");
    await sendUrgentNotifications(urgentNotifiable);
  }

  await sendDailySummary(notifiable, today);
  notifiable.forEach(r => recordNotification(r));
}

main().catch(err => {
  console.error("エラー:", err);
  process.exit(1);
});
