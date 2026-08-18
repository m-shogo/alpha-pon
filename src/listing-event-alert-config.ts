import { existsSync, readFileSync } from "fs";
import { load } from "js-yaml";

type NotificationLevel = "priority" | "morning_summary" | "log";

export type ListingEventAlertConfig = {
  requiredMilestones?: Record<string, { notificationLevel?: NotificationLevel }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationLevel(value: unknown): value is NotificationLevel {
  return value === "priority" || value === "morning_summary" || value === "log";
}

export function readListingEventAlertConfig(path: string): {
  config: ListingEventAlertConfig;
  warnings: string[];
} {
  if (!existsSync(path)) return { config: {}, warnings: [] };

  let parsed: unknown;
  try {
    parsed = load(readFileSync(path, "utf-8"));
  } catch {
    return { config: {}, warnings: [`${path}: parse_error`] };
  }

  if (!isRecord(parsed)) {
    return { config: {}, warnings: [`${path}: invalid_root`] };
  }

  const requiredMilestones = parsed.requiredMilestones;
  if (requiredMilestones === undefined) return { config: {}, warnings: [] };
  if (!isRecord(requiredMilestones)) {
    return { config: {}, warnings: [`${path}: invalid_required_milestones_root`] };
  }

  const validMilestones: Record<string, { notificationLevel?: NotificationLevel }> = {};
  let invalidCount = 0;
  for (const [key, value] of Object.entries(requiredMilestones)) {
    if (!isRecord(value)
      || (value.notificationLevel !== undefined && !isNotificationLevel(value.notificationLevel))) {
      invalidCount += 1;
      continue;
    }
    validMilestones[key] = value.notificationLevel === undefined
      ? {}
      : { notificationLevel: value.notificationLevel };
  }

  return {
    config: { requiredMilestones: validMilestones },
    warnings: invalidCount > 0
      ? [`${path}: invalid_required_milestones=${invalidCount}`]
      : [],
  };
}
