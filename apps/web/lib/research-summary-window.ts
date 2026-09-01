const DAY_MS = 86_400_000
const OWNER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type OwnerResearchSummaryWindowProjection = {
  overview: {
    asOf: string
    recent7d: {
      from: string
      to: string
    }
  }
}

function dateEpoch(value: string): number | null {
  if (!OWNER_DATE_PATTERN.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const epoch = Date.UTC(year, month - 1, day)
  const date = new Date(epoch)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return epoch
}

export function isOwnerResearchSummaryWindowSafe(
  value: OwnerResearchSummaryWindowProjection,
): boolean {
  const asOfEpoch = dateEpoch(value.overview.asOf)
  if (asOfEpoch === null) return false
  const expectedFrom = new Date(asOfEpoch - 6 * DAY_MS).toISOString().slice(0, 10)
  return value.overview.recent7d.to === value.overview.asOf
    && value.overview.recent7d.from === expectedFrom
}
