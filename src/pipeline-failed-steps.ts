export type PipelineFailureEvidence = {
  failedSteps?: string | string[];
  completeWrapperFailedSteps?: string[];
  steps?: Array<{ name?: string; status?: string }>;
  results?: Array<{ name?: string; status?: string }>;
};

export function parseRunDailyFailedSteps(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(step => step.trim()).filter(Boolean);
  if (typeof value !== "string") return [];

  return value
    .trim()
    .split(/\s+/)
    .map(step => step.trim())
    .filter(Boolean);
}

export function collectPipelineFailedStepNames(status: PipelineFailureEvidence | null): string[] {
  if (!status) return [];

  const fromFailedSteps = parseRunDailyFailedSteps(status.failedSteps);
  const fromSteps = (status.steps ?? [])
    .filter(step => step.status && !["ok", "skipped"].includes(step.status))
    .map(step => step.name ?? "unknown");
  const fromResults = (status.results ?? [])
    .filter(result => result.status && !["ok", "skip", "skipped"].includes(result.status))
    .map(result => result.name ?? "unknown");
  const fromCompleteWrapper = status.completeWrapperFailedSteps ?? [];

  return [...new Set([...fromFailedSteps, ...fromSteps, ...fromResults, ...fromCompleteWrapper])];
}
