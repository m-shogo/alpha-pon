import { compareExplicitIso8601Instants } from "./iso-instant.js";

export function assertFoundationStructuralStatusGeneratedAtCoversCutoff(
  generatedAt: string,
  informationCutoff: string,
): void {
  if (compareExplicitIso8601Instants(
    generatedAt,
    informationCutoff,
    "generatedAt",
    "informationCutoff",
  ) < 0) {
    throw new Error("generatedAt must be at or after informationCutoff");
  }
}
