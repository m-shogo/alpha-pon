import assert from 'node:assert/strict'
import { isPipelineStatusHealthy } from '../apps/web/lib/pipeline-status-view.js'

const canonicalStep = { name: 'source-health', criticality: 'critical', status: 'ok', code: 0 }

assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: [], completeWrapperFailedSteps: [] }), true)
assert.equal(isPipelineStatusHealthy({ status: 'ok', steps: [canonicalStep] }), true)
assert.equal(isPipelineStatusHealthy({ status: 'ok' }), true)
assert.equal(isPipelineStatusHealthy({ status: 'partial_failed', failedSteps: [], completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: ['scan:universe(1)'], completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: 'scan:universe(1)', completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: [], completeWrapperFailedSteps: ['scan:universe(1)'] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'success', failedSteps: [], completeWrapperFailedSteps: [] }), false)
assert.equal(
  isPipelineStatusHealthy({
    status: 'ok',
    failedSteps: [],
    completeWrapperFailedSteps: [],
    steps: [{ name: 'source-health', criticality: 'critical', status: 'failed', code: 1 }],
  }),
  false,
  'canonical failed step must make top-level ok unhealthy',
)

for (const malformedStep of [
  { ...canonicalStep, name: ' source-health ' },
  { ...canonicalStep, criticality: ' critical' },
  { ...canonicalStep, criticality: 'unknown' },
  { ...canonicalStep, status: 'success' },
  { ...canonicalStep, status: 'ok', code: 1 },
  { ...canonicalStep, status: 'skipped', code: 1 },
  { ...canonicalStep, status: 'failed', code: 0 },
  { ...canonicalStep, status: 'failed', code: 1.5 },
  { ...canonicalStep, status: 'failed', code: 256 },
]) {
  assert.equal(
    isPipelineStatusHealthy({ status: 'ok', failedSteps: [], completeWrapperFailedSteps: [], steps: [malformedStep] }),
    false,
  )
}

assert.equal(
  isPipelineStatusHealthy({
    status: 'ok',
    steps: [
      canonicalStep,
      { name: 'weekly-review', criticality: 'noncritical', status: 'skipped', code: 0 },
    ],
  }),
  true,
)

console.log('pipeline status view: only canonical ok with no failed or inconsistent steps is healthy OK')
