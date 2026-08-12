import { parseExplicitIso8601Instant } from "./research/iso-instant.js";

export function jstDateFromExplicitInstant(value: string, label = "timestamp"): string {
  const instantMs = parseExplicitIso8601Instant(value, label);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instantMs));
}

export function normalizeOpsAlphaGeneratedAt<T extends { generatedAt?: string | null }>(
  input: T | null,
): T | null {
  if (!input || input.generatedAt == null) return input;
  return {
    ...input,
    generatedAt: jstDateFromExplicitInstant(input.generatedAt, "alphaData.generatedAt"),
  };
}
