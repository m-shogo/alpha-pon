export function hasUsableSourceHealthText(value: string): boolean {
  return value.trim().length > 0;
}

export function sourceHealthHistoryState(fileExists: boolean): "ok" | "missing" {
  return fileExists ? "ok" : "missing";
}

export function hasCanonicalPipelineStatus(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  return value.app === "alpha-pon"
    && typeof value.date === "string"
    && value.runType === "daily"
    && (value.status === "ok" || value.status === "partial_failed")
    && Array.isArray(value.results)
    && Array.isArray(value.failedSteps)
    && typeof value.generatedAt === "string";
}
