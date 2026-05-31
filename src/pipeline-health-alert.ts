import { existsSync, readFileSync } from "fs";
import { sendPipelineSummaryNotification } from "./notify.js";

type Confidence = "normal" | "caution" | "low" | "unknown";

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function extractConfidence(text: string): Confidence {
  if (text.includes("report confidence: low")) return "low";
  if (text.includes("report confidence: caution")) return "caution";
  if (text.includes("report confidence: normal")) return "normal";
  return "unknown";
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
  const report = readText("reports/pipeline_health_summary_latest.md");
  const confidence = extractConfidence(report);

  if (confidence === "normal") {
    console.log("pipeline health alert: normal, no notification");
    return;
  }

  if (confidence === "unknown") {
    console.log("pipeline health alert: unknown, no notification");
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

  await sendPipelineSummaryNotification(body);
  console.log(`pipeline health alert sent: ${confidence}`);
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`pipeline health alert error: ${message}`);
});
