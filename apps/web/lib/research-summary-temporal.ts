const OWNER_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/

type OwnerResearchSummaryTemporalProjection = {
  generatedAt: string | null
  latestResearchAt: string | null
  researchItems: readonly {
    createdAt: string
    lastReviewedAt?: string
    questions: readonly {
      createdAt: string
      lastReviewedAt?: string
    }[]
  }[]
  formalEdges: readonly {
    lastUpdate: string
    lastResearchAt: string | null
  }[]
  timeline: readonly { at: string }[]
  checkpoint: { savedAt: string } | null
}

function isStrictTimestampAtOrBefore(value: string, cutoffMs: number): boolean {
  if (!OWNER_TIMESTAMP_PATTERN.test(value)) return false
  const timestampMs = Date.parse(value)
  return Number.isFinite(timestampMs) && timestampMs <= cutoffMs
}

export function isOwnerResearchSummaryTemporalSafe(
  value: OwnerResearchSummaryTemporalProjection,
  nowMs = Date.now(),
): boolean {
  if (value.generatedAt === null || !isStrictTimestampAtOrBefore(value.generatedAt, nowMs)) return false
  const generatedAtMs = Date.parse(value.generatedAt)

  if (value.latestResearchAt !== null && !isStrictTimestampAtOrBefore(value.latestResearchAt, generatedAtMs)) return false
  if (!value.researchItems.every((item) => {
    if (!isStrictTimestampAtOrBefore(item.createdAt, generatedAtMs)) return false
    if (item.lastReviewedAt !== undefined && !isStrictTimestampAtOrBefore(item.lastReviewedAt, generatedAtMs)) return false
    return item.questions.every((question) => {
      if (!isStrictTimestampAtOrBefore(question.createdAt, generatedAtMs)) return false
      return question.lastReviewedAt === undefined
        || isStrictTimestampAtOrBefore(question.lastReviewedAt, generatedAtMs)
    })
  })) return false
  if (!value.formalEdges.every((edge) => {
    if (!isStrictTimestampAtOrBefore(edge.lastUpdate, generatedAtMs)) return false
    return edge.lastResearchAt === null || isStrictTimestampAtOrBefore(edge.lastResearchAt, generatedAtMs)
  })) return false
  if (!value.timeline.every((entry) => isStrictTimestampAtOrBefore(entry.at, generatedAtMs))) return false
  if (value.checkpoint !== null && !isStrictTimestampAtOrBefore(value.checkpoint.savedAt, generatedAtMs)) return false

  return true
}
