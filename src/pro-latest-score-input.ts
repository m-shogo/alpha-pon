import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { addDaysJst, todayJst } from "./date.js";

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

export type LatestProScoreLoad<T> = {
  rows: T[];
  sourceFile: string | null;
};

export function readLatestProScores<T>(reportsDir = "reports", asOf = todayJst()): LatestProScoreLoad<T> {
  if (!existsSync(reportsDir)) return { rows: [], sourceFile: null };

  const scoreFiles = readdirSync(reportsDir)
    .filter((file) => /^scores_\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  for (const file of scoreFiles) {
    const date = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1] ?? "";
    if (!isRealJstDate(date)) {
      throw new Error(`${file}: score snapshot filename must contain a real Gregorian date`);
    }
    if (date > asOf) {
      throw new Error(`${file}: score snapshot filename must not be later than pro-score as-of date ${asOf}`);
    }
  }

  const latest = scoreFiles.at(-1);
  if (!latest) return { rows: [], sourceFile: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(reportsDir, latest), "utf-8")) as unknown;
  } catch {
    throw new Error(`${latest}: score snapshot must contain valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${latest}: score snapshot root must be an array`);
  }

  return { rows: parsed as T[], sourceFile: latest };
}
