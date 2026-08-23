export function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requireMustWatchThemes(value: unknown): Record<string, Record<string, unknown>> {
  const config = requirePlainObject(value, "must-watch config");
  const themes = requirePlainObject(config.mustWatchThemes, "mustWatchThemes");
  for (const [themeId, theme] of Object.entries(themes)) {
    requirePlainObject(theme, `mustWatchThemes.${themeId}`);
  }
  return themes as Record<string, Record<string, unknown>>;
}
