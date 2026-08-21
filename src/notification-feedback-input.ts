import { addDaysJst, formatJstDate, todayJst } from "./date.js";
import { formatReadOnlyJsonlParseWarning, readJsonlWithErrors } from "./read-only-jsonl.js";
import { parseExplicitIso8601Instant } from "./research/iso-instant.js";

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

function isCurrentOrPastFeedbackTime(date: string, createdAt: string): boolean {
  try {
    if (addDaysJst(date, 0) !== date || date > todayJst()) return false;
    const createdAtMs = parseExplicitIso8601Instant(createdAt, "notification feedback createdAt");
    if (createdAtMs > Date.now()) return false;
    return formatJstDate(new Date(createdAtMs)) === date;
  } catch {
    return false;
  }
}

export function isNotificationFeedbackRecord(value: unknown): value is NotificationFeedbackRecord {
  if (!isRecord(value)) return false;
  const { date, topic, memo, createdAt } = value;
  if (value.value !== "useful" && value.value !== "noise") return false;
  if (typeof date !== "string" || typeof topic !== "string" || typeof memo !== "string" || typeof createdAt !== "string") {
    return false;
  }
  return topic.trim().length > 0 && isCurrentOrPastFeedbackTime(date, createdAt);
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
