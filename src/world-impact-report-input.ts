import { normalizeWorldImpactReview, type WorldEventImpactReview } from "./world-impact.js";

export type WorldImpactLatestSnapshotInput =
  | { present: false }
  | { present: true; parsed: unknown }
  | { present: true; parseError: true };

export type WorldImpactReportInputResolution = {
  reviews: WorldEventImpactReview[];
  latestSnapshotError: boolean;
};

export function resolveWorldImpactReportInput(
  latest: WorldImpactLatestSnapshotInput,
  jsonlReviews: WorldEventImpactReview[],
  today: string,
): WorldImpactReportInputResolution {
  if (!latest.present) {
    return { reviews: jsonlReviews, latestSnapshotError: false };
  }

  if ("parseError" in latest || !Array.isArray(latest.parsed)) {
    return { reviews: [], latestSnapshotError: true };
  }

  return {
    reviews: latest.parsed.map(item => normalizeWorldImpactReview(item, today)),
    latestSnapshotError: false,
  };
}
