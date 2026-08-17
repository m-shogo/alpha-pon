import assert from 'node:assert/strict'
import { normalizeGeneratedAccuracySummaryInput } from '../apps/web/lib/generated-accuracy-summary-input.js'

const valid = {
  total: 8,
  hit: 3,
  miss: 2,
  tooEarly: 2,
  unknown: 1,
  hitRate: 0.6,
  avgReturn1m: 4.2,
  avgTopixReturn1m: 1.1,
  avgRelativeToTopix1m: 3.1,
  avgMaxDrawdownPct: -2.4,
  byActionLabel: {
    watch: { total: 4, avgExcessReturn1w: 1.2, avgExcessReturn1m: 2.3 },
    log: { total: 2, avgExcessReturn1w: null, avgExcessReturn1m: 0.4 },
    ignore: { total: 2, avgExcessReturn1w: -0.5, avgExcessReturn1m: null },
  },
  byScoreBand: {
    '0-49': { total: 1, hitRate: 0, avgExcessReturn1w: -1, avgExcessReturn1m: -2 },
    '50-69': { total: 2, hitRate: 0.5, avgExcessReturn1w: 0.2, avgExcessReturn1m: 0.4 },
    '70-84': { total: 2, hitRate: 0.5, avgExcessReturn1w: 1.2, avgExcessReturn1m: 2.4 },
    '85-100': { total: 2, hitRate: 1, avgExcessReturn1w: 2.1, avgExcessReturn1m: 3.4 },
    unknown: { total: 1, hitRate: null, avgExcessReturn1w: null, avgExcessReturn1m: null },
  },
}

assert.deepEqual(normalizeGeneratedAccuracySummaryInput(undefined), { value: null, warning: null })
assert.deepEqual(normalizeGeneratedAccuracySummaryInput({}), { value: null, warning: 'accuracySummary: invalid_shape' })
assert.deepEqual(
  normalizeGeneratedAccuracySummaryInput({ ...valid, avgReturn1m: '4.2' }),
  { value: null, warning: 'accuracySummary: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedAccuracySummaryInput({
    ...valid,
    byActionLabel: { ...valid.byActionLabel, watch: { ...valid.byActionLabel.watch, avgExcessReturn1m: {} } },
  }),
  { value: null, warning: 'accuracySummary: invalid_shape' },
)
assert.deepEqual(
  normalizeGeneratedAccuracySummaryInput({
    ...valid,
    byScoreBand: { ...valid.byScoreBand, '85-100': { ...valid.byScoreBand['85-100'], hitRate: Number.NaN } },
  }),
  { value: null, warning: 'accuracySummary: invalid_shape' },
)
assert.deepEqual(normalizeGeneratedAccuracySummaryInput(valid), { value: valid, warning: null })

console.log('generated accuracy summary input: malformed runtime shape is isolated before Outcomes page access OK')
