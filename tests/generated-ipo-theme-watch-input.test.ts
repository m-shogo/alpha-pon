import assert from 'node:assert/strict'
import { normalizeGeneratedIpoThemeWatchInput } from '../apps/web/lib/generated-ipo-theme-watch-input.js'

const valid = {
  generatedAt: '2026-08-18T06:00:00+09:00',
  defaultAction: '一次情報を確認する',
  neverTreatAs: ['buy signal'],
  rules: [
    {
      id: 'ipo-ai',
      label: 'IPO / AI',
      defaultAction: 'watch',
      names: ['AI'],
      evidenceNeeded: ['company IR'],
      touchAvoidReasons: ['primary source missing'],
      japaneseSpilloverThemes: ['semiconductor'],
      relatedCompanies: [{ code: '8136', name: 'サンプル', relation: 'supplier' }],
    },
  ],
}

assert.deepEqual(normalizeGeneratedIpoThemeWatchInput(undefined), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedIpoThemeWatchInput({}), { value: null, warning: 'ipoThemeWatch: invalid_shape' })
assert.deepEqual(
  normalizeGeneratedIpoThemeWatchInput({ ...valid, rules: 'broken' }),
  { value: null, warning: 'ipoThemeWatch: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedIpoThemeWatchInput({ ...valid, rules: [{ ...valid.rules[0], evidenceNeeded: 'broken' }] }),
  { value: null, warning: 'ipoThemeWatch: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedIpoThemeWatchInput({ ...valid, neverTreatAs: {} }),
  { value: null, warning: 'ipoThemeWatch: invalid_shape' },
)
assert.deepEqual(normalizeGeneratedIpoThemeWatchInput(valid), { value: valid, warning: null })

console.log('generated IPO theme watch input: malformed list shapes are isolated before World page rendering OK')
