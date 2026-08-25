import type { OpsOutcomeLike } from "./ops-dashboard.js";

export interface OpsOutcomesInput {
  outcomes: OpsOutcomeLike[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalCanonicalString(value: unknown): value is string | null | undefined {
  return value == null || (typeof value === "string" && value.trim().length > 0 && value === value.trim());
}

function isOptionalEnum(value: unknown, allowed: readonly string[]): boolean {
  return value == null || (typeof value === "string" && allowed.includes(value));
}

const REVIEW_HORIZONS = ["1d", "1w", "1m", "3m"] as const;
const OUTCOME_RESULTS = ["hit", "miss", "too_early", "invalidated", "unknown"] as const;
const DATA_AVAILABILITY = ["ok", "partial", "missing"] as const;

function invalidOutcomesInput(): OpsOutcomesInput {
  return {
    outcomes: [
      {
        code: "invalid_input",
        reviewHorizon: "invalid_input",
        result: "unevaluated",
        dataAvailability: "unknown",
      },
    ],
  };
}

export function normalizeOpsOutcomesInput(value: unknown): OpsOutcomesInput | null {
  if (value == null) return null;
  if (!isRecord(value) || !Array.isArray(value.outcomes)) return invalidOutcomesInput();

  for (const outcome of value.outcomes) {
    if (!isRecord(outcome)) return invalidOutcomesInput();
    const hasOutcomeEvidence = outcome.code != null
      || outcome.reviewHorizon != null
      || outcome.result != null
      || outcome.dataAvailability != null;
    if (!hasOutcomeEvidence) return invalidOutcomesInput();
    if (
      !isOptionalCanonicalString(outcome.code) ||
      !isOptionalEnum(outcome.reviewHorizon, REVIEW_HORIZONS) ||
      !isOptionalEnum(outcome.result, OUTCOME_RESULTS) ||
      !isOptionalEnum(outcome.dataAvailability, DATA_AVAILABILITY)
    ) {
      return invalidOutcomesInput();
    }
  }

  return { outcomes: value.outcomes as OpsOutcomeLike[] };
}
