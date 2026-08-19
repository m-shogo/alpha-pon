import { addDaysJst } from "./date.js";
import type { OpsPipelineStatusLike } from "./ops-dashboard.js";

const INVALID_PIPELINE_INPUT = "invalid_pipeline_status_input";
const PIPELINE_STATUSES = new Set([
  "ok",
  "partial_failed",
  "running",
  "skipped_locked",
  "failed",
  "completed_with_warnings",
  "completed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanonicalJstDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function invalidPipelineStatus(): OpsPipelineStatusLike {
  return {
    status: "failed",
    failedSteps: INVALID_PIPELINE_INPUT,
    steps: [],
  };
}

export function normalizeOpsPipelineStatusInput(value: unknown): OpsPipelineStatusLike | null {
  if (value == null) return null;
  if (!isRecord(value)) return invalidPipelineStatus();

  if (typeof value.status !== "string" || !PIPELINE_STATUSES.has(value.status)) {
    return invalidPipelineStatus();
  }
  if (value.date !== undefined && !isCanonicalJstDate(value.date)) {
    return invalidPipelineStatus();
  }

  let failedSteps: string | undefined;
  if (value.failedSteps !== undefined) {
    if (typeof value.failedSteps === "string") {
      failedSteps = value.failedSteps;
    } else if (Array.isArray(value.failedSteps)) {
      if (!value.failedSteps.every(step => typeof step === "string" && step.trim().length > 0)) {
        return invalidPipelineStatus();
      }
      failedSteps = value.failedSteps.join(",");
    } else {
      return invalidPipelineStatus();
    }
  }

  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps)) return invalidPipelineStatus();
    for (const step of value.steps) {
      if (!isRecord(step)) return invalidPipelineStatus();
      if (step.name !== undefined && typeof step.name !== "string") return invalidPipelineStatus();
      if (step.status !== undefined && typeof step.status !== "string") return invalidPipelineStatus();
    }
  }

  if (value.status === "partial_failed") {
    const hasFailedSteps = typeof failedSteps === "string" && failedSteps.trim().length > 0;
    const hasFailedStepRecord = Array.isArray(value.steps) && value.steps.some(step => {
      if (!isRecord(step) || typeof step.status !== "string") return false;
      return step.status !== "ok" && step.status !== "skipped";
    });
    if (!hasFailedSteps && !hasFailedStepRecord) return invalidPipelineStatus();
  }

  return {
    ...(value as OpsPipelineStatusLike),
    ...(failedSteps !== undefined ? { failedSteps } : {}),
  };
}
