import { addDaysJst, todayJst } from "./date.js";
import { readReadOnlyJsonArrayFile } from "./read-only-json-file.js";

export const DEFAULT_REGIME_SCENARIO_REFLECTION_PATH = "data/world_event_reflections_latest.json";

export type RegimeScenarioReflection = {
  eventId?: string;
  date?: string;
  createdAt?: string;
  title?: string;
  category?: string;
  categories?: string[];
  tags?: string[];
  impactedTags?: string[];
  riskLevel?: string;
};

export type RegimeScenarioReflectionLoad = {
  rows: RegimeScenarioReflection[];
  warnings: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function isRealJstDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return addDaysJst(value, 0) === value;
  } catch {
    return false;
  }
}

function hasRegimeSignal(value: Record<string, unknown>): boolean {
  const nonEmptyString = (candidate: unknown) => typeof candidate === "string" && candidate.trim().length > 0;
  const nonEmptyStringArray = (candidate: unknown) => Array.isArray(candidate)
    && candidate.some(item => typeof item === "string" && item.trim().length > 0);
  return nonEmptyString(value.title)
    || nonEmptyString(value.category)
    || nonEmptyStringArray(value.categories)
    || nonEmptyStringArray(value.tags)
    || nonEmptyStringArray(value.impactedTags);
}

function isUsableRegimeScenarioReflection(value: unknown, asOf: string): value is RegimeScenarioReflection {
  if (!isRecord(value)) return false;
  if (!isOptionalString(value.eventId)
    || !isOptionalString(value.date)
    || !isOptionalString(value.createdAt)
    || !isOptionalString(value.title)
    || !isOptionalString(value.category)
    || !isOptionalStringArray(value.categories)
    || !isOptionalStringArray(value.tags)
    || !isOptionalStringArray(value.impactedTags)
    || !isOptionalString(value.riskLevel)
    || !hasRegimeSignal(value)) {
    return false;
  }

  const isCanonicalReflection = value.createdAt !== undefined
    || value.categories !== undefined
    || value.impactedTags !== undefined;
  if (isCanonicalReflection) {
    return typeof value.eventId === "string"
      && value.eventId.trim().length > 0
      && value.eventId === value.eventId.trim()
      && isRealJstDate(value.createdAt)
      && value.createdAt <= asOf;
  }
  if (value.date !== undefined && (!isRealJstDate(value.date) || value.date > asOf)) {
    return false;
  }
  return true;
}

function normalizeRegimeScenarioReflection(value: RegimeScenarioReflection): RegimeScenarioReflection {
  return {
    eventId: value.eventId,
    date: value.date ?? value.createdAt,
    createdAt: value.createdAt,
    title: value.title,
    category: value.category ?? (value.categories?.join(" ") || undefined),
    categories: value.categories,
    tags: value.tags ?? value.impactedTags,
    impactedTags: value.impactedTags,
    riskLevel: value.riskLevel,
  };
}

export function loadRegimeScenarioReflectionState(
  path = DEFAULT_REGIME_SCENARIO_REFLECTION_PATH,
  asOf = todayJst(),
): RegimeScenarioReflectionLoad {
  if (!isRealJstDate(asOf)) {
    throw new Error(`regime scenario as-of date must be a real Gregorian date: ${asOf}`);
  }

  const loaded = readReadOnlyJsonArrayFile<unknown>(path);
  if (loaded.parseError) {
    throw new Error(`${path}: parse_error`);
  }
  if (loaded.invalidRoot) {
    throw new Error(`${path}: invalid_root (expected array)`);
  }

  const usable: Array<{ row: RegimeScenarioReflection; rowNumber: number }> = [];
  const invalidRows: number[] = [];
  loaded.rows.forEach((row, index) => {
    if (isUsableRegimeScenarioReflection(row, asOf)) {
      usable.push({ row: normalizeRegimeScenarioReflection(row), rowNumber: index + 1 });
    } else {
      invalidRows.push(index + 1);
    }
  });

  const eventIdCounts = new Map<string, number>();
  usable.forEach(({ row }) => {
    if (row.eventId) eventIdCounts.set(row.eventId, (eventIdCounts.get(row.eventId) ?? 0) + 1);
  });
  const duplicateEventIds = new Set(
    [...eventIdCounts.entries()].filter(([, count]) => count > 1).map(([eventId]) => eventId),
  );
  const duplicateRows = usable
    .filter(({ row }) => row.eventId && duplicateEventIds.has(row.eventId))
    .map(({ rowNumber }) => rowNumber);
  const rows = usable
    .filter(({ row }) => !row.eventId || !duplicateEventIds.has(row.eventId))
    .map(({ row }) => row);

  const warnings: string[] = [];
  if (invalidRows.length > 0) {
    warnings.push(`${path}: ${invalidRows.length} malformed reflection row(s) isolated at row(s) ${invalidRows.join(", ")}`);
  }
  if (duplicateRows.length > 0) {
    warnings.push(`${path}: ${duplicateEventIds.size} duplicate eventId(s) isolated at row(s) ${duplicateRows.join(", ")}`);
  }
  return { rows, warnings };
}

export function loadRegimeScenarioReflections(
  path = DEFAULT_REGIME_SCENARIO_REFLECTION_PATH,
  asOf = todayJst(),
): RegimeScenarioReflection[] {
  return loadRegimeScenarioReflectionState(path, asOf).rows;
}
