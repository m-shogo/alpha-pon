import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export type OwnerHistoricalAnalogVerdict = 'repriced_up' | 'repriced_down' | 'no_move' | 'unresolved'
export type OwnerHistoricalAnalogSourceType =
  | 'company_ir'
  | 'tdnet'
  | 'jpx'
  | 'edinet'
  | 'financial_statement'
  | 'regulator'
  | 'ministry'
  | 'court'
  | 'administrative'
  | 'major_media'
  | 'market_data'
  | 'historical_db'
  | 'academic'
export type OwnerResearchComponentKind = 'phase' | 'subsignal' | 'filter' | 'cohort' | 'calibration' | 'guard' | 'fixture'
export type OwnerResearchComponentStatus = 'active' | 'resolved' | 'deprecated' | 'archived'
export type OwnerResearchLineageType = 'derived_from' | 'merged_into' | 'split_into' | 'supersedes' | 'reclassified_as'
export type OwnerResearchStudyMode = 'exploratory' | 'calibration' | 'confirmatory' | 'holdout' | 'out_of_sample' | 'revalidation'
export type OwnerResearchStudyStatus = 'draft' | 'registered' | 'running' | 'completed' | 'cancelled' | 'archived'
export type OwnerResearchIdentificationQuality = 'unidentified' | 'descriptive' | 'correlational' | 'suggestive_causal' | 'strong_causal'
export type OwnerResearchExploitability = 'unknown' | 'observed_effect_only' | 'statistical_edge' | 'economic_edge' | 'executable_edge' | 'not_executable'
export type OwnerResearchNegativeFinding =
  | 'wrong_mechanism'
  | 'already_priced_in'
  | 'no_effect'
  | 'inverse_effect'
  | 'confounded'
  | 'not_executable'
  | 'regime_dependent'
  | 'data_artifact'
  | 'false_analogy'
  | 'selection_bias'
  | 'insufficient_sample'

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

export interface OwnerHistoryMapAnalogMarketReaction {
  measuredAt: string
  horizonDays: number
  rawReturnBps: number
  benchmarkReturnBps?: number
  excessReturnBps?: number
  benchmark?: string
}

export interface OwnerHistoryMapAnalogCounterfactual {
  id: string
  method: string
  comparator: string
  differenceBps?: number
}

export interface OwnerHistoryMapAnalog {
  id: string
  eventType: string
  companyCode: string
  companyName: string
  eventDate: string
  observedAt: string
  sourceType: OwnerHistoricalAnalogSourceType
  summary: string
  edgeIds: string[]
  marketReaction: OwnerHistoryMapAnalogMarketReaction | null
  outcome: {
    verdict: OwnerHistoricalAnalogVerdict
    measuredAt: string
    roiBps?: number
  } | null
  keyEvents: Array<{ date: string; label: string }>
  counterfactuals: OwnerHistoryMapAnalogCounterfactual[]
  dataGaps: string[]
}

export interface OwnerHistoryMapCaseRelation {
  relationType: string
  targetType: string
  targetId: string
  role?: string
}

export interface OwnerHistoryMapCase {
  id: string
  title: string
  status: 'open' | 'closed' | 'archived'
  summary: string
  createdAt: string
  episodeStart?: string
  episodeEnd?: string
  relations: OwnerHistoryMapCaseRelation[]
}

export interface OwnerHistoryMapComponent {
  id: string
  title: string
  kind: OwnerResearchComponentKind
  status: OwnerResearchComponentStatus
  description: string
  edgeIds: string[]
}

export interface OwnerHistoryMapLineage {
  id: string
  lineageType: OwnerResearchLineageType
  sourceType: string
  sourceId: string
  sourceTitle: string
  targetType: string
  targetId: string
  targetTitle: string
  decidedAt: string
  reason: string
}

export interface OwnerHistoryMapStudy {
  id: string
  title: string
  mode: OwnerResearchStudyMode
  status: OwnerResearchStudyStatus
  createdAt: string
  registeredAt?: string
  informationCutoff?: string
  purpose: string
  population?: string
  primaryMetric?: string
}

export interface OwnerHistoryMapStudyResult {
  id: string
  studyId: string
  createdAt: string
  effectSummary: string
  identificationQuality: OwnerResearchIdentificationQuality
  exploitability: OwnerResearchExploitability
  limitations: string[]
  negativeFindings: OwnerResearchNegativeFinding[]
}

export interface OwnerResearchHistoryMap {
  schemaVersion: 1
  generatedAt: string | null
  counts: {
    families: number
    historicalAnalogs: number
    resolvedOutcomes: number
    unresolvedOutcomes: number
    cases: number
    researchComponents: number
    lineages: number
    studies: number
    studyResults: number
  }
  families: OwnerHistoryMapFamily[]
  historicalAnalogs: OwnerHistoryMapAnalog[]
  cases: OwnerHistoryMapCase[]
  researchComponents: OwnerHistoryMapComponent[]
  lineages: OwnerHistoryMapLineage[]
  studies: OwnerHistoryMapStudy[]
  studyResults: OwnerHistoryMapStudyResult[]
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
    cases: 0,
    researchComponents: 0,
    lineages: 0,
    studies: 0,
    studyResults: 0,
  },
  families: [],
  historicalAnalogs: [],
  cases: [],
  researchComponents: [],
  lineages: [],
  studies: [],
  studyResults: [],
  warning: '研究マップ・過去事例データを読み込めませんでした。生成データを確認してください。',
}

const FAMILY_STATUSES = new Set(['active', 'deprecated'])
const MEMBER_TYPES = new Set(['research_item', 'edge'])
const VERDICTS = new Set<OwnerHistoricalAnalogVerdict>(['repriced_up', 'repriced_down', 'no_move', 'unresolved'])
const SOURCE_TYPES = new Set<OwnerHistoricalAnalogSourceType>([
  'company_ir', 'tdnet', 'jpx', 'edinet', 'financial_statement', 'regulator', 'ministry', 'court',
  'administrative', 'major_media', 'market_data', 'historical_db', 'academic',
])
const CASE_STATUSES = new Set(['open', 'closed', 'archived'])
const COMPONENT_KINDS = new Set<OwnerResearchComponentKind>(['phase', 'subsignal', 'filter', 'cohort', 'calibration', 'guard', 'fixture'])
const COMPONENT_STATUSES = new Set<OwnerResearchComponentStatus>(['active', 'resolved', 'deprecated', 'archived'])
const LINEAGE_TYPES = new Set<OwnerResearchLineageType>(['derived_from', 'merged_into', 'split_into', 'supersedes', 'reclassified_as'])
const STUDY_MODES = new Set<OwnerResearchStudyMode>(['exploratory', 'calibration', 'confirmatory', 'holdout', 'out_of_sample', 'revalidation'])
const STUDY_STATUSES = new Set<OwnerResearchStudyStatus>(['draft', 'registered', 'running', 'completed', 'cancelled', 'archived'])
const IDENTIFICATION_QUALITIES = new Set<OwnerResearchIdentificationQuality>(['unidentified', 'descriptive', 'correlational', 'suggestive_causal', 'strong_causal'])
const EXPLOITABILITIES = new Set<OwnerResearchExploitability>(['unknown', 'observed_effect_only', 'statistical_edge', 'economic_edge', 'executable_edge', 'not_executable'])
const NEGATIVE_FINDINGS = new Set<OwnerResearchNegativeFinding>([
  'wrong_mechanism', 'already_priced_in', 'no_effect', 'inverse_effect', 'confounded', 'not_executable',
  'regime_dependent', 'data_artifact', 'false_analogy', 'selection_bias', 'insufficient_sample',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
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

function isMarketReaction(value: unknown): value is OwnerHistoryMapAnalogMarketReaction {
  if (!isObject(value)) return false
  return typeof value.measuredAt === 'string'
    && isNonNegativeInteger(value.horizonDays)
    && isFiniteNumber(value.rawReturnBps)
    && (value.benchmarkReturnBps === undefined || isFiniteNumber(value.benchmarkReturnBps))
    && (value.excessReturnBps === undefined || isFiniteNumber(value.excessReturnBps))
    && (value.benchmark === undefined || typeof value.benchmark === 'string')
}

function isOutcome(value: unknown): value is NonNullable<OwnerHistoryMapAnalog['outcome']> {
  if (!isObject(value)) return false
  return typeof value.verdict === 'string'
    && VERDICTS.has(value.verdict as OwnerHistoricalAnalogVerdict)
    && typeof value.measuredAt === 'string'
    && (value.roiBps === undefined || isFiniteNumber(value.roiBps))
}

function isKeyEvent(value: unknown): value is OwnerHistoryMapAnalog['keyEvents'][number] {
  if (!isObject(value)) return false
  return typeof value.date === 'string' && typeof value.label === 'string'
}

function isCounterfactual(value: unknown): value is OwnerHistoryMapAnalogCounterfactual {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && typeof value.method === 'string'
    && typeof value.comparator === 'string'
    && (value.differenceBps === undefined || isFiniteNumber(value.differenceBps))
}

function isAnalog(value: unknown): value is OwnerHistoryMapAnalog {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.eventType === 'string'
    && typeof value.companyCode === 'string'
    && typeof value.companyName === 'string'
    && typeof value.eventDate === 'string'
    && typeof value.observedAt === 'string'
    && typeof value.sourceType === 'string'
    && SOURCE_TYPES.has(value.sourceType as OwnerHistoricalAnalogSourceType)
    && typeof value.summary === 'string'
    && isStringArray(value.edgeIds)
    && (value.marketReaction === null || isMarketReaction(value.marketReaction))
    && (value.outcome === null || isOutcome(value.outcome))
    && Array.isArray(value.keyEvents)
    && value.keyEvents.every(isKeyEvent)
    && Array.isArray(value.counterfactuals)
    && value.counterfactuals.every(isCounterfactual)
    && isStringArray(value.dataGaps)
}

function isCaseRelation(value: unknown): value is OwnerHistoryMapCaseRelation {
  if (!isObject(value)) return false
  return typeof value.relationType === 'string'
    && typeof value.targetType === 'string'
    && typeof value.targetId === 'string'
    && (value.role === undefined || typeof value.role === 'string')
}

function isCase(value: unknown): value is OwnerHistoryMapCase {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.status === 'string'
    && CASE_STATUSES.has(value.status)
    && typeof value.summary === 'string'
    && typeof value.createdAt === 'string'
    && (value.episodeStart === undefined || typeof value.episodeStart === 'string')
    && (value.episodeEnd === undefined || typeof value.episodeEnd === 'string')
    && Array.isArray(value.relations)
    && value.relations.every(isCaseRelation)
}

function isComponent(value: unknown): value is OwnerHistoryMapComponent {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.kind === 'string'
    && COMPONENT_KINDS.has(value.kind as OwnerResearchComponentKind)
    && typeof value.status === 'string'
    && COMPONENT_STATUSES.has(value.status as OwnerResearchComponentStatus)
    && typeof value.description === 'string'
    && isStringArray(value.edgeIds)
}

function isLineage(value: unknown): value is OwnerHistoryMapLineage {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.lineageType === 'string'
    && LINEAGE_TYPES.has(value.lineageType as OwnerResearchLineageType)
    && typeof value.sourceType === 'string'
    && typeof value.sourceId === 'string'
    && typeof value.sourceTitle === 'string'
    && typeof value.targetType === 'string'
    && typeof value.targetId === 'string'
    && typeof value.targetTitle === 'string'
    && typeof value.decidedAt === 'string'
    && typeof value.reason === 'string'
}

function isStudy(value: unknown): value is OwnerHistoryMapStudy {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.mode === 'string'
    && STUDY_MODES.has(value.mode as OwnerResearchStudyMode)
    && typeof value.status === 'string'
    && STUDY_STATUSES.has(value.status as OwnerResearchStudyStatus)
    && typeof value.createdAt === 'string'
    && (value.registeredAt === undefined || typeof value.registeredAt === 'string')
    && (value.informationCutoff === undefined || typeof value.informationCutoff === 'string')
    && typeof value.purpose === 'string'
    && (value.population === undefined || typeof value.population === 'string')
    && (value.primaryMetric === undefined || typeof value.primaryMetric === 'string')
}

function isStudyResult(value: unknown): value is OwnerHistoryMapStudyResult {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.studyId === 'string'
    && value.studyId.length > 0
    && typeof value.createdAt === 'string'
    && typeof value.effectSummary === 'string'
    && typeof value.identificationQuality === 'string'
    && IDENTIFICATION_QUALITIES.has(value.identificationQuality as OwnerResearchIdentificationQuality)
    && typeof value.exploitability === 'string'
    && EXPLOITABILITIES.has(value.exploitability as OwnerResearchExploitability)
    && isStringArray(value.limitations)
    && Array.isArray(value.negativeFindings)
    && value.negativeFindings.every((finding) => typeof finding === 'string' && NEGATIVE_FINDINGS.has(finding as OwnerResearchNegativeFinding))
}

function parseHistoryMap(value: unknown): OwnerResearchHistoryMap | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null
  if (typeof value.generatedAt !== 'string') return null
  if (!isObject(value.counts)) return null
  if (!isNonNegativeInteger(value.counts.families)
    || !isNonNegativeInteger(value.counts.historicalAnalogs)
    || !isNonNegativeInteger(value.counts.resolvedOutcomes)
    || !isNonNegativeInteger(value.counts.unresolvedOutcomes)
    || !isNonNegativeInteger(value.counts.cases)
    || !isNonNegativeInteger(value.counts.researchComponents)
    || !isNonNegativeInteger(value.counts.lineages)
    || !isNonNegativeInteger(value.counts.studies)
    || !isNonNegativeInteger(value.counts.studyResults)) return null
  if (value.counts.resolvedOutcomes + value.counts.unresolvedOutcomes !== value.counts.historicalAnalogs) return null
  if (!Array.isArray(value.families) || !value.families.every(isFamily)) return null
  if (!Array.isArray(value.historicalAnalogs) || !value.historicalAnalogs.every(isAnalog)) return null
  if (!Array.isArray(value.cases) || !value.cases.every(isCase)) return null
  if (!Array.isArray(value.researchComponents) || !value.researchComponents.every(isComponent)) return null
  if (!Array.isArray(value.lineages) || !value.lineages.every(isLineage)) return null
  if (!Array.isArray(value.studies) || !value.studies.every(isStudy)) return null
  if (!Array.isArray(value.studyResults) || !value.studyResults.every(isStudyResult)) return null
  if (value.families.length !== value.counts.families
    || value.historicalAnalogs.length !== value.counts.historicalAnalogs
    || value.cases.length !== value.counts.cases
    || value.researchComponents.length !== value.counts.researchComponents
    || value.lineages.length !== value.counts.lineages
    || value.studies.length !== value.counts.studies
    || value.studyResults.length !== value.counts.studyResults) return null

  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    counts: value.counts as OwnerResearchHistoryMap['counts'],
    families: value.families,
    historicalAnalogs: value.historicalAnalogs,
    cases: value.cases,
    researchComponents: value.researchComponents,
    lineages: value.lineages,
    studies: value.studies,
    studyResults: value.studyResults,
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
