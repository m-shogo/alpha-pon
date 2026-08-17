export type GeneratedArrayInput<T> = {
  rows: T[]
  warning: string | null
}

export type GeneratedObjectInput = {
  object: Record<string, unknown>
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

export function normalizeGeneratedObjectInput(
  value: unknown,
  field: string,
): GeneratedObjectInput {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { object: value as Record<string, unknown>, warning: null }
  }
  return { object: {}, warning: `${field}: invalid_root (expected object)` }
}
