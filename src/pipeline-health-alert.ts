import { existsSync, readFileSync } from "fs";
import { todayJst } from "./date.js";
import { sendPipelineSummaryNotification } from "./notify.js";
import { pipelineHealthConfidenceAtDate, shouldNotifyPipelineHealth } from "./pipeline-health-alert-input.js";

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function extractSection(text: string, title: string, maxLines = 8): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex(line => line.trim() === `## ${title}`);
  if (start < 0) return [];
  const result: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    const trimmed = line.trim();
    if (trimmed && trimmed !== "-") result.push(trimmed);
    if (result.length >= maxLines) break;
  }
  return result;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.ALPHA_PON_NOTIFY_DRY_RUN === "1";
  const report = readText("reports/pipeline_health_summary_latest.md");
  const confidence = pipelineHealthConfidenceAtDate(report, todayJst());

  if (!shouldNotifyPipelineHealth(confidence)) {
    console.log("pipeline health alert: normal, no notification");
    return;
  }

  const criticalSignals = extractSection(report, "critical signals");
  const body = [
    `alpha-pon pipeline health: ${confidence}`,
    "データ取得やレポート生成に注意があります。銘柄考察よりsource/pipeline確認を優先してください。",
    "",
    "critical signals:",
    ...(criticalSignals.length > 0 ? criticalSignals : ["- N/A"]),
  ].join("\n");

  if (dryRun) {
    console.log(`pipeline health alert dry-run: ${confidence}`);
    console.log(body);
    return;
  }

  await sendPipelineSummaryNotification(body);
  console.log(`pipeline health alert sent: ${confidence}`);
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`pipeline health alert error: ${message}`);
});
