import { mkdirSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { readRegimeHistoryLines, replaceRegimeHistory } from "./regime-history-file.js";
import {
  normalizeRegimeHistoryActiveRegimes,
  normalizeRegimeHistoryMode,
  normalizeRegimeHistorySummary,
  resolveRegimeHistoryAsOf,
} from "./regime-history-input.js";
import { readReadOnlyTextFile } from "./read-only-text-file.js";

type CurrentRegime = {
  asOf?: unknown;
  mode?: unknown;
  summary?: unknown;
  activeRegimes?: unknown;
};

type RegimeHistoryRow = {
  date: string;
  asOf: string;
  mode: string;
  summary: string;
  activeRegimes: ReturnType<typeof normalizeRegimeHistoryActiveRegimes>;
};

const HISTORY_PATH = "data/regime_history.jsonl";
const MAX_LINES = 1000;

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

function writeDailyHistoryRow(row: RegimeHistoryRow): void {
  const existingLines = readRegimeHistoryLines(HISTORY_PATH);

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
  replaceRegimeHistory(HISTORY_PATH, `${compacted.join("\n")}\n`);
}

function main() {
  const date = todayJst();
  const configText = readReadOnlyTextFile("config/current-regime.yml");
  const config = configText ? load(configText) as CurrentRegime : {};
  mkdirSync("data", { recursive: true });

  const row: RegimeHistoryRow = {
    date,
    asOf: resolveRegimeHistoryAsOf(config.asOf, date),
    mode: normalizeRegimeHistoryMode(config.mode),
    summary: normalizeRegimeHistorySummary(config.summary),
    activeRegimes: normalizeRegimeHistoryActiveRegimes(config.activeRegimes),
  };

  writeDailyHistoryRow(row);
  console.log(`regime history recorded: ${HISTORY_PATH}`);
}

main();