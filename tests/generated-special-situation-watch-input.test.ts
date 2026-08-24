import assert from 'node:assert/strict'
import { normalizeGeneratedSpecialSituationWatchInput } from '../apps/web/lib/generated-special-situation-watch-input.js'

const validTopChance = {
  code: '8136',
  name: 'Sanrio',
  finalLabel: '調査優先候補',
  chanceLevel: 'attention',
  reasonSummary: 'watch reason',
  mainRisks: ['risk'],
  nextCheck: ['check'],
  whyNow: ['now'],
  whyNotNow: ['wait'],
}

const valid = {
  generatedAt: '2026-08-20',
  candidates: [
    { code: '8136', name: 'Sanrio' },
    { code: '7203', name: 'Toyota' },
  ],
  topChanceList: [validTopChance],
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

const duplicateCandidates = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  candidates: [
    { code: '8136', name: 'Sanrio first' },
    { code: '8136', name: 'Sanrio duplicate' },
    { code: '7203', name: 'Toyota' },
  ],
})
assert.deepEqual(
  duplicateCandidates.value?.candidates?.map(candidate => candidate.code),
  ['7203'],
  'ambiguous duplicate candidate identity is isolated instead of choosing an input-order winner',
)
assert.equal(duplicateCandidates.warning, 'specialSituationWatch.candidates: duplicate_codes 2')

const invalidCandidates = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  candidates: { code: '8136' },
})
assert.deepEqual(invalidCandidates.value?.candidates, [])
assert.equal(invalidCandidates.warning, 'specialSituationWatch.candidates: invalid_shape')

const mixedTopChance = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  topChanceList: [
    validTopChance,
    null,
    { ...validTopChance, mainRisks: {} },
    { ...validTopChance, nextCheck: 'broken' },
    { ...validTopChance, code: ' 6758' },
    { ...validTopChance, code: '6758', name: 'Sony' },
  ],
})
assert.deepEqual(mixedTopChance.value?.topChanceList?.map(candidate => candidate.code), ['8136', '6758'])
assert.equal(mixedTopChance.warning, 'specialSituationWatch.topChanceList: invalid_rows 4')

const invalidEnums = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  topChanceList: [
    { ...validTopChance, chanceLevel: 'urgent' },
    { ...validTopChance, code: '6758', name: 'Sony', finalLabel: 'watch' },
    { ...validTopChance, code: '7203', name: 'Toyota', chanceLevel: 'high' },
  ],
})
assert.deepEqual(invalidEnums.value?.topChanceList?.map(candidate => candidate.code), ['7203'])
assert.equal(invalidEnums.warning, 'specialSituationWatch.topChanceList: invalid_rows 2')

const duplicateTopChance = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  topChanceList: [
    validTopChance,
    { ...validTopChance, name: 'Sanrio duplicate' },
  ],
})
assert.deepEqual(
  duplicateTopChance.value?.topChanceList?.map(candidate => candidate.code),
  [],
  'ambiguous duplicate top-chance identity is isolated instead of choosing an input-order winner',
)
assert.equal(duplicateTopChance.warning, 'specialSituationWatch.topChanceList: duplicate_codes 2')

const invalidTopChanceRoot = normalizeGeneratedSpecialSituationWatchInput({
  generatedAt: '2026-08-20',
  topChanceList: { code: '8136' },
})
assert.deepEqual(invalidTopChanceRoot.value?.topChanceList, [])
assert.equal(invalidTopChanceRoot.warning, 'specialSituationWatch.topChanceList: invalid_shape')

assert.deepEqual(normalizeGeneratedSpecialSituationWatchInput(null), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedSpecialSituationWatchInput([]), {
  value: null,
  warning: 'specialSituationWatch: invalid_shape',
})

console.log('generated special situation watch input: malformed, duplicate, and producer-enum violations are isolated before Web consumers OK')
