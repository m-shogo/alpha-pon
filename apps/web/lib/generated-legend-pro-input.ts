export type GeneratedLegendProDecisionInput = {
  finalLabel?: string
  disagreements?: unknown[]
  missingEvidence?: string[]
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isLegendProDecision(value: unknown): value is GeneratedLegendProDecisionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (row.finalLabel === undefined || typeof row.finalLabel === 'string')
    && (row.disagreements === undefined || Array.isArray(row.disagreements))
    && (row.missingEvidence === undefined || isStringArray(row.missingEvidence))
}

export function normalizeGeneratedLegendProDecisionsInput(value: unknown): GeneratedLegendProDecisionInput[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const decisions = (value as Record<string, unknown>).decisions
  if (!Array.isArray(decisions)) return []
  return decisions.filter(isLegendProDecision)
}
