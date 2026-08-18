import { existsSync, readFileSync, statSync } from "node:fs";

export type ListingReadinessFileStatus = "ok" | "warning" | "missing";

export function listingReadinessFileStatus(path: string): ListingReadinessFileStatus {
  if (!existsSync(path)) return "missing";
  try {
    if (!statSync(path).isFile()) return "warning";
    return readFileSync(path, "utf-8").trim().length > 0 ? "ok" : "warning";
  } catch {
    return "warning";
  }
}
