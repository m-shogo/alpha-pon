export type GeneratedArrayInput<T> = {
  rows: T[]
  warning: string | null
}

export type GeneratedObjectInput = {
  object: Record<string, unknown>
  warning: string | null
}

export type GeneratedRecordInput<T> = {
  record: Record<string, T>
  warning: string | null
}

export function normalizeGeneratedArrayInput<T>(
  value: unknown,
  field: string,
  isValidEntry?: (value: unknown) => value is T,
): GeneratedArrayInput<T> {
  if (value === undefined) return { rows: [], warning: null }
  if (!Array.isArray(value)) {
    return { rows: [], warning: `${field}: invalid_root (expected array)` }
  }
  if (!isValidEntry) return { rows: value as T[], warning: null }

  const rows = value.filter(isValidEntry)
  const invalidEntries = value.length - rows.length
  return {
    rows,
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
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

export function normalizeOptionalGeneratedObjectInput(
  value: unknown,
  field: string,
): GeneratedObjectInput {
  if (value === undefined) return { object: {}, warning: null }
  return normalizeGeneratedObjectInput(value, field)
}

export function normalizeOptionalGeneratedRecordInput<T>(
  value: unknown,
  field: string,
  isValidEntry: (value: unknown) => value is T,
): GeneratedRecordInput<T> {
  const root = normalizeOptionalGeneratedObjectInput(value, field)
  if (root.warning) return { record: {}, warning: root.warning }

  const validEntries: Array<[string, T]> = []
  let invalidEntries = 0
  for (const [key, entry] of Object.entries(root.object)) {
    if (isValidEntry(entry)) {
      validEntries.push([key, entry])
    } else {
      invalidEntries += 1
    }
  }

  return {
    record: Object.fromEntries(validEntries),
    warning: invalidEntries > 0 ? `${field}: invalid_entries (${invalidEntries})` : null,
  }
}
