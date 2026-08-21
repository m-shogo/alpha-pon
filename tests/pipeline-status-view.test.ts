import assert from 'node:assert/strict'
import { isPipelineStatusHealthy } from '../apps/web/lib/pipeline-status-view.js'

assert.equal(isPipelineStatusHealthy({ status: 'ok', completeWrapperFailedSteps: [] }), true)
assert.equal(isPipelineStatusHealthy({ status: 'ok' }), true)
assert.equal(isPipelineStatusHealthy({ status: 'partial_failed', completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', completeWrapperFailedSteps: ['scan:universe(1)'] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'success', completeWrapperFailedSteps: [] }), false)

console.log('pipeline status view: only canonical ok with no complete-wrapper failures is healthy OK')
