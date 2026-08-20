import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { sourceHealthScorePath } from "./source-health-history-path.js";
import { inspectSourceHealthReportFile } from "./source-health-report-file.js";

const HISTORY_PATH = "data/source_health_history.jsonl";
const MAX_LINES = 1000;

type SourceHealthHistoryRow = {
  date: string;
  reports: Record<string, ReturnType<typeof inspectSourceHealthReportFile>>;
};

function historyRowDate(line: string): string | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (
      typeof parsed === "object"
      && parsed !== null
      && !Array.isArray(parsed)
      && typeof (parsed as { date?: unknown }).date === "string"
    ) {
      return (parsed as { date: string }).date;
    }
  } catch {
    // Preserve malformed historical lines for downstream read-only audit visibility.
  }
  return null;
}

function writeDailyHistoryRow(row: SourceHealthHistoryRow): void {
  const existingLines = existsSync(HISTORY_PATH)
    ? readFileSync(HISTORY_PATH, "utf-8")
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
    : [];

  const seenDates = new Set<string>();
  const dedupedReversed: string[] = [];
  for (let index = existingLines.length - 1; index >= 0; index -= 1) {
    const line = existingLines[index];
    const date = historyRowDate(line);
    if (date === row.date) continue;
    if (date !== null) {
      if (seenDates.has(date)) continue;
      seenDates.add(date);
    }
    dedupedReversed.push(line);
  }

  const nextLines = dedupedReversed.reverse();
  nextLines.push(JSON.stringify(row));
  const compacted = nextLines.slice(-MAX_LINES);
  writeFileSync(HISTORY_PATH, `${compacted.join("\n")}\n`, "utf-8");
}

function main() {
  const date = todayJst();
  const scorePath = sourceHealthScorePath(date);
  mkdirSync("data", { recursive: true });

  const row: SourceHealthHistoryRow = {
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

  writeDailyHistoryRow(row);
  console.log(`source health history recorded: ${HISTORY_PATH}`);
}

main();