import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export type PeriodicScoreLogEntry = {
  code: string;
  name: string;
  priority?: string;
  tags?: string[];
  rules?: string[];
  score: number;
  alertLevel: string;
  warnings?: string[];
  negativeReasons?: string[];
  createdAt: string;
  expertReview?: { finalVerdict: string; consensusScore: number };
  riskReview?: { decision: string; blockers: string[] };
};

export type PeriodicScoreInput = {
  entries: PeriodicScoreLogEntry[];
  invalidFiles: string[];
};

export function parsePeriodicScoreLog(raw: string): PeriodicScoreLogEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as PeriodicScoreLogEntry[] : null;
  } catch {
    return null;
  }
}

export function loadPeriodicScoreLogs(reportDir = "reports"): PeriodicScoreInput {
  if (!existsSync(reportDir)) return { entries: [], invalidFiles: [] };

  const entries: PeriodicScoreLogEntry[] = [];
  const invalidFiles: string[] = [];
  const files = readdirSync(reportDir)
    .filter(file => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(join(reportDir, file), "utf-8");
    } catch {
      invalidFiles.push(file);
      continue;
    }

    const parsed = parsePeriodicScoreLog(raw);
    if (!parsed) {
      invalidFiles.push(file);
      continue;
    }
    entries.push(...parsed);
  }

  return { entries, invalidFiles };
}
