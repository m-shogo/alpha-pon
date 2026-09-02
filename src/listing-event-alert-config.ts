import { existsSync, lstatSync, readFileSync } from "fs";
import { dirname, resolve, sep } from "node:path";
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

function symlinkedAncestorWithin(path: string, rootPath: string): string | undefined {
  const root = resolve(rootPath);
  let current = dirname(resolve(path));
  if (current !== root && !current.startsWith(`${root}${sep}`)) return undefined;

  while (current !== root) {
    if (lstatSync(current).isSymbolicLink()) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

export function readListingEventAlertConfig(
  path: string,
  repositoryRootPath: string = process.cwd(),
): {
  config: ListingEventAlertConfig;
  warnings: string[];
} {
  if (!existsSync(path)) return { config: {}, warnings: [] };

  let parsed: unknown;
  try {
    const symlinkAncestor = symlinkedAncestorWithin(path, repositoryRootPath);
    if (symlinkAncestor) {
      return { config: {}, warnings: [`${path}: ancestor_symlink`] };
    }
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      return { config: {}, warnings: [`${path}: non_standalone_file`] };
    }
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
