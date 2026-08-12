import { compareExplicitIso8601Instants } from "./iso-instant.js";

export function isFutureResearchLogInstant(value: string, nowIso: string): boolean {
  return compareExplicitIso8601Instants(
    value,
    nowIso,
    "research-log.at",
    "now",
  ) > 0;
}
