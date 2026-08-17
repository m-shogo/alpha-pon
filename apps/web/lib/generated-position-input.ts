import { normalizeGeneratedArrayInput, type GeneratedArrayInput } from './generated-array-input.js'

export type GeneratedPositionInput = {
  code: string
  name: string
  shares: number
  averageCost: number
  currentPrice: number | null
  marketValue: number | null
  unrealizedGain: number | null
  unrealizedGainPct: number | null
  positionWeightPct: number | null
  nisaType: 'nisa_growth' | 'nisa_accumulation' | 'taxable' | null
  boughtReason: string
  addCondition: string
  trimCondition: string
  exitCondition: string
  thesis: string[]
  invalidationLine: string
  nextEvent: string
  memo: string
}

const NISA_TYPES = new Set(['nisa_growth', 'nisa_accumulation', 'taxable'])

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isGeneratedPositionInput(value: unknown): value is GeneratedPositionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>

  return typeof row.code === 'string'
    && row.code.trim().length > 0
    && row.code === row.code.trim()
    && typeof row.name === 'string'
    && typeof row.shares === 'number'
    && Number.isFinite(row.shares)
    && typeof row.averageCost === 'number'
    && Number.isFinite(row.averageCost)
    && isFiniteNumberOrNull(row.currentPrice)
    && isFiniteNumberOrNull(row.marketValue)
    && isFiniteNumberOrNull(row.unrealizedGain)
    && isFiniteNumberOrNull(row.unrealizedGainPct)
    && isFiniteNumberOrNull(row.positionWeightPct)
    && (row.nisaType === null || (typeof row.nisaType === 'string' && NISA_TYPES.has(row.nisaType)))
    && typeof row.boughtReason === 'string'
    && typeof row.addCondition === 'string'
    && typeof row.trimCondition === 'string'
    && typeof row.exitCondition === 'string'
    && isStringArray(row.thesis)
    && typeof row.invalidationLine === 'string'
    && typeof row.nextEvent === 'string'
    && typeof row.memo === 'string'
}

export function normalizeGeneratedPositions(value: unknown): GeneratedArrayInput<GeneratedPositionInput> {
  return normalizeGeneratedArrayInput<GeneratedPositionInput>(value, 'positions', isGeneratedPositionInput)
}
