import { existsSync, lstatSync, readFileSync } from "node:fs";

export type ListingReadinessFileStatus = "ok" | "warning" | "missing";

export function listingReadinessFileStatus(path: string): ListingReadinessFileStatus {
  if (!existsSync(path)) return "missing";
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1) return "warning";
    return readFileSync(path, "utf-8").trim().length > 0 ? "ok" : "warning";
  } catch {
    return "warning";
  }
}
