import assert from 'node:assert/strict'
import { normalizeGeneratedPositions } from '../apps/web/lib/generated-position-input'

const validPosition = {
  code: '8136',
  name: 'Sanrio',
  shares: 100,
  averageCost: 5000,
  currentPrice: 5500,
  marketValue: 550000,
  unrealizedGain: 50000,
  unrealizedGainPct: 10,
  positionWeightPct: 12.5,
  nisaType: 'nisa_growth',
  boughtReason: 'fixture',
  addCondition: '',
  trimCondition: '',
  exitCondition: '',
  thesis: ['fixture thesis'],
  invalidationLine: '',
  nextEvent: '',
  memo: '',
}

const mixed = normalizeGeneratedPositions([
  validPosition,
  {},
  { ...validPosition, code: ' 8136' },
  { ...validPosition, shares: '100' },
  { ...validPosition, thesis: {} },
])

assert.equal(mixed.rows.length, 1, 'malformed position rows must be isolated before UI property access')
assert.equal(mixed.rows[0]?.code, '8136', 'valid sibling positions must remain usable')
assert.equal(mixed.warning, 'positions: invalid_entries (4)', 'invalid row count must remain visible as metadata')

const invalidRoot = normalizeGeneratedPositions({})
assert.deepEqual(invalidRoot.rows, [], 'invalid positions root must fail closed to an empty list')
assert.equal(invalidRoot.warning, 'positions: invalid_root (expected array)')

console.log('generated-position-input: malformed rows isolated OK')
