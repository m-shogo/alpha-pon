export type PipelineStatusViewInput = {
  status?: string
  failedSteps?: unknown
  completeWrapperFailedSteps?: string[]
}

export type GeneratedPipelineFailureSummary = {
  failed: boolean
  failedSteps: string[]
}

export function summarizeGeneratedPipelineFailure(
  pipelineStatus: PipelineStatusViewInput | null | undefined,
): GeneratedPipelineFailureSummary {
  if (!pipelineStatus) return { failed: false, failedSteps: [] }

  const dailyFailedSteps = Array.isArray(pipelineStatus.failedSteps)
    ? pipelineStatus.failedSteps.filter((step): step is string => typeof step === 'string')
    : []
  const completeWrapperFailedSteps = Array.isArray(pipelineStatus.completeWrapperFailedSteps)
    ? pipelineStatus.completeWrapperFailedSteps.filter((step): step is string => typeof step === 'string')
    : []
  const failedSteps = [...new Set([
    ...dailyFailedSteps,
    ...completeWrapperFailedSteps,
  ])]
  return {
    failed: pipelineStatus.status !== 'ok' || failedSteps.length > 0,
    failedSteps,
  }
}
