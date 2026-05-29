import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { AlertHistory, ScoreResult } from "./types.js";

const HISTORY_DIR = "data";
const HISTORY_FILE = join(HISTORY_DIR, "alert-history.json");

function loadHistory(): Record<string, AlertHistory> {
  if (!existsSync(HISTORY_FILE)) return {};
  try {
    const raw = readFileSync(HISTORY_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, AlertHistory>;
  } catch {
    return {};
  }
}

function saveHistory(history: Record<string, AlertHistory>): void {
  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.floor((a - b) / (1000 * 60 * 60 * 24)));
}

export function shouldSuppress(
  result: ScoreResult,
  suppressionDays: number,
  improvementThreshold: number
): boolean {
  if (result.alertLevel === "ignore" || result.alertLevel === "log") return false;

  const history = loadHistory();
  const prev = history[result.candidate.code];
  if (!prev) return false;

  const days = daysBetween(result.createdAt, prev.lastNotifiedAt);
  const scoreImproved = result.score - prev.lastScore >= improvementThreshold;

  return days <= suppressionDays && !scoreImproved;
}

export function recordNotification(result: ScoreResult): void {
  const history = loadHistory();
  history[result.candidate.code] = {
    code: result.candidate.code,
    lastNotifiedAt: result.createdAt,
    lastScore: result.score,
    lastReasons: result.reasons,
  };
  saveHistory(history);
}

export function filterSuppressed(
  results: ScoreResult[],
  suppressionDays: number,
  improvementThreshold: number
): { notifiable: ScoreResult[]; suppressed: ScoreResult[] } {
  const notifiable: ScoreResult[] = [];
  const suppressed: ScoreResult[] = [];

  for (const r of results) {
    if (shouldSuppress(r, suppressionDays, improvementThreshold)) {
      suppressed.push(r);
    } else {
      notifiable.push(r);
    }
  }

  return { notifiable, suppressed };
}
