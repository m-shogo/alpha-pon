import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export type OwnerHistoricalAnalogVerdict = 'repriced_up' | 'repriced_down' | 'no_move' | 'unresolved'

export interface OwnerHistoryMapFamilyMember {
  type: 'research_item' | 'edge'
  id: string
  title: string
  status: string
}

export interface OwnerHistoryMapFamily {
  id: string
  title: string
  description: string
  status: 'active' | 'deprecated'
  members: OwnerHistoryMapFamilyMember[]
}

export interface OwnerHistoryMapAnalog {
  id: string
  eventType: string
  companyCode: string
  companyName: string
  eventDate: string
  summary: string
  edgeIds: string[]
  outcome: {
    verdict: OwnerHistoricalAnalogVerdict
    measuredAt: string
  } | null
  dataGaps: string[]
}

export interface OwnerResearchHistoryMap {
  schemaVersion: 1
  generatedAt: string | null
  counts: {
    families: number
    historicalAnalogs: number
    resolvedOutcomes: number
    unresolvedOutcomes: number
  }
  families: OwnerHistoryMapFamily[]
  historicalAnalogs: OwnerHistoryMapAnalog[]
  warning: string | null
}

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'research-history-map.json')

const FALLBACK: OwnerResearchHistoryMap = {
  schemaVersion: 1,
  generatedAt: null,
  counts: {
    families: 0,
    historicalAnalogs: 0,
    resolvedOutcomes: 0,
    unresolvedOutcomes: 0,
  },
  families: [],
  historicalAnalogs: [],
  warning: '研究マップ・過去事例データを読み込めませんでした。生成データを確認してください。',
}

const FAMILY_STATUSES = new Set(['active', 'deprecated'])
const MEMBER_TYPES = new Set(['research_item', 'edge'])
const VERDICTS = new Set<OwnerHistoricalAnalogVerdict>(['repriced_up', 'repriced_down', 'no_move', 'unresolved'])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFamilyMember(value: unknown): value is OwnerHistoryMapFamilyMember {
  if (!isObject(value)) return false
  return typeof value.type === 'string'
    && MEMBER_TYPES.has(value.type)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.status === 'string'
}

function isFamily(value: unknown): value is OwnerHistoryMapFamily {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.status === 'string'
    && FAMILY_STATUSES.has(value.status)
    && Array.isArray(value.members)
    && value.members.every(isFamilyMember)
}

function isOutcome(value: unknown): value is NonNullable<OwnerHistoryMapAnalog['outcome']> {
  if (!isObject(value)) return false
  return typeof value.verdict === 'string'
    && VERDICTS.has(value.verdict as OwnerHistoricalAnalogVerdict)
    && typeof value.measuredAt === 'string'
}

function isAnalog(value: unknown): value is OwnerHistoryMapAnalog {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.eventType === 'string'
    && typeof value.companyCode === 'string'
    && typeof value.companyName === 'string'
    && typeof value.eventDate === 'string'
    && typeof value.summary === 'string'
    && isStringArray(value.edgeIds)
    && (value.outcome === null || isOutcome(value.outcome))
    && isStringArray(value.dataGaps)
}

function parseHistoryMap(value: unknown): OwnerResearchHistoryMap | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null
  if (typeof value.generatedAt !== 'string') return null
  if (!isObject(value.counts)) return null
  if (!isNonNegativeInteger(value.counts.families)
    || !isNonNegativeInteger(value.counts.historicalAnalogs)
    || !isNonNegativeInteger(value.counts.resolvedOutcomes)
    || !isNonNegativeInteger(value.counts.unresolvedOutcomes)) return null
  if (value.counts.resolvedOutcomes + value.counts.unresolvedOutcomes !== value.counts.historicalAnalogs) return null
  if (!Array.isArray(value.families) || !value.families.every(isFamily)) return null
  if (!Array.isArray(value.historicalAnalogs) || !value.historicalAnalogs.every(isAnalog)) return null

  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    counts: value.counts as OwnerResearchHistoryMap['counts'],
    families: value.families,
    historicalAnalogs: value.historicalAnalogs,
    warning: null,
  }
}

export function loadOwnerResearchHistoryMap(): OwnerResearchHistoryMap {
  if (!existsSync(DATA_PATH)) return FALLBACK
  try {
    const parsed = parseHistoryMap(JSON.parse(readFileSync(DATA_PATH, 'utf-8')))
    return parsed ?? FALLBACK
  } catch {
    return FALLBACK
  }
}
