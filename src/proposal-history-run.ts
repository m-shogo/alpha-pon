import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { findProposalStreaks, recordProposalHistory } from "./proposal-history.js";
import { normalizeProposalHistoryInput } from "./proposal-history-input.js";

function loadProposals(): ReturnType<typeof normalizeProposalHistoryInput> {
  if (!existsSync("reports/proposals_latest.json")) {
    return { proposals: [], invalidRowCount: 0 };
  }
  try {
    return normalizeProposalHistoryInput(JSON.parse(readFileSync("reports/proposals_latest.json", "utf-8")) as unknown);
  } catch {
    return { proposals: [], invalidRowCount: 1 };
  }
}

const date = todayJst();
const { proposals, invalidRowCount } = loadProposals();
recordProposalHistory(date, proposals.map(item => ({
  date,
  priority: item.priority,
  title: item.title,
  reason: item.reason ?? "",
  action: item.action ?? "",
})));
const streaks = findProposalStreaks(date, 3);

mkdirSync("reports", { recursive: true });
writeFileSync(join("reports", "proposal_streaks_latest.json"), JSON.stringify(streaks, null, 2), "utf-8");
console.log(`proposal streaks: ${streaks.length}; invalid proposal rows: ${invalidRowCount}`);
