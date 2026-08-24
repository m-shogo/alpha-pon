import { existsSync, readFileSync } from "node:fs";
import { normalizeSourceHealthObject } from "./source-health-input.js";

function hasSafePipelineSteps(value: Record<string, unknown>): boolean {
  if (value.steps === undefined) return true;
  return Array.isArray(value.steps)
    && value.steps.every(step => typeof step === "object" && step !== null && !Array.isArray(step));
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
