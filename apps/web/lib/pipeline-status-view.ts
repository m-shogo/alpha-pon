export type PipelineStepViewInput = {
  name?: string
  criticality?: string
  status?: string
  code?: number
}

export type PipelineStatusViewInput = {
  status?: string
  failedSteps?: unknown
  completeWrapperFailedSteps?: string[]
  steps?: PipelineStepViewInput[]
}

function hasNoFailedSteps(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0)
}

function isCanonicalPipelineStep(step: PipelineStepViewInput): boolean {
  const name = step.name
  const criticality = step.criticality
  const status = step.status
  const code = step.code
  if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) return false
  if (criticality !== 'critical' && criticality !== 'noncritical') return false
  if (status !== 'ok' && status !== 'failed' && status !== 'skipped') return false
  if (typeof code !== 'number' || !Number.isSafeInteger(code) || code < 0 || code > 255) return false
  if (status === 'failed') return code > 0
  return code === 0
}

function hasCanonicalPipelineSteps(steps: PipelineStepViewInput[] | undefined): boolean {
  return steps === undefined || steps.every(isCanonicalPipelineStep)
}

export function isPipelineStatusHealthy(status: PipelineStatusViewInput): boolean {
  return status.status === 'ok'
    && hasNoFailedSteps(status.failedSteps)
    && (status.completeWrapperFailedSteps?.length ?? 0) === 0
    && hasCanonicalPipelineSteps(status.steps)
}
