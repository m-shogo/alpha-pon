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
  const { date, topic, memo, createdAt } = value;
  if (value.value !== "useful" && value.value !== "noise") return false;
  if (typeof date !== "string" || typeof topic !== "string" || typeof memo !== "string" || typeof createdAt !== "string") {
    return false;
  }
  return date.trim().length > 0 && topic.trim().length > 0 && createdAt.trim().length > 0;
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
