import assert from 'node:assert/strict'
import { normalizeGeneratedCompanyRules } from '../apps/web/lib/generated-company-rule-input.js'

const validRule = {
  generatedRuleId: 'rule-8136',
  code: '8136',
  name: 'Sanrio',
  generatedAt: '2026-06-05T00:00:00+09:00',
  actionSignal: 'ENTRY_WATCH',
  confidence: 0.7,
  reasons: ['reason'],
  risks: ['risk'],
  evidenceNeeded: ['evidence'],
  invalidationSignals: ['invalidate'],
  priceSignal: {
    change5dPct: 1.2,
    change20dPct: null,
    relativeTopix20dPct: 0.4,
    volumeSpikeRatio: 1.1,
    source: 'jquants',
    quality: 'exact',
  },
  priceRiskWarnings: [],
}

assert.deepEqual(normalizeGeneratedCompanyRules(undefined), { rows: [], warning: null })
assert.deepEqual(normalizeGeneratedCompanyRules({}), { rows: [], warning: 'generatedCompanyRules: invalid_root' })
assert.deepEqual(
  normalizeGeneratedCompanyRules([validRule, {}]),
  { rows: [validRule], warning: 'generatedCompanyRules: invalid_rows 1' },
)
assert.deepEqual(
  normalizeGeneratedCompanyRules([{ ...validRule, reasons: 'reason' }]),
  { rows: [], warning: 'generatedCompanyRules: invalid_rows 1' },
)
assert.deepEqual(
  normalizeGeneratedCompanyRules([{ ...validRule, priceSignal: { ...validRule.priceSignal, volumeSpikeRatio: '1.1' } }]),
  { rows: [], warning: 'generatedCompanyRules: invalid_rows 1' },
)
for (const confidence of [-0.01, 1.01]) {
  assert.deepEqual(
    normalizeGeneratedCompanyRules([{ ...validRule, confidence }]),
    { rows: [], warning: 'generatedCompanyRules: invalid_rows 1' },
    'confidence outside the canonical 0..1 ratio must not reach percentage rendering',
  )
}
for (const generatedAt of [
  undefined,
  'not-a-date',
  '2026-06-05T00:00:00',
  '2026-06-05T00:00:00-00:00',
  '2026-02-31T00:00:00+09:00',
  '2999-01-01T00:00:00+09:00',
]) {
  assert.deepEqual(
    normalizeGeneratedCompanyRules([{ ...validRule, generatedAt }]),
    { rows: [], warning: 'generatedCompanyRules: invalid_rows 1' },
    'Actions must reject missing, ambiguous, nonexistent, or future generated-rule provenance',
  )
}
for (const identityPatch of [
  { generatedRuleId: ' rule-8136 ' },
  { code: ' 8136 ' },
]) {
  assert.deepEqual(
    normalizeGeneratedCompanyRules([{ ...validRule, ...identityPatch }]),
    { rows: [], warning: 'generatedCompanyRules: invalid_rows 1' },
    'Actions must reject padded generated-rule identities',
  )
}
assert.deepEqual(
  normalizeGeneratedCompanyRules([
    validRule,
    { ...validRule, name: 'Conflicting duplicate' },
  ]),
  { rows: [], warning: 'generatedCompanyRules: invalid_rows 2' },
  'duplicate generatedRuleId rows must not double-count ambiguous action evidence',
)
assert.deepEqual(normalizeGeneratedCompanyRules([validRule]), { rows: [validRule], warning: null })

console.log('generated company rules: malformed rows are isolated before Actions page rendering OK')
