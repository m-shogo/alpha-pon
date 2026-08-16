import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";

export type NotificationFeedbackRecord = {
  date: string;
  value: "useful" | "noise";
  topic: string;
  memo: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNotificationFeedbackRecord(value: unknown): value is NotificationFeedbackRecord {
  if (!isRecord(value)) return false;
  if (value.value !== "useful" && value.value !== "noise") return false;
  for (const key of ["date", "topic", "memo", "createdAt"] as const) {
    if (typeof value[key] !== "string") return false;
  }
  return value.date.trim().length > 0 && value.topic.trim().length > 0 && value.createdAt.trim().length > 0;
}

export function readNotificationFeedbackInput(path: string): {
  records: NotificationFeedbackRecord[];
  warning: string | null;
} {
  const result = readJsonlWithErrors<unknown>(path);
  const parseWarning = formatReadOnlyJsonlParseWarning(path, result.parseErrors);
  const records = result.rows.filter(isNotificationFeedbackRecord);
  const invalidCount = result.rows.length - records.length;
  const warnings = [
    parseWarning,
    invalidCount > 0 ? `${path}: invalid_rows ${invalidCount}` : null,
  ].filter((warning): warning is string => warning !== null);
  return {
    records,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
  };
}
