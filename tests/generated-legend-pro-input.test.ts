import assert from 'node:assert/strict'
import { normalizeGeneratedLegendProDecisionsInput } from '../apps/web/lib/generated-legend-pro-input.js'

const validDecision = {
  finalLabel: 'WATCH',
  disagreements: [],
  missingEvidence: ['primary disclosure follow-up'],
}

const normalized = normalizeGeneratedLegendProDecisionsInput({
  decisions: [
    validDecision,
    {},
    { code: '8136' },
    { ...validDecision, finalLabel: '' },
    { ...validDecision, finalLabel: ' WATCH ' },
    { ...validDecision, missingEvidence: { malformed: true } },
  ],
})

assert.deepEqual(
  normalized,
  [validDecision],
  'Roadmap must not count evidence-free or malformed Legend Pro rows as committee decisions',
)
assert.deepEqual(normalizeGeneratedLegendProDecisionsInput({ decisions: [{}] }), [])
assert.deepEqual(normalizeGeneratedLegendProDecisionsInput({ decisions: 'broken' }), [])

console.log('generated-legend-pro-input: canonical finalLabel evidence required OK')
