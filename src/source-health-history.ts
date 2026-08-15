import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { sourceHealthScorePath } from "./source-health-history-path.js";

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

function has(path: string): boolean {
  return existsSync(path);
}

function readSize(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf-8").length;
}

function main() {
  const date = todayJst();
  const scorePath = sourceHealthScorePath(date);
  mkdirSync("data", { recursive: true });

  const row = {
    date,
    reports: {
      sourceHealth: { exists: has("reports/source_health_latest.md"), size: readSize("reports/source_health_latest.md") },
      daily: { exists: has("reports/latest.md"), size: readSize("reports/latest.md") },
      scores: { exists: has(scorePath), size: readSize(scorePath) },
      proposals: { exists: has("reports/proposals_latest.md"), size: readSize("reports/proposals_latest.md") },
      stockPro: { exists: has("reports/stock_pro_agent_latest.md"), size: readSize("reports/stock_pro_agent_latest.md") },
      regime: { exists: has("reports/regime_scenarios_latest.md"), size: readSize("reports/regime_scenarios_latest.md") },
    },
  };

  appendFileSync(HISTORY_PATH, `${JSON.stringify(row)}\n`, "utf-8");
  compactHistory();
  console.log(`source health history recorded: ${HISTORY_PATH}`);
}

main();