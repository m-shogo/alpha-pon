import assert from 'node:assert/strict'
import { normalizeGeneratedOutcomeIntegrityInput } from '../apps/web/lib/generated-outcome-integrity-input.js'

const canonical = {
  generatedAt: '2026-08-20',
  status: 'ok',
  jsonl: {
    totalRows: 3,
    duplicateGroups: [],
  },
  sqlite: {
    totalRows: 3,
    uniqueIndexExists: true,
    duplicateGroups: [],
    error: null,
  },
  nextAction: 'none',
} as const

assert.deepEqual(normalizeGeneratedOutcomeIntegrityInput(canonical), {
  value: canonical,
  warning: null,
})

for (const malformed of [
  {},
  { ...canonical, jsonl: undefined },
  { ...canonical, jsonl: { totalRows: 3 } },
  { ...canonical, sqlite: undefined },
  { ...canonical, sqlite: { totalRows: 3, duplicateGroups: [], error: null } },
  { ...canonical, status: 'unknown' },
  { ...canonical, nextAction: '' },
] as const) {
  const result = normalizeGeneratedOutcomeIntegrityInput(malformed)
  assert.equal(result.value, null)
  assert.equal(result.warning, 'hypothesisOutcomeIntegrity: invalid_shape')
}

const duplicateReport = {
  ...canonical,
  status: 'duplicate_found',
  jsonl: {
    totalRows: 4,
    duplicateGroups: [{ key: '8136|2026-08-20|1m', count: 2 }],
  },
}
assert.equal(normalizeGeneratedOutcomeIntegrityInput(duplicateReport).value?.status, 'duplicate_found')

for (const badCount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  const result = normalizeGeneratedOutcomeIntegrityInput({
    ...canonical,
    jsonl: { totalRows: badCount, duplicateGroups: [] },
  })
  assert.equal(result.value, null)
}

console.log('generated outcome integrity input tests passed')
