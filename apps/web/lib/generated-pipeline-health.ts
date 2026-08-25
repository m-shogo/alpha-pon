import {
  isPipelineStatusHealthy,
  type PipelineStatusViewInput,
} from './pipeline-status-view.js'

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
  const failedSteps = [...new Set([
    ...dailyFailedSteps,
    ...(pipelineStatus.completeWrapperFailedSteps ?? []),
  ])]
  return {
    failed: !isPipelineStatusHealthy(pipelineStatus),
    failedSteps,
  }
}
