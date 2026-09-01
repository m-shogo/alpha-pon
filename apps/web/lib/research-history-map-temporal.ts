const OWNER_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/

type OwnerHistoryMapTemporalProjection = {
  generatedAt: string | null
  historicalAnalogs: readonly {
    observedAt: string
    marketReaction: { measuredAt: string } | null
    outcome: { measuredAt: string } | null
  }[]
}

function isStrictTimestampAtOrBefore(value: string, cutoffMs: number): boolean {
  if (!OWNER_TIMESTAMP_PATTERN.test(value)) return false
  const timestampMs = Date.parse(value)
  return Number.isFinite(timestampMs) && timestampMs <= cutoffMs
}

export function isOwnerResearchHistoryMapTemporalSafe(
  value: OwnerHistoryMapTemporalProjection,
  nowMs = Date.now(),
): boolean {
  if (value.generatedAt === null || !isStrictTimestampAtOrBefore(value.generatedAt, nowMs)) return false
  const generatedAtMs = Date.parse(value.generatedAt)

  return value.historicalAnalogs.every((analog) => {
    if (!isStrictTimestampAtOrBefore(analog.observedAt, generatedAtMs)) return false
    if (analog.marketReaction !== null && !isStrictTimestampAtOrBefore(analog.marketReaction.measuredAt, generatedAtMs)) return false
    if (analog.outcome !== null && !isStrictTimestampAtOrBefore(analog.outcome.measuredAt, generatedAtMs)) return false
    return true
  })
}
