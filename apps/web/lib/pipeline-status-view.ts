export type PipelineStatusViewInput = {
  status?: string
  failedSteps?: string[]
  completeWrapperFailedSteps?: string[]
}

export function isPipelineStatusHealthy(status: PipelineStatusViewInput): boolean {
  return status.status === 'ok'
    && (status.failedSteps?.length ?? 0) === 0
    && (status.completeWrapperFailedSteps?.length ?? 0) === 0
}
