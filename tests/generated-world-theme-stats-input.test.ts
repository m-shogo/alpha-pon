import assert from 'node:assert/strict'
import { normalizeGeneratedWorldThemeStatsInput } from '../apps/web/lib/generated-world-theme-stats-input.js'

const row = {
  theme: 'ai_compute',
  candidateCode: '8136',
  candidateCompany: 'Sanrio',
  reviewedAt: '2026-08-20',
  afterDays: 30 as const,
  result: 'hit' as const,
  memo: 'reviewed',
}

const valid = {
  generatedAt: '2026-08-22',
  total: 1,
  byTheme: [
    {
      theme: 'ai_compute',
      total: 1,
      resultCounts: { hit: 1 },
      recent: [row],
    },
  ],
  recent: [row],
  inputWarnings: [],
}

assert.deepEqual(normalizeGeneratedWorldThemeStatsInput(undefined), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedWorldThemeStatsInput(valid), { value: valid, warning: null })

for (const malformed of [
  { ...valid, byTheme: 'broken' },
  { ...valid, byTheme: [{ ...valid.byTheme[0], resultCounts: null }] },
  { ...valid, byTheme: [{ ...valid.byTheme[0], resultCounts: { unknown: 1 } }] },
  { ...valid, byTheme: [{ ...valid.byTheme[0], resultCounts: { hit: 2 } }] },
  { ...valid, byTheme: [{ ...valid.byTheme[0], recent: [{ ...row, theme: 'other' }] }] },
  { ...valid, recent: 'broken' },
  { ...valid, recent: [{ ...row, afterDays: 45 }] },
  { ...valid, recent: [{ ...row, reviewedAt: '2026-02-31' }] },
  { ...valid, generatedAt: '2026-08-19' },
  { ...valid, byTheme: [{ ...valid.byTheme[0], recent: [{ ...row, reviewedAt: '2026-08-23' }] }] },
  { ...valid, generatedAt: '2999-01-01' },
  { ...valid, total: 2 },
] as const) {
  assert.deepEqual(
    normalizeGeneratedWorldThemeStatsInput(malformed),
    { value: null, warning: 'world_theme_candidate_stats: invalid_shape' },
    'malformed world theme stats must not reach page array/object operations',
  )
}

console.log('generated world theme stats input: malformed runtime shape and provenance are isolated before World Stats page access OK')
