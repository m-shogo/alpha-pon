import assert from 'node:assert/strict'
import { normalizeWorldThemeReviewInput } from '../apps/web/lib/world-theme-review-input.js'

const validReview = {
  generatedAt: '2026-08-22T00:00:00+09:00',
  totalHypotheses: 2,
  reviewedResults: 1,
  dueReviews: [
    {
      hypothesisId: 'hyp-1',
      dueAt: '2026-08-22',
      afterDays: 30,
      sourceEventTitle: 'Event',
      theme: 'Theme',
      candidateCode: '8136',
      candidateCompany: 'Sanrio',
      nextPrimaryCheck: 'Primary source',
    },
  ],
}

assert.deepEqual(normalizeWorldThemeReviewInput(validReview), validReview)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, dueReviews: 'broken' }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, dueReviews: [{}] }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, dueReviews: [{ ...validReview.dueReviews[0], afterDays: 45 }] }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, dueReviews: [validReview.dueReviews[0], { ...validReview.dueReviews[0], dueAt: '2026-08-23' }] }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, totalHypotheses: -1 }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, totalHypotheses: 1.5 }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, reviewedResults: 0.5 }), null)
assert.equal(normalizeWorldThemeReviewInput({ ...validReview, totalHypotheses: 1, reviewedResults: 2 }), null)
assert.equal(normalizeWorldThemeReviewInput([]), null)

console.log('world-theme-review-input: malformed review artifacts fail closed OK')
