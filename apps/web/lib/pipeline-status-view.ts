export type PipelineStatusViewInput = {
  status?: string
  failedSteps?: unknown
  completeWrapperFailedSteps?: string[]
}

function hasNoFailedSteps(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0)
}

export function isPipelineStatusHealthy(status: PipelineStatusViewInput): boolean {
  return status.status === 'ok'
    && hasNoFailedSteps(status.failedSteps)
    && (status.completeWrapperFailedSteps?.length ?? 0) === 0
}
