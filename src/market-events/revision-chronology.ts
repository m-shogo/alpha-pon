import { compareExplicitIso8601Instants } from "../research/iso-instant.js";

export type MarketEventRevisionChronology = {
  observedAt: string;
  publishedAt: string | null;
  firstExecutableAt?: string | null;
};

export function validateMarketEventRevisionChronology(revision: MarketEventRevisionChronology): void {
  if (
    revision.publishedAt !== null
    && compareExplicitIso8601Instants(
      revision.publishedAt,
      revision.observedAt,
      "publishedAt",
      "observedAt",
    ) > 0
  ) {
    throw new Error("publishedAt must be on or before observedAt");
  }

  if (
    revision.firstExecutableAt !== undefined
    && revision.firstExecutableAt !== null
    && compareExplicitIso8601Instants(
      revision.firstExecutableAt,
      revision.observedAt,
      "firstExecutableAt",
      "observedAt",
    ) < 0
  ) {
    throw new Error("firstExecutableAt must be on or after observedAt");
  }
}
