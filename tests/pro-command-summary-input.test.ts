import assert from 'node:assert/strict'
import { normalizeProCommandSummaryInput, normalizeProGeneratedDate } from '../apps/web/lib/pro-command-summary-input.js'

const canonical = {
  strategic: '一次情報を確認',
  pipeline: 'healthy',
  committee: 'WATCH',
  roadmap: ['Primary Disclosure', 'Outcome review'],
  refresh: ['Research OS'],
}

assert.deepEqual(
  normalizeProCommandSummaryInput(canonical),
  canonical,
  'canonical Pro command summary must remain renderable',
)

assert.deepEqual(
  normalizeProCommandSummaryInput({
    strategic: { malformed: true },
    pipeline: ['broken'],
    committee: null,
    roadmap: ['keep', { malformed: true }, null],
    refresh: [{ malformed: true }, 'keep-refresh'],
  }),
  {
    strategic: '',
    pipeline: '',
    committee: '',
    roadmap: ['keep'],
    refresh: ['keep-refresh'],
  },
  'malformed generated summary values must not become React children',
)

assert.deepEqual(
  normalizeProCommandSummaryInput(null),
  { strategic: '', pipeline: '', committee: '', roadmap: [], refresh: [] },
  'malformed summary root must fail closed before Pro command rendering',
)

const now = new Date('2026-08-25T09:00:00Z')
assert.equal(
  normalizeProGeneratedDate('2026-08-25', now),
  '2026-08-25',
  'current JST generated date must remain visible',
)
for (const invalid of ['not-a-date', '2026-02-31', '0000-01-01', '2026-08-25T00:00:00+09:00', '2026-08-26']) {
  assert.equal(
    normalizeProGeneratedDate(invalid, now),
    null,
    `invalid or future generated date must fail closed before display: ${invalid}`,
  )
}

console.log('Pro command summary input tests passed')
