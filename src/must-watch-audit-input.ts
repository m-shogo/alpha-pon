export function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireOptionalArray(value: unknown, label: string): void {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

export function requireMustWatchThemes(value: unknown): Record<string, Record<string, unknown>> {
  const config = requirePlainObject(value, "must-watch config");
  const themes = requirePlainObject(config.mustWatchThemes, "mustWatchThemes");
  for (const [themeId, theme] of Object.entries(themes)) {
    const row = requirePlainObject(theme, `mustWatchThemes.${themeId}`);
    for (const key of ["requiredEntities", "requiredJapanLinks", "requiredQuestions", "evidenceFiles", "safetyRules"] as const) {
      requireOptionalArray(row[key], `mustWatchThemes.${themeId}.${key}`);
    }
  }
  return themes as Record<string, Record<string, unknown>>;
}
