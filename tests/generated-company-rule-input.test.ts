import assert from 'node:assert/strict'
import { normalizeGeneratedCompanyRules } from '../apps/web/lib/generated-company-rule-input.js'

const validRule = {
  generatedRuleId: 'rule-8136',
  code: '8136',
  name: 'Sanrio',
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
assert.deepEqual(normalizeGeneratedCompanyRules([validRule]), { rows: [validRule], warning: null })

console.log('generated company rules: malformed rows are isolated before Actions page rendering OK')
