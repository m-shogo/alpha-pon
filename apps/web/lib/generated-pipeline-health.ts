type PipelineStepViewInput = {
  name?: string
  criticality?: string
  status?: string
  code?: number
}

type PipelineStatusViewInput = {
  status?: string
  failedSteps?: unknown
  completeWrapperFailedSteps?: string[]
  steps?: PipelineStepViewInput[]
}

export type GeneratedPipelineFailureSummary = {
  failed: boolean
  failedSteps: string[]
}

function isCanonicalHealthyPipelineStep(step: PipelineStepViewInput): boolean {
  const name = step.name
  const criticality = step.criticality
  const status = step.status
  const code = step.code
  if (typeof name !== 'string' || name.length === 0 || name !== name.trim()) return false
  if (criticality !== 'critical' && criticality !== 'noncritical') return false
  if (status !== 'ok' && status !== 'skipped') return false
  return typeof code === 'number' && Number.isSafeInteger(code) && code === 0
}

function isPipelineStatusHealthy(pipelineStatus: PipelineStatusViewInput): boolean {
  if (pipelineStatus.status !== 'ok') return false
  if (pipelineStatus.failedSteps !== undefined && (!Array.isArray(pipelineStatus.failedSteps) || pipelineStatus.failedSteps.length > 0)) return false
  if ((pipelineStatus.completeWrapperFailedSteps?.length ?? 0) > 0) return false
  return pipelineStatus.steps === undefined || pipelineStatus.steps.every(isCanonicalHealthyPipelineStep)
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
    failed: !isPipelineStatusHealthy(pipelineStatus),
    failedSteps,
  }
}
