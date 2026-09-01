import type { OwnerResearchSummary } from './research-summary'
import { isOwnerResearchTimestampSafe } from './research-summary'

export function isOwnerResearchSummaryTemporalSafe(
  value: Pick<OwnerResearchSummary, 'generatedAt' | 'latestResearchAt' | 'timeline' | 'checkpoint'>,
  nowMs = Date.now(),
): boolean {
  if (value.generatedAt === null || !isOwnerResearchTimestampSafe(value.generatedAt, nowMs)) return false
  const generatedAtMs = Date.parse(value.generatedAt)

  if (value.latestResearchAt !== null && !isOwnerResearchTimestampSafe(value.latestResearchAt, generatedAtMs)) return false
  if (!value.timeline.every((entry) => isOwnerResearchTimestampSafe(entry.at, generatedAtMs))) return false
  if (value.checkpoint !== null && !isOwnerResearchTimestampSafe(value.checkpoint.savedAt, generatedAtMs)) return false

  return true
}
