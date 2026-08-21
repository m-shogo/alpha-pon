export type PipelineStatusViewInput = {
  status?: string
  completeWrapperFailedSteps?: string[]
}

export function isPipelineStatusHealthy(status: PipelineStatusViewInput): boolean {
  return status.status === 'ok' && (status.completeWrapperFailedSteps?.length ?? 0) === 0
}
