import { parseExplicitIso8601Instant } from "./iso-instant.js";
import type { PitPriceRecord } from "./price-store.js";

export type PriceRecordTimelineCode =
  | "invalid_timestamp"
  | "data_after_observation"
  | "retrieval_before_observation"
  | "execution_before_observation"
  | "execution_before_retrieval";

export type PriceRecordTimelineViolation = {
  code: PriceRecordTimelineCode;
  message: string;
};

type PriceTimelineRecord = Pick<
  PitPriceRecord,
  "dataAsOf" | "observedAt" | "retrievedAt" | "firstExecutableAt"
>;

type PriceTimelineField = keyof PriceTimelineRecord;

export function validatePriceRecordTimeline(
  record: PriceTimelineRecord,
): PriceRecordTimelineViolation[] {
  const violations: PriceRecordTimelineViolation[] = [];
  const timestamps = {} as Record<PriceTimelineField, number>;

  for (const field of ["dataAsOf", "observedAt", "retrievedAt", "firstExecutableAt"] as const) {
    try {
      timestamps[field] = parseExplicitIso8601Instant(record[field], field);
    } catch (cause) {
      violations.push({
        code: "invalid_timestamp",
        message: cause instanceof Error ? cause.message : `${field} must be a valid timestamp`,
      });
    }
  }
  if (violations.length > 0) return violations;

  if (timestamps.dataAsOf > timestamps.observedAt) {
    violations.push({
      code: "data_after_observation",
      message: "dataAsOf must be at or before observedAt",
    });
  }
  if (timestamps.retrievedAt < timestamps.observedAt) {
    violations.push({
      code: "retrieval_before_observation",
      message: "retrievedAt must be at or after observedAt",
    });
  }
  if (timestamps.firstExecutableAt < timestamps.observedAt) {
    violations.push({
      code: "execution_before_observation",
      message: "firstExecutableAt must be at or after observedAt",
    });
  }
  if (timestamps.firstExecutableAt < timestamps.retrievedAt) {
    violations.push({
      code: "execution_before_retrieval",
      message: "firstExecutableAt must be at or after retrievedAt",
    });
  }

  return violations;
}
