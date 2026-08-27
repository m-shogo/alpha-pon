import assert from 'node:assert/strict'
import { normalizeGeneratedLegendProDecisionsInput } from '../apps/web/lib/generated-legend-pro-input.js'

const validDecision = {
  code: '8136',
  name: 'Sanrio',
  finalLabel: 'WATCH',
  finalScore: 72.5,
  disagreements: [],
  missingEvidence: ['primary disclosure follow-up'],
}

const normalized = normalizeGeneratedLegendProDecisionsInput({
  decisions: [
    validDecision,
    {},
    { code: '8136' },
    { ...validDecision, code: ' 8136 ' },
    { ...validDecision, name: '' },
    { ...validDecision, finalLabel: ' WATCH ' },
    { ...validDecision, finalScore: Number.NaN },
    { ...validDecision, finalScore: Number.POSITIVE_INFINITY },
  ],
})

assert.deepEqual(
  normalized,
  [validDecision],
  'Roadmap must not count malformed or evidence-free Legend Pro rows as committee decisions',
)
assert.deepEqual(normalizeGeneratedLegendProDecisionsInput({ decisions: [{}] }), [])
assert.deepEqual(normalizeGeneratedLegendProDecisionsInput({ decisions: 'broken' }), [])

console.log('generated-legend-pro-input: canonical decision evidence required OK')
