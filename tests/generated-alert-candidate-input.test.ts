import assert from 'node:assert/strict'
import { normalizeGeneratedAlertCandidates } from '../apps/web/lib/generated-alert-candidate-input.js'

const validCandidate = {
  code: '8136',
  name: 'Sanrio',
  dataSource: 'mock',
  drawdownPct: -12.5,
  screeningScore: 80,
  matchedWorldEventTags: ['theme'],
  warnings: [],
}

const mixed = normalizeGeneratedAlertCandidates([
  validCandidate,
  {},
  { ...validCandidate, matchedWorldEventTags: {} },
  { ...validCandidate, warnings: 'warning' },
  { ...validCandidate, screeningScore: '80' },
])

assert.equal(mixed.rows.length, 1, 'malformed candidates must be isolated before Alerts page array and numeric access')
assert.equal(mixed.rows[0]?.code, '8136', 'valid sibling candidates must remain usable')
assert.equal(mixed.warning, 'universeCandidates: invalid_entries (4)')

const invalidRoot = normalizeGeneratedAlertCandidates({})
assert.deepEqual(invalidRoot.rows, [])
assert.equal(invalidRoot.warning, 'universeCandidates: invalid_root (expected array)')

console.log('generated-alert-candidate-input: malformed rows isolated OK')
