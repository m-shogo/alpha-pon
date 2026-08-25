import type { GeneratedPipelineStatusInput } from './generated-array-input.js'

export type GeneratedPipelineFailureSummary = {
  failed: boolean
  failedSteps: string[]
}

export function summarizeGeneratedPipelineFailure(
  pipelineStatus: GeneratedPipelineStatusInput | null | undefined,
): GeneratedPipelineFailureSummary {
  if (!pipelineStatus) return { failed: false, failedSteps: [] }

  const failedSteps = [...new Set([
    ...(pipelineStatus.failedSteps ?? []),
    ...(pipelineStatus.completeWrapperFailedSteps ?? []),
  ])]
  return {
    failed: failedSteps.length > 0
      || pipelineStatus.status === 'failed'
      || pipelineStatus.status === 'partial_failed',
    failedSteps,
  }
}
