import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { todayJst } from "./date.js";

export type RunCursorJobName = "universe-scan" | "analogy-review";

export type RunCursor = {
  jobName: RunCursorJobName;
  offset: number;
  maxPerRun: number;
  total: number;
  updatedAt: string;
};

const CURSOR_PATH = "data/run-cursors.json";

function readCursors(): Record<string, RunCursor> {
  if (!existsSync(CURSOR_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CURSOR_PATH, "utf-8")) as Record<string, RunCursor>;
  } catch {
    return {};
  }
}

function writeCursors(cursors: Record<string, RunCursor>): void {
  mkdirSync(dirname(CURSOR_PATH), { recursive: true });
  writeFileSync(CURSOR_PATH, JSON.stringify(cursors, null, 2), "utf-8");
}

export function nextOffset(current: number, maxPerRun: number, total: number): number {
  if (total <= 0) return 0;
  const next = current + maxPerRun;
  return next >= total ? 0 : next;
}

export function loadRunCursor(jobName: RunCursorJobName, maxPerRun: number, total: number): RunCursor {
  const cursors = readCursors();
  const existing = cursors[jobName];
  const offset = typeof existing?.offset === "number" && existing.offset < total ? existing.offset : 0;
  return {
    jobName,
    offset,
    maxPerRun,
    total,
    updatedAt: existing?.updatedAt ?? todayJst(),
  };
}

export function saveRunCursor(cursor: RunCursor): RunCursor {
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
