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
    invalidPayloadRows: 0,
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
  { ...canonical, generatedAt: '2026-02-30' },
  { ...canonical, generatedAt: '0000-01-01' },
  { ...canonical, generatedAt: '9999-12-31' },
  { ...canonical, generatedAt: '2026-08-20T00:00:00+09:00' },
  { ...canonical, jsonl: undefined },
  { ...canonical, jsonl: { totalRows: 3 } },
  { ...canonical, sqlite: undefined },
  { ...canonical, sqlite: { totalRows: 3, duplicateGroups: [], error: null } },
  { ...canonical, status: 'unknown' },
  { ...canonical, status: 'action_required' },
  { ...canonical, status: 'ok', jsonl: { totalRows: 3, duplicateGroups: [{ key: '8136|2026-08-20|1m', count: 2 }] } },
  { ...canonical, status: 'ok', sqlite: { ...canonical.sqlite, invalidPayloadRows: 1 } },
  { ...canonical, status: 'ok', sqlite: { ...canonical.sqlite, exists: true, error: 'db broken' } },
  { ...canonical, jsonl: { totalRows: 3, duplicateGroups: [], parseErrors: [{}] } },
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
} as const
assert.equal(normalizeGeneratedOutcomeIntegrityInput(duplicateReport).value?.status, 'duplicate_found')

const parseErrorReport = {
  ...canonical,
  status: 'parse_error',
  sqlite: { ...canonical.sqlite, invalidPayloadRows: 1 },
} as const
assert.equal(normalizeGeneratedOutcomeIntegrityInput(parseErrorReport).value?.status, 'parse_error')

const dbUnavailableReport = {
  ...canonical,
  status: 'db_unavailable',
  sqlite: { ...canonical.sqlite, exists: true, error: 'db broken' },
} as const
assert.equal(normalizeGeneratedOutcomeIntegrityInput(dbUnavailableReport).value?.status, 'db_unavailable')

for (const badCount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  const result = normalizeGeneratedOutcomeIntegrityInput({
    ...canonical,
    jsonl: { totalRows: badCount, duplicateGroups: [] },
  })
  assert.equal(result.value, null)
}

console.log('generated outcome integrity input tests passed')
