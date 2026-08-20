import { normalizeGeneratedSpecialSituationOpsInput } from '../apps/web/lib/generated-special-situation-ops-input.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const valid = {
  generatedAt: '2026-08-20',
  today: '2026-08-20',
  healthStatus: 'needs_attention',
  actionItems: [
    { priority: 'attention', category: 'review', title: 'Review due', detail: '1件', command: 'pnpm review:special-due' },
  ],
  coverage: {
    totalCandidates: 2,
    withSpecialOutcome: 1,
    noOutcomeRecord: 1,
    noOutcomeRecordCodes: ['8136'],
    needSeed: true,
  },
  reviewDue: { overdue: 1, historicalSeedOverdue: 0, dueToday: 0, dueThisWeek: 0, notDueYet: 0 },
  backfill: { structurallyUpdatable: 0, historicalUpdatable: 0, recentUpdatable: 0, notDueYet: 0 },
  outcomeStats: { sampleTooSmall: 1, hasStats: 0 },
  mixedOutcomes: { count: 0 },
}

{
  const loaded = normalizeGeneratedSpecialSituationOpsInput(valid)
  assert(loaded.value?.reviewDue.overdue === 1, 'valid special situation ops input must remain usable')
  assert(loaded.warning === null, 'valid special situation ops input must not emit warning')
}

for (const invalid of [
  {},
  { ...valid, actionItems: {} },
  { ...valid, actionItems: [{ priority: 'urgent' }] },
  { ...valid, reviewDue: {} },
  { ...valid, reviewDue: { ...valid.reviewDue, overdue: -1 } },
  { ...valid, coverage: { ...valid.coverage, noOutcomeRecordCodes: {} } },
]) {
  const loaded = normalizeGeneratedSpecialSituationOpsInput(invalid)
  assert(loaded.value === null, `malformed special situation ops input must be isolated: ${JSON.stringify(invalid)}`)
  assert(loaded.warning === 'specialSituationOps: invalid_shape', 'malformed special situation ops input must emit metadata warning')
}

console.log('generated special situation ops input tests passed')
