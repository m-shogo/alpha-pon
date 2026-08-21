export type PipelineStatusViewInput = {
  status?: string
  failedSteps?: string | string[]
  completeWrapperFailedSteps?: string[]
}

function hasFailedSteps(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' && value.length > 0
}

export function isPipelineStatusHealthy(status: PipelineStatusViewInput): boolean {
  return status.status === 'ok'
    && !hasFailedSteps(status.failedSteps)
    && (status.completeWrapperFailedSteps?.length ?? 0) === 0
}
