import { readFileSync } from "node:fs";
import { todayJst } from "./date.js";
import { latestValuationScoreFile } from "./valuation-range-input.js";

export type ProposalScoreLoad<T> = {
  rows: T[];
  sourceFile: string | null;
};

export function readProposalScores<T>(
  reportsDir = "reports",
  asOf = todayJst(),
): ProposalScoreLoad<T> {
  const sourceFile = latestValuationScoreFile(reportsDir, asOf);
  if (!sourceFile) return { rows: [], sourceFile: null };

  try {
    const parsed = JSON.parse(readFileSync(sourceFile, "utf-8")) as unknown;
    return {
      rows: Array.isArray(parsed) ? parsed as T[] : [],
      sourceFile,
    };
  } catch {
    return { rows: [], sourceFile };
  }
}
