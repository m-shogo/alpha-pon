import assert from 'node:assert/strict'
import { normalizeGeneratedSpecialSituationWatchInput } from '../apps/web/lib/generated-special-situation-watch-input.js'

const valid = {
  generatedAt: '2026-08-20',
  candidates: [
    { code: '8136', name: 'Sanrio' },
    { code: '7203', name: 'Toyota' },
  ],
}

assert.deepEqual(normalizeGeneratedSpecialSituationWatchInput(valid), {
  value: valid,
  warning: null,
})

const mixed = normalizeGeneratedSpecialSituationWatchInput({
  ...valid,
  candidates: [
    { code: '8136', name: 'Sanrio' },
    null,
    {},
    { code: ' 7203', name: 'Toyota padded' },
    { code: '6758', name: 'Sony' },
  ],
})
assert.deepEqual(mixed.value?.candidates?.map(candidate => candidate.code), ['8136', '6758'])
assert.equal(mixed.warning, 'specialSituationWatch.candidates: invalid_rows 3')

const invalidCandidates = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  candidates: { code: '8136' },
})
assert.deepEqual(invalidCandidates.value?.candidates, [])
assert.equal(invalidCandidates.warning, 'specialSituationWatch.candidates: invalid_shape')

assert.deepEqual(normalizeGeneratedSpecialSituationWatchInput(null), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedSpecialSituationWatchInput([]), {
  value: null,
  warning: 'specialSituationWatch: invalid_shape',
})

console.log('generated special situation watch input tests passed')
