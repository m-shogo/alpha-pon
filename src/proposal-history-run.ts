import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { findProposalStreaks, recordProposalHistory } from "./proposal-history.js";
import { normalizeProposalHistoryInput } from "./proposal-history-input.js";
import { readReadOnlyJsonArrayFile } from "./read-only-json-file.js";

function loadProposals(): ReturnType<typeof normalizeProposalHistoryInput> {
  const loaded = readReadOnlyJsonArrayFile<unknown>("reports/proposals_latest.json");
  if (loaded.missing) {
    return { proposals: [], invalidRowCount: 0 };
  }
  if (loaded.parseError || loaded.invalidRoot) {
    return { proposals: [], invalidRowCount: 1 };
  }
  return normalizeProposalHistoryInput(loaded.rows);
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
