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
  { ...validCandidate, dataSource: 'unknown' },
  { ...validCandidate, matchedWorldEventTags: {} },
  { ...validCandidate, warnings: 'warning' },
  { ...validCandidate, screeningScore: '80' },
  { ...validCandidate, screeningScore: -1 },
  { ...validCandidate, screeningScore: 101 },
  { ...validCandidate, drawdownPct: 12.5 },
  { ...validCandidate, drawdownPct: -100.1 },
])

assert.equal(mixed.rows.length, 1, 'malformed candidates must be isolated before Alerts page array and numeric access')
assert.equal(mixed.rows[0]?.code, '8136', 'valid sibling candidates must remain usable')
assert.equal(mixed.warning, 'universeCandidates: invalid_entries (9)')

const duplicateIdentity = normalizeGeneratedAlertCandidates([
  validCandidate,
  { ...validCandidate, screeningScore: 75 },
  { ...validCandidate, code: '7203', name: 'Toyota' },
])
assert.deepEqual(
  duplicateIdentity.rows.map((row) => row.code),
  ['7203'],
  'all rows participating in a duplicate candidate identity must be isolated instead of double-counted',
)
assert.equal(duplicateIdentity.warning, 'universeCandidates: duplicate_codes (8136)')

const invalidRoot = normalizeGeneratedAlertCandidates({})
assert.deepEqual(invalidRoot.rows, [])
assert.equal(invalidRoot.warning, 'universeCandidates: invalid_root (expected array)')

console.log('generated-alert-candidate-input: malformed and duplicate rows isolated OK')
