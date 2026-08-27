export type GeneratedLegendProDecisionInput = {
  code: string
  name: string
  finalLabel: string
  finalScore: number
  disagreements?: unknown[]
  missingEvidence?: string[]
}

function isCanonicalText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isLegendProDecision(value: unknown): value is GeneratedLegendProDecisionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return isCanonicalText(row.code)
    && isCanonicalText(row.name)
    && isCanonicalText(row.finalLabel)
    && typeof row.finalScore === 'number'
    && Number.isFinite(row.finalScore)
    && (row.disagreements === undefined || Array.isArray(row.disagreements))
    && (row.missingEvidence === undefined || isStringArray(row.missingEvidence))
}

export function normalizeGeneratedLegendProDecisionsInput(value: unknown): GeneratedLegendProDecisionInput[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const decisions = (value as Record<string, unknown>).decisions
  if (!Array.isArray(decisions)) return []
  return decisions.filter(isLegendProDecision)
}