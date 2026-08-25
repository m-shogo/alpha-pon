import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { addDaysJst, todayJst } from "./date.js";

export type RunCursorJobName = "universe-scan" | "analogy-review";

export type RunCursor = {
  jobName: RunCursorJobName;
  offset: number;
  maxPerRun: number;
  total: number;
  updatedAt: string;
};

const CURSOR_PATH = "data/run-cursors.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStandaloneRegularFile(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1;
  } catch {
    return false;
  }
}

function readCursors(): Record<string, RunCursor> {
  if (!existsSync(CURSOR_PATH) || !isStandaloneRegularFile(CURSOR_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(CURSOR_PATH, "utf-8")) as unknown;
    return isRecord(parsed) ? parsed as Record<string, RunCursor> : {};
  } catch {
    return {};
  }
}

function writeCursors(cursors: Record<string, RunCursor>): void {
  mkdirSync(dirname(CURSOR_PATH), { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify(cursors, null, 2), "utf-8");
}

function isCurrentOrPastJstDate(value: unknown, today: string): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value && value <= today;
  } catch {
    return false;
  }
}

function assertRunCursorParameters(maxPerRun: number, total: number): void {
  if (!Number.isSafeInteger(maxPerRun) || maxPerRun < 1) {
    throw new Error("run cursor maxPerRun must be a positive safe integer");
  }
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("run cursor total must be a non-negative safe integer");
  }
}

export function nextOffset(current: number, maxPerRun: number, total: number): number {
  if (total <= 0) return 0;
  const next = current + maxPerRun;
  return next >= total ? 0 : next;
}

export function loadRunCursor(jobName: RunCursorJobName, maxPerRun: number, total: number): RunCursor {
  assertRunCursorParameters(maxPerRun, total);
  const cursors = readCursors();
  const existing = cursors[jobName];
  const today = todayJst();
  const usableExisting = existing
    && existing.jobName === jobName
    && Number.isSafeInteger(existing.offset)
    && existing.offset >= 0
    && existing.offset < total
    && isCurrentOrPastJstDate(existing.updatedAt, today);
  const offset = usableExisting ? existing.offset : 0;
  return {
    jobName,
    offset,
    maxPerRun,
    total,
    updatedAt: usableExisting ? existing.updatedAt : today,
  };
}

export function saveRunCursor(cursor: RunCursor): RunCursor {
  assertRunCursorParameters(cursor.maxPerRun, cursor.total);
  const cursors = readCursors();
  const next: RunCursor = {
    ...cursor,
    offset: nextOffset(cursor.offset, cursor.maxPerRun, cursor.total),
    updatedAt: todayJst(),
  };
  cursors[cursor.jobName] = next;
  writeCursors(cursors);
  return next;
}
