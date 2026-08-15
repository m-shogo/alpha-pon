import type { WorldEventImpactReview } from "./world-impact.js";

export function parseWorldImpactLatestSnapshot(raw: string): WorldEventImpactReview[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`World Impact latest snapshot is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("World Impact latest snapshot root must be an array");
  }

  parsed.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`World Impact latest snapshot row ${index + 1} must be an object`);
    }
    const reviewKey = (item as { reviewKey?: unknown }).reviewKey;
    if (typeof reviewKey !== "string" || reviewKey.trim() === "") {
      throw new Error(`World Impact latest snapshot row ${index + 1} requires reviewKey`);
    }
  });

  return parsed as WorldEventImpactReview[];
}
