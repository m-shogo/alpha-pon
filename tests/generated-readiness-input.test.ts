import assert from 'node:assert/strict'
import { normalizeGeneratedReadinessInput } from '../apps/web/lib/generated-readiness-input.js'

const valid = {
  generatedAt: '2026-08-18T05:00:00+09:00',
  overallScore: 80,
  overallStatus: 'partial',
  blockers: [],
  items: [
    {
      id: 'hypothesis-outcomes',
      label: 'Hypothesis outcomes',
      status: 'partial',
      score: 50,
      evidence: ['3/10'],
      nextActions: ['review:hypotheses'],
    },
  ],
}

assert.deepEqual(normalizeGeneratedReadinessInput(undefined), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedReadinessInput({}), { value: null, warning: 'readiness: invalid_shape' })
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, generatedAt: '2026-08-18T05:00:00' }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, generatedAt: '2026-08-18T05:00:00-00:00' }),
  { value: null, warning: 'readiness: invalid_shape' },
)
for (const generatedAt of [
  '2026-08-18T05:00:00+14:01',
  '2026-08-18T05:00:00+15:00',
  '2026-08-18T05:00:00.1234567890+09:00',
] as const) {
  assert.deepEqual(
    normalizeGeneratedReadinessInput({ ...valid, generatedAt }),
    { value: null, warning: 'readiness: invalid_shape' },
    'readiness generatedAt must use the shared strict explicit-timezone instant bounds',
  )
}
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, generatedAt: '2026-02-31T05:00:00+09:00' }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, generatedAt: '0000-01-01T05:00:00+09:00' }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, generatedAt: '9999-12-31T23:59:59+09:00' }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, items: {} }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, items: [{ ...valid.items[0], nextActions: 'review:hypotheses' }] }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, items: [{ ...valid.items[0], id: ' hypothesis-outcomes ' }] }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, items: [valid.items[0], { ...valid.items[0] }] }),
  { value: null, warning: 'readiness: invalid_shape' },
)
for (const malformed of [
  { ...valid, blockers: [''] },
  { ...valid, blockers: [' pending '] },
  { ...valid, items: [{ ...valid.items[0], evidence: [''] }] },
  { ...valid, items: [{ ...valid.items[0], evidence: [' 3/10 '] }] },
  { ...valid, items: [{ ...valid.items[0], nextActions: [''] }] },
  { ...valid, items: [{ ...valid.items[0], nextActions: [' review:hypotheses '] }] },
] as const) {
  assert.deepEqual(
    normalizeGeneratedReadinessInput(malformed),
    { value: null, warning: 'readiness: invalid_shape' },
    'blank or padded readiness provenance strings must not render phantom blockers, evidence, or next actions',
  )
}
for (const malformed of [
  { ...valid, overallScore: 101 },
  { ...valid, overallScore: -1 },
  { ...valid, overallStatus: 'complete' },
  { ...valid, overallStatus: 'done' },
  { ...valid, items: [{ ...valid.items[0], score: 101 }] },
  { ...valid, items: [{ ...valid.items[0], status: 'healthy' }] },
  { ...valid, items: [{ ...valid.items[0], status: 'done' }] },
] as const) {
  assert.deepEqual(
    normalizeGeneratedReadinessInput(malformed),
    { value: null, warning: 'readiness: invalid_shape' },
    'impossible or contradictory readiness scores/statuses must not reach roadmap rendering',
  )
}
assert.deepEqual(normalizeGeneratedReadinessInput(valid), { value: valid, warning: null })

console.log('generated readiness input: malformed runtime shape, PIT metadata, score/status consistency, canonical provenance strings, and ambiguous item identities are isolated before Home page access OK')
