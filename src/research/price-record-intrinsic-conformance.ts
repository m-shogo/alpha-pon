import { validatePriceRecord, type PitPriceRecord } from "./price-store.js";
import { validatePriceRecordTimeline } from "./price-record-timeline.js";
import type { JsonSchema } from "./schema.js";

export type PriceRecordIntrinsicViolation = {
  code: string;
  message: string;
};

// Upper layers already receive a typed PriceRecord and independently verify its
// content hash. An empty JSON Schema intentionally lets the canonical Price Store
// semantic validator run without requiring callers to load the schema from disk.
const PERMISSIVE_PRICE_SCHEMA = {} as JsonSchema;

export function validatePriceRecordIntrinsicConformance(
  record: PitPriceRecord,
): PriceRecordIntrinsicViolation[] {
  const timeline = validatePriceRecordTimeline(record);
  if (timeline.some((violation) => violation.code === "invalid_timestamp")) {
    return timeline;
  }

  const observedMs = Date.parse(record.observedAt);
  const retrievedMs = Date.parse(record.retrievedAt);
  const validationNow = new Date(Math.max(observedMs, retrievedMs));

  try {
    return validatePriceRecord(record, PERMISSIVE_PRICE_SCHEMA, validationNow)
      .filter((item) => item.severity === "error")
      .filter((item) => item.code !== "future_observation" && item.code !== "future_retrieval")
      .map((item) => ({ code: item.code, message: item.message }));
  } catch (cause) {
    return [{
      code: "intrinsic_validation_failure",
      message: cause instanceof Error ? cause.message : String(cause),
    }];
  }
}
