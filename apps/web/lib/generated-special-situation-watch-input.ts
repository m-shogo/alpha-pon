type SpecialSituationWatchCandidate = {
  code: string
  name?: string
  [key: string]: unknown
}

type SpecialSituationWatchInput = Record<string, unknown> & {
  candidates?: SpecialSituationWatchCandidate[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCanonicalCode(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isCandidate(value: unknown): value is SpecialSituationWatchCandidate {
  return isRecord(value) && isCanonicalCode(value.code)
}

export function normalizeGeneratedSpecialSituationWatchInput(value: unknown): {
  value: SpecialSituationWatchInput | null
  warning: string | null
} {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isRecord(value)) return { value: null, warning: 'specialSituationWatch: invalid_shape' }
  if (value.candidates === undefined) return { value: value as SpecialSituationWatchInput, warning: null }
  if (!Array.isArray(value.candidates)) {
    return {
      value: { ...value, candidates: [] },
      warning: 'specialSituationWatch.candidates: invalid_shape',
    }
  }

  const candidates = value.candidates.filter(isCandidate)
  return {
    value: { ...value, candidates },
    warning: candidates.length === value.candidates.length
      ? null
      : `specialSituationWatch.candidates: invalid_rows ${value.candidates.length - candidates.length}`,
  }
}
