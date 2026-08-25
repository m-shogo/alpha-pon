import { existsSync, readFileSync } from "node:fs";
import { normalizeSourceHealthObject } from "./source-health-input.js";

const PIPELINE_CRITICALITIES = new Set(["critical", "noncritical"]);
const PIPELINE_STEP_STATUSES = new Set(["ok", "failed", "skipped"]);

function hasCanonicalExitCode(status: string, code: unknown): boolean {
  if (typeof code !== "number" || !Number.isSafeInteger(code) || code < 0 || code > 255) return false;
  return status === "failed" ? code > 0 : code === 0;
}

function isSafePipelineStep(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const step = value as Record<string, unknown>;
  return typeof step.name === "string"
    && step.name.length > 0
    && step.name.trim() === step.name
    && typeof step.criticality === "string"
    && PIPELINE_CRITICALITIES.has(step.criticality)
    && typeof step.status === "string"
    && PIPELINE_STEP_STATUSES.has(step.status)
    && hasCanonicalExitCode(step.status, step.code);
}

function hasSafePipelineSteps(value: Record<string, unknown>): boolean {
  if (value.steps === undefined) return true;
  return Array.isArray(value.steps) && value.steps.every(isSafePipelineStep);
}

export function readProposalPipelineStatus<T extends object>(path: string): T | null {
  if (!existsSync(path)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }

  const normalized = normalizeSourceHealthObject<T>(raw);
  if (!normalized.value || !hasSafePipelineSteps(normalized.value as Record<string, unknown>)) return null;
  return normalized.value;
}
