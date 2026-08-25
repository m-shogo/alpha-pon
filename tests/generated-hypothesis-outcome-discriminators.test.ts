import assert from 'node:assert/strict'
import { normalizeGeneratedArrayInput } from '../apps/web/lib/generated-array-input.js'
import './generated-universe-candidate-consumer.test.js'
import './generated-candidate-identity.test.js'
import './stock-pro-committee-input.test.js'

type OutcomeRow = {
  evaluatedAt: string
  reviewHorizon: string
  actionLabel: string
  result: string
}

const isOutcomeRow = (value: unknown): value is OutcomeRow => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.evaluatedAt === 'string'
    && typeof row.reviewHorizon === 'string'
    && typeof row.actionLabel === 'string'
    && typeof row.result === 'string'
}

const canonical = {
  evaluatedAt: '2026-08-22',
  reviewHorizon: '1w',
  actionLabel: 'watch',
  result: 'hit',
}

assert.deepEqual(
  normalizeGeneratedArrayInput([canonical], 'hypothesisOutcomes', isOutcomeRow),
  { rows: [canonical], warning: null },
)

for (const malformed of [
  { ...canonical, reviewHorizon: '2w' },
  { ...canonical, reviewHorizon: ' 1w ' },
  { ...canonical, actionLabel: 'buy' },
  { ...canonical, result: 'pending' },
]) {
  assert.deepEqual(
    normalizeGeneratedArrayInput([malformed], 'hypothesisOutcomes', isOutcomeRow),
    { rows: [], warning: 'hypothesisOutcomes: invalid_entries (1)' },
  )
}

assert.deepEqual(
  normalizeGeneratedArrayInput(
    [{ ...canonical, reviewHorizon: 'not-canonical' }],
    'otherField',
    isOutcomeRow,
  ),
  { rows: [{ ...canonical, reviewHorizon: 'not-canonical' }], warning: null },
)

console.log('generated hypothesis outcome discriminator tests passed')
