import { existsSync, readFileSync } from "fs";
import { addDaysJst, todayJst } from "./date.js";
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

export type MorningLiteDedupeFileDate = {
  date: string | null;
  warning: string | null;
};

function canonicalJstDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return addDaysJst(value, 0) === value ? value : null;
  } catch {
    return null;
  }
}

function normalizeFailedStepArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) return null;
  return value.map(item => item.trim()).filter(Boolean);
}

function normalizeDailyFailedSteps(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (typeof value !== "string") return null;
  return value.split(" ").map(item => item.trim()).filter(Boolean);
}

export function readMorningLitePipelineInput(
  path: string,
  asOf = todayJst(),
): MorningLitePipelineInput {
  const loaded = readReadOnlyJsonObjectFile<Record<string, unknown>>(path);
  if (loaded.missing) return { status: "unknown", failedSteps: [], warning: `${path}: missing` };
  if (loaded.parseError) return { status: "unknown", failedSteps: [], warning: `${path}: parse_error` };
  if (loaded.invalidRoot || !loaded.object) return { status: "unknown", failedSteps: [], warning: `${path}: invalid_root` };

  const pipelineDate = canonicalJstDate(loaded.object.date);
  if (!pipelineDate) return { status: "unknown", failedSteps: [], warning: `${path}: invalid_date` };
  if (pipelineDate !== asOf) return { status: "unknown", failedSteps: [], warning: `${path}: not_current_date` };

  const statusValue = typeof loaded.object.status === "string" ? loaded.object.status.trim() : "";
  const status = statusValue || "unknown";
  const completeSteps = normalizeFailedStepArray(loaded.object.completeWrapperFailedSteps);
  const dailySteps = normalizeDailyFailedSteps(loaded.object.failedSteps);
  if (!completeSteps || !dailySteps) {
    return { status, failedSteps: [], warning: `${path}: invalid_failed_steps` };
  }

  const failedSteps = Array.from(new Set([...completeSteps, ...dailySteps]));
  if (!statusValue) {
    return { status, failedSteps, warning: `${path}: invalid_status` };
  }
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

export function parseMorningLiteDedupeFileDate(name: string, asOf: string): MorningLiteDedupeFileDate {
  if (!name.endsWith(".json")) return { date: null, warning: null };
  const date = name.slice(0, -5);
  try {
    if (addDaysJst(date, 0) !== date) return { date: null, warning: `${name}: invalid_date_filename` };
  } catch {
    return { date: null, warning: `${name}: invalid_date_filename` };
  }
  if (date > asOf) return { date: null, warning: `${name}: future_date_filename` };
  return { date, warning: null };
}
