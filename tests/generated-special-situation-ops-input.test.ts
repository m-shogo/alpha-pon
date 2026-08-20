import { normalizeGeneratedSpecialSituationOpsInput } from '../apps/web/lib/generated-special-situation-ops-input.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const valid = {
  generatedAt: '2026-08-20',
  today: '2026-08-20',
  healthStatus: 'action_required',
  actionItems: [
    {
      priority: 'urgent',
      category: 'review_due',
      title: 'Review due',
      detail: 'One special situation review is overdue.',
      command: 'pnpm review:special-due',
    },
  ],
  coverage: {
    totalCandidates: 1,
    withSpecialOutcome: 0,
    noOutcomeRecord: 1,
    noOutcomeRecordCodes: ['8136'],
    needSeed: true,
  },
  reviewDue: {
    overdue: 1,
    historicalSeedOverdue: 0,
    dueToday: 0,
    dueThisWeek: 0,
    notDueYet: 0,
  },
  backfill: {
    structurallyUpdatable: 0,
    historicalUpdatable: 0,
    recentUpdatable: 0,
    notDueYet: 0,
  },
  outcomeStats: { sampleTooSmall: 0, hasStats: 0 },
  mixedOutcomes: { count: 0 },
}

const accepted = normalizeGeneratedSpecialSituationOpsInput(valid)
assert(accepted.value !== null && accepted.warning === null, 'valid special situation ops input must remain usable')

const attentionOnly = normalizeGeneratedSpecialSituationOpsInput({
  ...valid,
  healthStatus: 'needs_attention',
  actionItems: [{ priority: 'attention', category: 'data', title: 'Review data', detail: 'Review data quality.' }],
})
assert(attentionOnly.value !== null, 'attention-only special ops input must remain usable')

const informational = normalizeGeneratedSpecialSituationOpsInput({
  ...valid,
  healthStatus: 'ok',
  actionItems: [{ priority: 'info', category: 'review', title: 'Upcoming review', detail: 'Review is not due yet.' }],
})
assert(informational.value !== null, 'info-only special ops input must remain usable')

for (const invalid of [
  {},
  { ...valid, actionItems: 'broken' },
  { ...valid, actionItems: [null] },
  { ...valid, actionItems: [{ priority: 'urgent', category: '', title: 'x', detail: 'y' }] },
  { ...valid, reviewDue: null },
  { ...valid, reviewDue: { ...valid.reviewDue, overdue: -1 } },
  { ...valid, healthStatus: 'unknown' },
  { ...valid, healthStatus: 'needs_attention' },
  { ...valid, healthStatus: 'ok' },
  {
    ...valid,
    healthStatus: 'ok',
    actionItems: [{ priority: 'attention', category: 'data', title: 'Review data', detail: 'Review data quality.' }],
  },
  {
    ...valid,
    healthStatus: 'needs_attention',
    actionItems: [{ priority: 'info', category: 'review', title: 'Upcoming review', detail: 'Review is not due yet.' }],
  },
]) {
  const normalized = normalizeGeneratedSpecialSituationOpsInput(invalid)
  assert(normalized.value === null, `malformed special situation ops input must be isolated: ${JSON.stringify(invalid)}`)
  assert(normalized.warning === 'specialSituationOps: invalid_shape', 'malformed input must emit metadata-only warning')
}

console.log('Generated special situation ops input tests passed')
