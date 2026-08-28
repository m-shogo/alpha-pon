import assert from 'node:assert/strict'
import { normalizeGeneratedRules } from '../apps/web/lib/generated-rule-input.js'

const validRule = {
  generatedRuleId: 'rule-8136-2026-08-18',
  code: '8136',
  name: 'Sanrio',
  generatedAt: '2026-08-18T00:00:00+09:00',
  thesis: ['fixture thesis'],
  invalidationSignals: ['fixture invalidation'],
}

const mixed = normalizeGeneratedRules([
  validRule,
  {},
  { ...validRule, generatedRuleId: ' rule-8136-2026-08-18 ' },
  { ...validRule, generatedAt: null },
  { ...validRule, generatedAt: '2026-08-18T00:00:00' },
  { ...validRule, generatedAt: '2026-08-18T00:00:00-00:00' },
  { ...validRule, generatedAt: '2026-08-18T00:00:00+14:01' },
  { ...validRule, generatedAt: '2026-08-18T00:00:00+15:00' },
  { ...validRule, generatedAt: '2026-08-18T00:00:00.1234567890+09:00' },
  { ...validRule, generatedAt: '2026-02-31T00:00:00+09:00' },
  { ...validRule, generatedAt: '9999-12-31T23:59:59+09:00' },
  { ...validRule, thesis: {} },
  { ...validRule, invalidationSignals: 'none' },
  { ...validRule, thesis: ['   '] },
  { ...validRule, invalidationSignals: [' padded '] },
])

assert.equal(mixed.rows.length, 1, 'malformed, blank/padded evidence, or future generated rules must be isolated before Rules page property access')
assert.equal(mixed.rows[0]?.generatedRuleId, validRule.generatedRuleId, 'valid sibling rules must remain usable')
assert.equal(mixed.warning, 'generatedCompanyRules: invalid_entries (14)')

const uniqueSibling = {
  ...validRule,
  generatedRuleId: 'rule-7011-2026-08-18',
  code: '7011',
  name: 'Sample',
}
const duplicateIdentity = normalizeGeneratedRules([validRule, { ...validRule }, uniqueSibling])
assert.deepEqual(duplicateIdentity.rows, [uniqueSibling], 'all rows participating in a duplicate generatedRuleId must be isolated')
assert.equal(duplicateIdentity.warning, 'generatedCompanyRules: invalid_entries (2)')

const invalidRoot = normalizeGeneratedRules({})
assert.deepEqual(invalidRoot.rows, [])
assert.equal(invalidRoot.warning, 'generatedCompanyRules: invalid_root (expected array)')

console.log('generated-rule-input: malformed rows, canonical evidence strings, strict PIT generatedAt provenance, and ambiguous generatedRuleId identities isolated OK')