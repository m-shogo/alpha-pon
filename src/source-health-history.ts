import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { sourceHealthScorePath } from "./source-health-history-path.js";
import { inspectSourceHealthReportFile } from "./source-health-report-file.js";

const HISTORY_PATH = "data/source_health_history.jsonl";
const MAX_LINES = 1000;

function compactHistory(): void {
  if (!existsSync(HISTORY_PATH)) return;
  const lines = readFileSync(HISTORY_PATH, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length <= MAX_LINES) return;
  writeFileSync(HISTORY_PATH, `${lines.slice(-MAX_LINES).join("\n")}\n`, "utf-8");
}

function main() {
  const date = todayJst();
  const scorePath = sourceHealthScorePath(date);
  mkdirSync("data", { recursive: true });

  const row = {
    date,
    reports: {
      sourceHealth: inspectSourceHealthReportFile("reports/source_health_latest.md"),
      daily: inspectSourceHealthReportFile("reports/latest.md"),
      scores: inspectSourceHealthReportFile(scorePath),
      proposals: inspectSourceHealthReportFile("reports/proposals_latest.md"),
      stockPro: inspectSourceHealthReportFile("reports/stock_pro_agent_latest.md"),
      regime: inspectSourceHealthReportFile("reports/regime_scenarios_latest.md"),
    },
  };

  appendFileSync(HISTORY_PATH, `${JSON.stringify(row)}\n`, "utf-8");
  compactHistory();
  console.log(`source health history recorded: ${HISTORY_PATH}`);
}

main();
