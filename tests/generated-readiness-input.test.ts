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
  normalizeGeneratedReadinessInput({ ...valid, items: {} }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedReadinessInput({ ...valid, items: [{ ...valid.items[0], nextActions: 'review:hypotheses' }] }),
  { value: null, warning: 'readiness: invalid_shape' },
)
assert.deepEqual(normalizeGeneratedReadinessInput(valid), { value: valid, warning: null })

console.log('generated readiness input: malformed runtime shape is isolated before Home page access OK')
