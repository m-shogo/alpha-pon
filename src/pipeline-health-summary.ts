import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";

type SourceHealthRow = {
  date?: string;
  reports?: Record<string, { exists?: boolean; size?: number }>;
};

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
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
    .map(line => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((item): item is T => item !== null);
}

function missingReports(rows: SourceHealthRow[], limit: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const row of rows.slice(-limit)) {
    for (const [name, value] of Object.entries(row.reports ?? {})) {
      if (!value.exists || (value.size ?? 0) === 0) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function main() {
  const date = todayJst();
  const sourceHealthText = readText("reports/source_health_latest.md");
  const pipelineStatus = readJson("reports/pipeline_status_latest.json");
  const sourceRows = readJsonl<SourceHealthRow>("data/source_health_history.jsonl");
  const recentMissing = missingReports(sourceRows, 14);
  const criticalSignals: string[] = [];

  if (!sourceHealthText) criticalSignals.push("source_health_latest.md missing");
  if (!pipelineStatus) criticalSignals.push("pipeline_status_latest.json missing_or_invalid");
  for (const [name, count] of recentMissing) {
    if (count >= 3) criticalSignals.push(`${name} missing_or_empty ${count}/14`);
  }

  let confidence = "normal";
  if (criticalSignals.length >= 3) confidence = "low";
  else if (criticalSignals.length >= 1) confidence = "caution";

  const lines: string[] = [];
  lines.push("# alpha-pon pipeline health summary");
  lines.push("");
  lines.push(`date: ${date}`);
  lines.push("");
  lines.push("dailyの取得・生成状態を見て、その日のレポートをどの程度信用してよいか判断します。買い推奨ではありません。");
  lines.push("");
  lines.push("## confidence");
  lines.push("");
  lines.push(`- report confidence: ${confidence}`);
  lines.push(`- source_health_latest.md: ${sourceHealthText ? "ok" : "missing"}`);
  lines.push(`- pipeline_status_latest.json: ${pipelineStatus ? "ok" : "missing_or_invalid"}`);
  lines.push(`- source health history rows: ${sourceRows.length}`);
  lines.push("");
  lines.push("## critical signals");
  lines.push("");
  if (criticalSignals.length === 0) lines.push("- N/A");
  for (const signal of criticalSignals) lines.push(`- ${signal}`);
  lines.push("");
  lines.push("## recent missing reports");
  lines.push("");
  if (recentMissing.length === 0) lines.push("- N/A");
  for (const [name, count] of recentMissing.slice(0, 20)) lines.push(`- ${name}: ${count}/14`);
  lines.push("");
  lines.push("## rule");
  lines.push("- confidence=low の日は、銘柄考察よりデータ取得・source healthの修復を優先する");
  lines.push("- confidence=caution の日は、調査候補を増やさず、証拠不足/保留を優先する");
  lines.push("- daily本体が失敗した場合はcritical、それ以外の補助レポートはnoncriticalで継続する");
  lines.push("");
  lines.push("---");
  lines.push(`*alpha-pon pipeline health summary | ${date} | ※買い推奨ではありません*`);

  mkdirSync("reports", { recursive: true });
  writeFileSync(join("reports", "pipeline_health_summary_latest.md"), lines.join("\n"), "utf-8");
  console.log(`pipeline health summary: ${confidence}`);
}

main();
