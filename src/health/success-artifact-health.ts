import { existsSync, lstatSync, statSync } from "fs";

function tokyoDateFromMtime(mtime: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(mtime);
  const byType = new Map(parts.map(part => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

export function isUsableFreshSuccessArtifact(path: string, today: string, nowMs = Date.now()): boolean {
  if (!existsSync(path)) return false;
  try {
    if (lstatSync(path).isSymbolicLink()) return false;
    const stats = statSync(path);
    return stats.isFile()
      && stats.nlink === 1
      && stats.size > 0
      && stats.mtimeMs <= nowMs
      && tokyoDateFromMtime(stats.mtime) === today;
  } catch {
    return false;
  }
}
