import assert from 'node:assert/strict'
import { isGeneratedWorldThemeCandidateHypothesisInput } from '../apps/web/lib/generated-array-input.js'

const canonical = {
  sourceEventTitle: 'Primary-source event',
  sourceEventPublishedAt: '2026-08-27',
  theme: 'theme',
  candidateCode: '8136',
  candidateCompany: 'Sanrio',
  whyThisCompany: 'why',
  upsideHypothesis: 'up',
  downsideRisk: 'down',
  nextPrimaryCheck: 'check',
  reviewAfterDays: [30, 90, 180],
  disclaimer: 'not advice',
}

assert.equal(isGeneratedWorldThemeCandidateHypothesisInput(canonical), true)
assert.equal(isGeneratedWorldThemeCandidateHypothesisInput({ ...canonical, sourceEventPublishedAt: null }), true)

for (const sourceEventPublishedAt of [
  '2026-02-31',
  '0000-01-01',
  '2026-08-27T00:00:00Z',
  ' 2026-08-27 ',
  '2999-01-01',
]) {
  assert.equal(
    isGeneratedWorldThemeCandidateHypothesisInput({ ...canonical, sourceEventPublishedAt }),
    false,
    `non-canonical/future sourceEventPublishedAt must fail closed: ${sourceEventPublishedAt}`,
  )
}

console.log('generated world theme source date tests passed')
