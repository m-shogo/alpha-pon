import { existsSync, readFileSync } from "node:fs";
import { normalizeSourceHealthObject } from "./source-health-input.js";

export function readProposalPipelineStatus<T extends object>(path: string): T | null {
  if (!existsSync(path)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }

  return normalizeSourceHealthObject<T>(raw).value;
}
