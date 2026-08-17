import assert from 'node:assert/strict'
import { normalizeGeneratedWorldContextInput } from '../apps/web/lib/generated-world-context-input.js'

const valid = {
  asOf: '2026-08-18',
  mode: 'research',
  summary: 'Macro context summary',
  activeRegimes: [
    {
      id: 'high_rates',
      level: 'watch',
      why: 'Rates remain elevated.',
      watchCategories: ['rates', 'banks'],
      caution: ['Do not overfit a single print.'],
    },
  ],
  operatingRules: ['Prefer primary sources.'],
}

assert.deepEqual(normalizeGeneratedWorldContextInput(undefined), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedWorldContextInput({}), { value: null, warning: 'worldContext: invalid_shape' })
assert.deepEqual(
  normalizeGeneratedWorldContextInput({ ...valid, activeRegimes: {} }),
  { value: null, warning: 'worldContext: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedWorldContextInput({
    ...valid,
    activeRegimes: [{ ...valid.activeRegimes[0], watchCategories: 'rates' }],
  }),
  { value: null, warning: 'worldContext: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedWorldContextInput({ ...valid, operatingRules: {} }),
  { value: null, warning: 'worldContext: invalid_shape' },
)
assert.deepEqual(normalizeGeneratedWorldContextInput(valid), { value: valid, warning: null })

console.log('generated world context input: malformed runtime shape is isolated before World page access OK')
