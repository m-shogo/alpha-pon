import assert from 'node:assert/strict'
import { normalizeGeneratedArrayInput } from '../apps/web/lib/generated-array-input.js'
import './pro-command-summary-input.test.js'

type CandidateIdentityRow = { code: string }

const isCandidateIdentityRow = (value: unknown): value is CandidateIdentityRow => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return typeof (value as Record<string, unknown>).code === 'string'
}

const canonical = { code: '8136' }

assert.deepEqual(
  normalizeGeneratedArrayInput([canonical, { code: '7203' }], 'candidates', isCandidateIdentityRow),
  { rows: [canonical, { code: '7203' }], warning: null },
)

assert.deepEqual(
  normalizeGeneratedArrayInput([{ code: ' 8136 ' }], 'candidates', isCandidateIdentityRow),
  { rows: [], warning: 'candidates: invalid_entries (1)' },
)

assert.deepEqual(
  normalizeGeneratedArrayInput([canonical, { code: '8136' }], 'candidates', isCandidateIdentityRow),
  { rows: [canonical], warning: 'candidates: invalid_entries (1)' },
)

assert.deepEqual(
  normalizeGeneratedArrayInput([{ code: ' 8136 ' }], 'otherField', isCandidateIdentityRow),
  { rows: [{ code: ' 8136 ' }], warning: null },
)

console.log('generated candidate identity tests passed')
