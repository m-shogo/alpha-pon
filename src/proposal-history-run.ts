import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { todayJst } from "./date.js";
import { findProposalStreaks, recordProposalHistory } from "./proposal-history.js";

type Proposal = {
  priority: "S" | "A" | "B" | "Hold";
  title: string;
  reason?: string;
  action?: string;
};

function loadProposals(): Proposal[] {
  if (!existsSync("reports/proposals_latest.json")) return [];
  try {
    const value = JSON.parse(readFileSync("reports/proposals_latest.json", "utf-8")) as unknown;
    return Array.isArray(value) ? value as Proposal[] : [];
  } catch {
    return [];
  }
}

const date = todayJst();
const proposals = loadProposals();
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
console.log(`proposal streaks: ${streaks.length}`);
