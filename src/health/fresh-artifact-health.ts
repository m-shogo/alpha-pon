import { accessSync, constants, lstatSync } from "node:fs";

function tokyoDateFromDate(date: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(parts.map(part => [part.type, part.value]));
  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function isUsableFreshArtifact(path: string, todayJst: string): boolean {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size <= 0) return false;
    accessSync(path, constants.R_OK);
    return tokyoDateFromDate(stat.mtime) === todayJst;
  } catch {
    return false;
  }
}
