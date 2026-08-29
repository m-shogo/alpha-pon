import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export type OwnerResearchItemStatus =
  | 'captured'
  | 'triage'
  | 'investigating'
  | 'synthesized'
  | 'resolved'
  | 'parked'
  | 'archived'

export type OwnerResearchQuestionStatus =
  | 'open'
  | 'partially_answered'
  | 'answered'
  | 'blocked'
  | 'obsolete'

export type OwnerFormalEdgeStatus = 'idea' | 'research' | 'shadow' | 'production' | 'rejected' | 'deprecated'
export type OwnerGateState = 'pass' | 'fail' | 'unknown'

export interface OwnerResearchQuestionSummary {
  id: string
  question: string
  status: OwnerResearchQuestionStatus
  createdAt: string
  lastReviewedAt?: string
}

export interface OwnerResearchItemSummary {
  id: string
  title: string
  status: OwnerResearchItemStatus
  origin: string
  summary: string
  createdAt: string
  lastReviewedAt?: string
  families: Array<{ id: string; title: string }>
  questions: OwnerResearchQuestionSummary[]
}

export interface OwnerFormalEdgeSummary {
  id: string
  title: string
  status: OwnerFormalEdgeStatus
  priority: 'S' | 'A' | 'B' | 'C'
  confidence: number
  hypothesis: string
  hypothesisPreview: string
  lastUpdate: string
  lastResearchAt: string | null
  knownFindings: string[]
  nextActions: string[]
  samples: {
    current: number
    required: number
    analogCurrent: number
    analogRequired: number
  }
  gate: {
    pass: number
    fail: number
    unknown: number
    total: number
  }
  verificationGaps: Array<{
    key: string
    state: OwnerGateState
    explanation: string | null
  }>
  requiredData: string[]
}

export interface OwnerResearchTimelineEntry {
  id: string
  at: string
  type: string
  edgeId?: string
  summary: string
  findings: string[]
  dataGaps: string[]
  nextActions: string[]
  rejectionReason?: string
}

export interface OwnerResearchCheckpointSummary {
  sequence: number
  savedAt: string
  researchedEdgeId?: string
  researchDone: string
  dataGaps: string[]
  nextCandidates: Array<{ edgeId: string; why: string }>
  openQuestions: string[]
}

export interface OwnerResearchOverview {
  asOf: string
  edgeStatus: {
    research: number
    shadow: number
    production: number
    idea: number
    rejected: number
    deprecated: number
  }
  recent7d: {
    from: string
    to: string
    edgesAdded: number
    analogsAdded: number
    currentFormalSamples: number
    sampleDelta: null
    sampleDeltaReason: string
  }
  readiness: {
    promotionReadyEdgeIds: string[]
    holdoutReadyEdgeIds: string[]
  }
}

export interface OwnerResearchSummary {
  schemaVersion: 1
  generatedAt: string | null
  latestResearchAt: string | null
  integrity: {
    status: 'ok' | 'attention'
    issueCount: number
    errorCount: number
    warningCount: number
    knowledgeIssueCount: number
  }
  counts: {
    researchItems: number
    activeResearchItems: number
    unresolvedQuestions: number
    researchFamilies: number
    formalEdges: number
    activeFormalEdges: number
  }
  overview: OwnerResearchOverview
  researchItems: OwnerResearchItemSummary[]
  formalEdges: OwnerFormalEdgeSummary[]
  timeline: OwnerResearchTimelineEntry[]
  checkpoint: OwnerResearchCheckpointSummary | null
  warning: string | null
}

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'research-summary.json')

const FALLBACK: OwnerResearchSummary = {
  schemaVersion: 1,
  generatedAt: null,
  latestResearchAt: null,
  integrity: { status: 'attention', issueCount: 0, errorCount: 0, warningCount: 0, knowledgeIssueCount: 0 },
  counts: {
    researchItems: 0,
    activeResearchItems: 0,
    unresolvedQuestions: 0,
    researchFamilies: 0,
    formalEdges: 0,
    activeFormalEdges: 0,
  },
  overview: {
    asOf: '',
    edgeStatus: { research: 0, shadow: 0, production: 0, idea: 0, rejected: 0, deprecated: 0 },
    recent7d: {
      from: '',
      to: '',
      edgesAdded: 0,
      analogsAdded: 0,
      currentFormalSamples: 0,
      sampleDelta: null,
      sampleDeltaReason: '研究サマリーを読み込めないため増分を表示できません。',
    },
    readiness: { promotionReadyEdgeIds: [], holdoutReadyEdgeIds: [] },
  },
  researchItems: [],
  formalEdges: [],
  timeline: [],
  checkpoint: null,
  warning: '研究サマリーを読み込めませんでした。生成データを確認してください。',
}

const ITEM_STATUSES = new Set<OwnerResearchItemStatus>([
  'captured', 'triage', 'investigating', 'synthesized', 'resolved', 'parked', 'archived',
])
const QUESTION_STATUSES = new Set<OwnerResearchQuestionStatus>([
  'open', 'partially_answered', 'answered', 'blocked', 'obsolete',
])
const EDGE_STATUSES = new Set<OwnerFormalEdgeStatus>([
  'idea', 'research', 'shadow', 'production', 'rejected', 'deprecated',
])
const EDGE_PRIORITIES = new Set(['S', 'A', 'B', 'C'])
const GATE_STATES = new Set<OwnerGateState>(['pass', 'fail', 'unknown'])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isQuestion(value: unknown): value is OwnerResearchQuestionSummary {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.question === 'string'
    && typeof value.status === 'string'
    && QUESTION_STATUSES.has(value.status as OwnerResearchQuestionStatus)
    && typeof value.createdAt === 'string'
    && (value.lastReviewedAt === undefined || typeof value.lastReviewedAt === 'string')
}

function isItem(value: unknown): value is OwnerResearchItemSummary {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.status === 'string'
    && ITEM_STATUSES.has(value.status as OwnerResearchItemStatus)
    && typeof value.origin === 'string'
    && typeof value.summary === 'string'
    && typeof value.createdAt === 'string'
    && (value.lastReviewedAt === undefined || typeof value.lastReviewedAt === 'string')
    && Array.isArray(value.families)
    && value.families.every((family) => isObject(family) && typeof family.id === 'string' && typeof family.title === 'string')
    && Array.isArray(value.questions)
    && value.questions.every(isQuestion)
}

function isEdge(value: unknown): value is OwnerFormalEdgeSummary {
  if (!isObject(value) || !isObject(value.samples) || !isObject(value.gate)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.title === 'string'
    && typeof value.status === 'string'
    && EDGE_STATUSES.has(value.status as OwnerFormalEdgeStatus)
    && typeof value.priority === 'string'
    && EDGE_PRIORITIES.has(value.priority)
    && typeof value.confidence === 'number'
    && Number.isFinite(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 1
    && typeof value.hypothesis === 'string'
    && typeof value.hypothesisPreview === 'string'
    && typeof value.lastUpdate === 'string'
    && (value.lastResearchAt === null || typeof value.lastResearchAt === 'string')
    && isStringArray(value.knownFindings)
    && isStringArray(value.nextActions)
    && isNonNegativeInteger(value.samples.current)
    && isNonNegativeInteger(value.samples.required)
    && isNonNegativeInteger(value.samples.analogCurrent)
    && isNonNegativeInteger(value.samples.analogRequired)
    && isNonNegativeInteger(value.gate.pass)
    && isNonNegativeInteger(value.gate.fail)
    && isNonNegativeInteger(value.gate.unknown)
    && isNonNegativeInteger(value.gate.total)
    && value.gate.pass + value.gate.fail + value.gate.unknown === value.gate.total
    && Array.isArray(value.verificationGaps)
    && value.verificationGaps.every((gap) => isObject(gap)
      && typeof gap.key === 'string'
      && typeof gap.state === 'string'
      && GATE_STATES.has(gap.state as OwnerGateState)
      && (gap.explanation === null || typeof gap.explanation === 'string'))
    && isStringArray(value.requiredData)
}

function isTimelineEntry(value: unknown): value is OwnerResearchTimelineEntry {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && typeof value.at === 'string'
    && typeof value.type === 'string'
    && (value.edgeId === undefined || typeof value.edgeId === 'string')
    && typeof value.summary === 'string'
    && isStringArray(value.findings)
    && isStringArray(value.dataGaps)
    && isStringArray(value.nextActions)
    && (value.rejectionReason === undefined || typeof value.rejectionReason === 'string')
}

function isCheckpoint(value: unknown): value is OwnerResearchCheckpointSummary {
  if (!isObject(value)) return false
  return isNonNegativeInteger(value.sequence)
    && typeof value.savedAt === 'string'
    && (value.researchedEdgeId === undefined || typeof value.researchedEdgeId === 'string')
    && typeof value.researchDone === 'string'
    && isStringArray(value.dataGaps)
    && Array.isArray(value.nextCandidates)
    && value.nextCandidates.every((candidate) => isObject(candidate)
      && typeof candidate.edgeId === 'string'
      && typeof candidate.why === 'string')
    && isStringArray(value.openQuestions)
}

function isOverview(value: unknown): value is OwnerResearchOverview {
  if (!isObject(value) || !isObject(value.edgeStatus) || !isObject(value.recent7d) || !isObject(value.readiness)) return false
  const statusCounts = ['research', 'shadow', 'production', 'idea', 'rejected', 'deprecated']
  return typeof value.asOf === 'string'
    && statusCounts.every((key) => isNonNegativeInteger(value.edgeStatus[key]))
    && typeof value.recent7d.from === 'string'
    && typeof value.recent7d.to === 'string'
    && isNonNegativeInteger(value.recent7d.edgesAdded)
    && isNonNegativeInteger(value.recent7d.analogsAdded)
    && isNonNegativeInteger(value.recent7d.currentFormalSamples)
    && value.recent7d.sampleDelta === null
    && typeof value.recent7d.sampleDeltaReason === 'string'
    && isStringArray(value.readiness.promotionReadyEdgeIds)
    && isStringArray(value.readiness.holdoutReadyEdgeIds)
}

function parseSummary(value: unknown): OwnerResearchSummary | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null
  if (typeof value.generatedAt !== 'string') return null
  if (value.latestResearchAt !== null && typeof value.latestResearchAt !== 'string') return null
  if (!isObject(value.integrity) || (value.integrity.status !== 'ok' && value.integrity.status !== 'attention')) return null
  if (!isNonNegativeInteger(value.integrity.issueCount)
    || !isNonNegativeInteger(value.integrity.errorCount)
    || !isNonNegativeInteger(value.integrity.warningCount)
    || !isNonNegativeInteger(value.integrity.knowledgeIssueCount)) return null
  if (value.integrity.errorCount + value.integrity.warningCount !== value.integrity.issueCount) return null
  if (!isObject(value.counts)) return null
  if (!isNonNegativeInteger(value.counts.researchItems)
    || !isNonNegativeInteger(value.counts.activeResearchItems)
    || !isNonNegativeInteger(value.counts.unresolvedQuestions)
    || !isNonNegativeInteger(value.counts.researchFamilies)
    || !isNonNegativeInteger(value.counts.formalEdges)
    || !isNonNegativeInteger(value.counts.activeFormalEdges)) return null
  if (!isOverview(value.overview)) return null
  if (!Array.isArray(value.researchItems) || !value.researchItems.every(isItem)) return null
  if (!Array.isArray(value.formalEdges) || !value.formalEdges.every(isEdge)) return null
  if (!Array.isArray(value.timeline) || !value.timeline.every(isTimelineEntry)) return null
  if (value.checkpoint !== null && !isCheckpoint(value.checkpoint)) return null

  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    latestResearchAt: value.latestResearchAt as string | null,
    integrity: value.integrity as OwnerResearchSummary['integrity'],
    counts: value.counts as OwnerResearchSummary['counts'],
    overview: value.overview,
    researchItems: value.researchItems,
    formalEdges: value.formalEdges,
    timeline: value.timeline,
    checkpoint: value.checkpoint,
    warning: null,
  }
}

export function loadOwnerResearchSummary(): OwnerResearchSummary {
  if (!existsSync(DATA_PATH)) return FALLBACK
  try {
    const parsed = parseSummary(JSON.parse(readFileSync(DATA_PATH, 'utf-8')))
    return parsed ?? FALLBACK
  } catch {
    return FALLBACK
  }
}
