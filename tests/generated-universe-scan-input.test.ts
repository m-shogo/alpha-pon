import assert from 'node:assert/strict'
import { normalizeGeneratedUniverseScanInput } from '../apps/web/lib/generated-universe-scan-input.js'

const valid = {
  generatedAt: '2026-08-21',
  dataSource: 'jquants',
  scanStatus: 'fresh',
  fallbackReason: null,
  count: 3,
} as const

assert.deepEqual(normalizeGeneratedUniverseScanInput(undefined), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedUniverseScanInput(valid), { value: valid, warning: null })

for (const malformed of [
  {},
  { ...valid, generatedAt: '2026-02-30' },
  { ...valid, generatedAt: '9999-12-31' },
  { ...valid, dataSource: 'unknown' },
  { ...valid, scanStatus: 'healthy' },
  { ...valid, count: -1 },
  { ...valid, count: 1.5 },
  { ...valid, count: Number.MAX_SAFE_INTEGER + 1 },
  { ...valid, fallbackReason: 'jquants_zero_candidates' },
  { ...valid, scanStatus: 'stale_fallback', fallbackReason: null },
  { ...valid, scanStatus: 'mock' },
  { ...valid, dataSource: 'mock', scanStatus: 'fresh' },
  { ...valid, dataSource: 'mock', scanStatus: 'mock', fallbackReason: 'jquants_zero_candidates' },
] as const) {
  assert.deepEqual(
    normalizeGeneratedUniverseScanInput(malformed),
    { value: null, warning: 'universeScan: invalid_shape' },
    'malformed universe scan metadata must not reach Web UI consumers',
  )
}

const stale = {
  ...valid,
  scanStatus: 'stale_fallback',
  fallbackReason: 'jquants_zero_candidates',
} as const
assert.deepEqual(normalizeGeneratedUniverseScanInput(stale), { value: stale, warning: null })

const mock = {
  ...valid,
  dataSource: 'mock',
  scanStatus: 'mock',
} as const
assert.deepEqual(normalizeGeneratedUniverseScanInput(mock), { value: mock, warning: null })

console.log('generated universe scan input: malformed metadata is isolated before Web UI access OK')
