import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type ProposalHistoryPriority = "S" | "A" | "B" | "Hold";

export type ProposalHistoryItem = {
  date: string;
  priority: ProposalHistoryPriority;
  title: string;
  reason: string;
  action: string;
};

export type ProposalStreak = {
  priority: ProposalHistoryPriority;
  title: string;
  count: number;
  dates: string[];
};

const HISTORY_DIR = "data";
const HISTORY_PATH = join(HISTORY_DIR, "proposals_history.jsonl");
const MAX_HISTORY_LINES = 500;

function readHistory(): ProposalHistoryItem[] {
  if (!existsSync(HISTORY_PATH)) return [];
  return readFileSync(HISTORY_PATH, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as ProposalHistoryItem;
      } catch {
        return null;
      }
    })
    .filter((item): item is ProposalHistoryItem => !!item && !!item.date && !!item.title);
}

function compactHistory(): void {
  if (!existsSync(HISTORY_PATH)) return;
  const lines = readFileSync(HISTORY_PATH, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length <= MAX_HISTORY_LINES) return;
  writeFileSync(HISTORY_PATH, `${lines.slice(-MAX_HISTORY_LINES).join("\n")}\n`, "utf-8");
}

export function recordProposalHistory(date: string, proposals: ProposalHistoryItem[]): void {
  mkdirSync(HISTORY_DIR, { recursive: true });
  const history = readHistory();
  const existingKeys = new Set(history.map(item => `${item.date}:${item.priority}:${item.title}`));
  const lines = proposals
    .filter(proposal => proposal.priority !== "Hold")
    .filter(proposal => !existingKeys.has(`${date}:${proposal.priority}:${proposal.title}`))
    .map(proposal => JSON.stringify({
      date,
      priority: proposal.priority,
      title: proposal.title,
      reason: proposal.reason,
      action: proposal.action,
    }));

  if (lines.length > 0) {
    appendFileSync(HISTORY_PATH, `${lines.join("\n")}\n`, "utf-8");
    compactHistory();
  }
}

export function findProposalStreaks(date: string, minCount = 3): ProposalStreak[] {
  const history = readHistory();
  const byTitle = new Map<string, ProposalHistoryItem[]>();

  for (const item of history) {
    if (item.priority === "Hold") continue;
    const key = `${item.priority}:${item.title}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(item);
  }

  const streaks: ProposalStreak[] = [];
  for (const [key, items] of byTitle.entries()) {
    const uniqueDates = [...new Set(items.map(item => item.date))].sort();
    if (!uniqueDates.includes(date)) continue;
    if (uniqueDates.length < minCount) continue;

    const [priority, ...titleParts] = key.split(":");
    const title = titleParts.join(":");
    streaks.push({
      priority: priority as ProposalHistoryPriority,
      title,
      count: uniqueDates.length,
      dates: uniqueDates.slice(-10),
    });
  }

  return streaks.sort((a, b) => b.count - a.count);
}

export function proposalHistoryPath(): string {
  return HISTORY_PATH;
}
