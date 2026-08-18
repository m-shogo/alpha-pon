import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addDaysJst, todayJst } from "./date.js";

function isRealJstDate(value: string): boolean {
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

export function latestValuationScoreFile(
  reportsDir = "reports",
  asOf = todayJst(),
): string | null {
  if (!existsSync(reportsDir)) return null;
  const files = readdirSync(reportsDir)
    .flatMap((file) => {
      const match = /^scores_(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
      if (!match || !isRealJstDate(match[1]) || match[1] > asOf) return [];
      return [{ file, date: match[1] }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = files.at(-1);
  return latest ? join(reportsDir, latest.file) : null;
}
