import assert from 'node:assert/strict'
import { normalizeProCommandSummaryInput } from '../apps/web/lib/pro-command-summary-input.js'

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

console.log('Pro command summary input tests passed')
