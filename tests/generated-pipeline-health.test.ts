import assert from 'node:assert/strict'
import { summarizeGeneratedPipelineFailure } from '../apps/web/lib/generated-pipeline-health.js'

const canonicalStep = { name: 'source-health', criticality: 'critical', status: 'ok', code: 0 }

assert.deepEqual(
  summarizeGeneratedPipelineFailure({ status: 'ok', failedSteps: [], completeWrapperFailedSteps: [], steps: [canonicalStep] }),
  { failed: false, failedSteps: [] },
  'canonical pipeline step remains healthy on Home',
)

for (const inconsistentStep of [
  { ...canonicalStep, status: 'failed', code: 1 },
  { ...canonicalStep, status: 'ok', code: 1 },
  { ...canonicalStep, criticality: 'unknown' },
  { ...canonicalStep, name: ' source-health ' },
]) {
  assert.deepEqual(
    summarizeGeneratedPipelineFailure({ status: 'ok', failedSteps: [], completeWrapperFailedSteps: [], steps: [inconsistentStep] }),
    { failed: true, failedSteps: [] },
    'Home must not render inconsistent step evidence as healthy merely because top-level status is ok',
  )
}

assert.deepEqual(
  summarizeGeneratedPipelineFailure({ status: 'partial_failed', failedSteps: ['scan:universe'] }),
  { failed: true, failedSteps: ['scan:universe'] },
  'existing top-level failure evidence remains visible',
)

console.log('generated pipeline health: Home fails closed on inconsistent step evidence OK')
