import {
  compareExplicitIso8601Instants,
  parseExplicitIso8601Instant,
} from "./research/iso-instant.js";
import { isValidDate } from "./research/schema.js";

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
  nowInstant = new Date().toISOString(),
): T | null {
  if (!input || input.generatedAt == null) return input;
  if (isValidDate(input.generatedAt)) return input;
  if (
    compareExplicitIso8601Instants(
      input.generatedAt,
      nowInstant,
      "alphaData.generatedAt",
      "ops dashboard current instant",
    ) > 0
  ) {
    throw new Error("alphaData.generatedAt must not be in the future");
  }
  return {
    ...input,
    generatedAt: jstDateFromExplicitInstant(input.generatedAt, "alphaData.generatedAt"),
  };
}
