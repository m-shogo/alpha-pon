export type GeneratedActionLabelStats = {
  total: number
  avgExcessReturn1w: number | null
  avgExcessReturn1m: number | null
}

export type GeneratedScoreBandStats = {
  total: number
  hitRate: number | null
  avgExcessReturn1w: number | null
  avgExcessReturn1m: number | null
}

export type GeneratedAccuracySummary = {
  total: number
  hit: number
  miss: number
  tooEarly: number
  unknown: number
  hitRate: number | null
  avgReturn1m: number | null
  avgTopixReturn1m: number | null
  avgRelativeToTopix1m: number | null
  avgMaxDrawdownPct: number | null
  byActionLabel: Record<'watch' | 'log' | 'ignore', GeneratedActionLabelStats>
  byScoreBand: Record<'0-49' | '50-69' | '70-84' | '85-100' | 'unknown', GeneratedScoreBandStats>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isActionLabelStats(value: unknown): value is GeneratedActionLabelStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const stats = value as Record<string, unknown>
  return isCount(stats.total)
    && isFiniteNumberOrNull(stats.avgExcessReturn1w)
    && isFiniteNumberOrNull(stats.avgExcessReturn1m)
}

function isScoreBandStats(value: unknown): value is GeneratedScoreBandStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const stats = value as Record<string, unknown>
  return isCount(stats.total)
    && isFiniteNumberOrNull(stats.hitRate)
    && isFiniteNumberOrNull(stats.avgExcessReturn1w)
    && isFiniteNumberOrNull(stats.avgExcessReturn1m)
}

function hasExactStats<K extends string>(
  value: unknown,
  keys: readonly K[],
  validator: (entry: unknown) => boolean,
): value is Record<K, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return keys.every((key) => validator(record[key]))
}

export function isGeneratedAccuracySummaryInput(value: unknown): value is GeneratedAccuracySummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const summary = value as Record<string, unknown>
  const actionLabels = ['watch', 'log', 'ignore'] as const
  const scoreBands = ['0-49', '50-69', '70-84', '85-100', 'unknown'] as const

  return isCount(summary.total)
    && isCount(summary.hit)
    && isCount(summary.miss)
    && isCount(summary.tooEarly)
    && isCount(summary.unknown)
    && isFiniteNumberOrNull(summary.hitRate)
    && isFiniteNumberOrNull(summary.avgReturn1m)
    && isFiniteNumberOrNull(summary.avgTopixReturn1m)
    && isFiniteNumberOrNull(summary.avgRelativeToTopix1m)
    && isFiniteNumberOrNull(summary.avgMaxDrawdownPct)
    && hasExactStats(summary.byActionLabel, actionLabels, isActionLabelStats)
    && hasExactStats(summary.byScoreBand, scoreBands, isScoreBandStats)
}

export function normalizeGeneratedAccuracySummaryInput(
  value: unknown,
): { value: GeneratedAccuracySummary | null; warning: string | null } {
  if (value === undefined || value === null) return { value: null, warning: null }
  if (!isGeneratedAccuracySummaryInput(value)) {
    return { value: null, warning: 'accuracySummary: invalid_shape' }
  }
  return { value, warning: null }
}
