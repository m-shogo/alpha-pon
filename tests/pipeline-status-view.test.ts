import assert from 'node:assert/strict'
import { isPipelineStatusHealthy } from '../apps/web/lib/pipeline-status-view.js'

assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: '', completeWrapperFailedSteps: [] }), true)
assert.equal(isPipelineStatusHealthy({ status: 'ok' }), true)
assert.equal(isPipelineStatusHealthy({ status: 'partial_failed', failedSteps: '', completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: 'scan:universe(1)', completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: ['scan:universe(1)'], completeWrapperFailedSteps: [] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'ok', failedSteps: '', completeWrapperFailedSteps: ['scan:universe(1)'] }), false)
assert.equal(isPipelineStatusHealthy({ status: 'success', failedSteps: '', completeWrapperFailedSteps: [] }), false)

console.log('pipeline status view: only canonical ok with no failed steps is healthy OK')
