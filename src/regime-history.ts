import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";
import { normalizeRegimeHistoryActiveRegimes, resolveRegimeHistoryAsOf } from "./regime-history-input.js";

type CurrentRegime = {
  asOf?: string;
  mode?: string;
  summary?: string;
  activeRegimes?: unknown;
};

const HISTORY_PATH = "data/regime_history.jsonl";
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
  const config = load(readFileSync("config/current-regime.yml", "utf-8")) as CurrentRegime;
  mkdirSync("data", { recursive: true });

  const row = {
    date,
    asOf: resolveRegimeHistoryAsOf(config.asOf, date),
    mode: config.mode ?? "unknown",
    summary: config.summary ?? "",
    activeRegimes: normalizeRegimeHistoryActiveRegimes(config.activeRegimes),
  };

  appendFileSync(HISTORY_PATH, `${JSON.stringify(row)}\n`, "utf-8");
  compactHistory();
  console.log(`regime history recorded: ${HISTORY_PATH}`);
}

main();
