import type { OpsOutcomeLike } from "./ops-dashboard.js";

export interface OpsOutcomesInput {
  outcomes: OpsOutcomeLike[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

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
    if (
      !isOptionalString(outcome.code) ||
      !isOptionalString(outcome.reviewHorizon) ||
      !isOptionalString(outcome.result) ||
      !isOptionalString(outcome.dataAvailability)
    ) {
      return invalidOutcomesInput();
    }
  }

  return { outcomes: value.outcomes as OpsOutcomeLike[] };
}
