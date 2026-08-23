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
  { ...validRule, generatedAt: null },
  { ...validRule, generatedAt: '2026-08-18T00:00:00' },
  { ...validRule, generatedAt: '2026-08-18T00:00:00-00:00' },
  { ...validRule, generatedAt: '2026-02-31T00:00:00+09:00' },
  { ...validRule, generatedAt: '9999-12-31T23:59:59+09:00' },
  { ...validRule, thesis: {} },
  { ...validRule, invalidationSignals: 'none' },
])

assert.equal(mixed.rows.length, 1, 'malformed or future generated rules must be isolated before Rules page property access')
assert.equal(mixed.rows[0]?.generatedRuleId, validRule.generatedRuleId, 'valid sibling rules must remain usable')
assert.equal(mixed.warning, 'generatedCompanyRules: invalid_entries (8)')

const invalidRoot = normalizeGeneratedRules({})
assert.deepEqual(invalidRoot.rows, [])
assert.equal(invalidRoot.warning, 'generatedCompanyRules: invalid_root (expected array)')

console.log('generated-rule-input: malformed rows and PIT generatedAt provenance isolated OK')
