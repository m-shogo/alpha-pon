export function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requireMustWatchThemes(value: unknown): Record<string, unknown> {
  const config = requirePlainObject(value, "must-watch config");
  return requirePlainObject(config.mustWatchThemes, "mustWatchThemes");
}
