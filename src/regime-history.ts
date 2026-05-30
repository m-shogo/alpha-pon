import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { load } from "js-yaml";
import { todayJst } from "./date.js";

type CurrentRegime = {
  asOf?: string;
  mode?: string;
  summary?: string;
  activeRegimes?: Array<{
    id: string;
    level: string;
    why: string;
    watchCategories?: string[];
    caution?: string[];
  }>;
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
    asOf: config.asOf ?? date,
    mode: config.mode ?? "unknown",
    summary: config.summary ?? "",
    activeRegimes: (config.activeRegimes ?? []).map(item => ({
      id: item.id,
      level: item.level,
      why: item.why,
      watchCategories: item.watchCategories ?? [],
      caution: item.caution ?? [],
    })),
  };

  appendFileSync(HISTORY_PATH, `${JSON.stringify(row)}\n`, "utf-8");
  compactHistory();
  console.log(`regime history recorded: ${HISTORY_PATH}`);
}

main();
