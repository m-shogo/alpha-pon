import { existsSync, readFileSync } from "fs";
import { readReadOnlyJsonObjectFile } from "./read-only-json-file.js";

export type MorningLitePipelineInput = {
  status: string;
  failedSteps: string[];
  warning: string | null;
};

export type MorningLiteDedupeCount = {
  count: number;
  warning: string | null;
};

export function readMorningLitePipelineInput(path: string): MorningLitePipelineInput {
  const loaded = readReadOnlyJsonObjectFile<Record<string, unknown>>(path);
  if (loaded.missing) return { status: "unknown", failedSteps: [], warning: null };
  if (loaded.parseError) return { status: "unknown", failedSteps: [], warning: `${path}: parse_error` };
  if (loaded.invalidRoot || !loaded.object) return { status: "unknown", failedSteps: [], warning: `${path}: invalid_root` };

  const status = typeof loaded.object.status === "string" && loaded.object.status.trim()
    ? loaded.object.status.trim()
    : "unknown";
  const complete = loaded.object.completeWrapperFailedSteps;
  const failed = loaded.object.failedSteps;
  const invalidComplete = complete !== undefined && (!Array.isArray(complete) || complete.some(item => typeof item !== "string"));
  const invalidFailed = failed !== undefined && typeof failed !== "string";
  if (invalidComplete || invalidFailed) {
    return { status, failedSteps: [], warning: `${path}: invalid_failed_steps` };
  }

  const failedSteps = [
    ...((complete as string[] | undefined) ?? []).map(item => item.trim()).filter(Boolean),
    ...((failed as string | undefined) ?? "").split(" ").map(item => item.trim()).filter(Boolean),
  ];
  return { status, failedSteps, warning: null };
}

function isDedupeRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.key === "string" && row.key.trim().length > 0
    && typeof row.sentAt === "string" && row.sentAt.trim().length > 0
    && typeof row.preview === "string";
}

export function readMorningLiteDedupeCount(path: string): MorningLiteDedupeCount {
  if (!existsSync(path)) return { count: 0, warning: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return { count: 0, warning: `${path}: parse_error` };
  }
  if (!Array.isArray(parsed)) return { count: 0, warning: `${path}: invalid_root` };
  const validRows = parsed.filter(isDedupeRecord);
  const invalidCount = parsed.length - validRows.length;
  return {
    count: validRows.length,
    warning: invalidCount > 0 ? `${path}: invalid_rows ${invalidCount}` : null,
  };
}
