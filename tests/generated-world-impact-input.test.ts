import assert from 'node:assert/strict'
import {
  normalizeGeneratedWorldImpactAuditInput,
  normalizeGeneratedWorldImpactReviewsInput,
} from '../apps/web/lib/generated-world-impact-input.js'

const validOutcome = {
  horizon: '1w',
  dueAt: '2026-08-21',
  result: 'hit',
  expectedDirection: 'up',
  actualDirection: 'up',
  dataAvailability: 'ok',
  returnPct: 1.2,
  topixReturnPct: 0.4,
  relativeToTopixPct: 0.8,
  missedSignals: [],
  lesson: null,
} as const

const validReview = {
  schemaVersion: 2,
  reviewKey: 'evt-1:8136',
  eventId: 'evt-1',
  eventDate: '2026-08-20',
  topic: 'test event',
  source: null,
  sourceQuality: 'official',
  namedEntities: [],
  affectedSectors: [],
  affectedCompanyCodes: ['8136'],
  expectedMechanism: 'demand',
  secondOrderEffect: '',
  counterArgument: '',
  timeLag: '1w',
  expectedHorizon: '1w',
  dataAvailability: 'ok',
  outcomes: [validOutcome],
  missedSignals: [],
  lesson: null,
  createdAt: '2026-08-20',
  updatedAt: '2026-08-21',
  mechanisms: ['demand'],
  direction: 'positive',
  confidence: 0.7,
  reviewStatus: 'reviewed',
} as const

assert.deepEqual(normalizeGeneratedWorldImpactReviewsInput(undefined), { rows: [], warning: null })
assert.deepEqual(normalizeGeneratedWorldImpactReviewsInput([validReview]), { rows: [validReview], warning: null })

for (const malformed of [
  { ...validReview, eventDate: 123 },
  { ...validReview, eventDate: '2026-02-31' },
  { ...validReview, createdAt: '0000-01-01' },
  { ...validReview, updatedAt: '2026-13-01' },
  { ...validReview, topic: null },
  { ...validReview, affectedCompanyCodes: null },
  { ...validReview, outcomes: [{ ...validOutcome, dueAt: '2026-02-31' }] },
  { ...validReview, outcomes: [{ ...validOutcome, returnPct: '1.2' }] },
  { ...validReview, outcomes: [{ ...validOutcome, horizon: '3m' }] },
  { ...validReview, outcomes: [{ ...validOutcome, result: 'success' }] },
  { ...validReview, mechanisms: 'demand' },
  { ...validReview, confidence: 1.1 },
] as const) {
  assert.deepEqual(
    normalizeGeneratedWorldImpactReviewsInput([validReview, malformed]),
    { rows: [validReview], warning: 'worldImpactReviews: isolated_1_invalid_rows' },
    'malformed world impact rows must not reach Web UI consumers',
  )
}

const validAudit = {
  schemaVersion: 1,
  generatedAt: '2026-08-21T12:00:00+09:00',
  healthStatus: 'ok',
  totalReviews: 1,
  pendingReviews: 0,
  overdueReviews: 0,
  missingCounterArguments: 0,
  missingMechanisms: 0,
  dataUnavailable: 0,
  priceDataPending: 0,
  sourceQualityUnknown: 0,
  unknownMatchedAsHit: 0,
  priorityIssues: [],
} as const

assert.deepEqual(normalizeGeneratedWorldImpactAuditInput(validAudit), { value: validAudit, warning: null })
for (const malformed of [
  { ...validAudit, overdueReviews: -1 },
  { ...validAudit, priceDataPending: 0.5 },
  { ...validAudit, priorityIssues: {} },
  { ...validAudit, priorityIssues: [{ severity: 'panic', category: 'x', title: 'x', detail: 'x' }] },
] as const) {
  assert.deepEqual(
    normalizeGeneratedWorldImpactAuditInput(malformed),
    { value: null, warning: 'worldImpactAudit: invalid_shape' },
    'malformed world impact audit must fail closed before Web UI access',
  )
}

console.log('generated world impact input: malformed review and audit data are isolated before Web UI access OK')
