export type GeneratedArrayInput<T> = {
  rows: T[]
  warning: string | null
}

export function normalizeGeneratedArrayInput<T>(
  value: unknown,
  field: string,
): GeneratedArrayInput<T> {
  if (value === undefined) return { rows: [], warning: null }
  if (!Array.isArray(value)) {
    return { rows: [], warning: `${field}: invalid_root (expected array)` }
  }
  return { rows: value as T[], warning: null }
}
