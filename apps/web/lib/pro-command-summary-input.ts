export type ProCommandSummaryInput = {
  strategic: string
  pipeline: string
  committee: string
  roadmap: string[]
  refresh: string[]
}

const EMPTY_PRO_COMMAND_SUMMARY: ProCommandSummaryInput = {
  strategic: '',
  pipeline: '',
  committee: '',
  roadmap: [],
  refresh: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringRows(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((row): row is string => typeof row === 'string') : []
}

export function normalizeProCommandSummaryInput(value: unknown): ProCommandSummaryInput {
  if (!isRecord(value)) return EMPTY_PRO_COMMAND_SUMMARY
  return {
    strategic: stringOrEmpty(value.strategic),
    pipeline: stringOrEmpty(value.pipeline),
    committee: stringOrEmpty(value.committee),
    roadmap: stringRows(value.roadmap),
    refresh: stringRows(value.refresh),
  }
}
