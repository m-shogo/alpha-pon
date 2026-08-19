import { readReadOnlyJsonArrayFile } from "./read-only-json-file.js";

export const DEFAULT_REGIME_SCENARIO_REFLECTION_PATH = "data/world_event_reflections_latest.json";

export type RegimeScenarioReflection = {
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

function isUsableRegimeScenarioReflection(value: unknown): value is RegimeScenarioReflection {
  if (!isRecord(value)) return false;
  return isOptionalString(value.date)
    && isOptionalString(value.createdAt)
    && isOptionalString(value.title)
    && isOptionalString(value.category)
    && isOptionalStringArray(value.categories)
    && isOptionalStringArray(value.tags)
    && isOptionalStringArray(value.impactedTags)
    && isOptionalString(value.riskLevel);
}

function normalizeRegimeScenarioReflection(value: RegimeScenarioReflection): RegimeScenarioReflection {
  return {
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
): RegimeScenarioReflectionLoad {
  const loaded = readReadOnlyJsonArrayFile<unknown>(path);
  if (loaded.parseError) {
    throw new Error(`${path}: parse_error`);
  }
  if (loaded.invalidRoot) {
    throw new Error(`${path}: invalid_root (expected array)`);
  }

  const rows: RegimeScenarioReflection[] = [];
  const invalidRows: number[] = [];
  loaded.rows.forEach((row, index) => {
    if (isUsableRegimeScenarioReflection(row)) rows.push(normalizeRegimeScenarioReflection(row));
    else invalidRows.push(index + 1);
  });

  const warnings = invalidRows.length > 0
    ? [`${path}: ${invalidRows.length} malformed reflection row(s) isolated at row(s) ${invalidRows.join(", ")}`]
    : [];
  return { rows, warnings };
}

export function loadRegimeScenarioReflections(path = DEFAULT_REGIME_SCENARIO_REFLECTION_PATH): RegimeScenarioReflection[] {
  return loadRegimeScenarioReflectionState(path).rows;
}
