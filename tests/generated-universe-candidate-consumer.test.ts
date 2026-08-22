import assert from 'node:assert/strict'
import { normalizeGeneratedArrayInput } from '../apps/web/lib/generated-array-input.js'

type CandidateRow = Record<string, unknown>

const objectRow = (value: unknown): value is CandidateRow => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
)

const canonical = {
  code: '8136',
  name: 'Sanrio',
  sector: 'Services',
  detectedAt: '2026-08-22',
  currentPrice: 100,
  high52w: 120,
  drawdownPct: -16.7,
  operatingProfitYoY: 10,
  hasDownwardRevision: false,
  hasNegativeFlag: false,
  hasRecentDisclosure: true,
  matchedWorldEventTags: [],
  screeningScore: 72,
  warnings: [],
  status: 'monitoring',
  dataSource: 'jquants',
}

assert.deepEqual(
  normalizeGeneratedArrayInput([canonical], 'universeCandidates', objectRow),
  { rows: [canonical], warning: null },
)

for (const malformed of [
  { code: '8136' },
  { ...canonical, dataSource: 'external' },
  { ...canonical, status: 'unknown' },
  { ...canonical, screeningScore: 101 },
  { ...canonical, warnings: 'none' },
  { ...canonical, matchedWorldEventTags: null },
  { ...canonical, code: ' 8136 ' },
]) {
  assert.deepEqual(
    normalizeGeneratedArrayInput([malformed], 'universeCandidates', objectRow),
    { rows: [], warning: 'universeCandidates: invalid_entries (1)' },
  )
}

assert.deepEqual(
  normalizeGeneratedArrayInput([{ code: '8136' }], 'otherField', objectRow),
  { rows: [{ code: '8136' }], warning: null },
)

console.log('generated universe candidate consumer tests passed')
