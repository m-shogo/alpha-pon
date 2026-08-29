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

export interface OwnerResearchSummary {
  schemaVersion: 1
  generatedAt: string | null
  latestResearchAt: string | null
  integrity: { status: 'ok' | 'attention'; issueCount: number }
  counts: {
    researchItems: number
    activeResearchItems: number
    unresolvedQuestions: number
    researchFamilies: number
  }
  researchItems: OwnerResearchItemSummary[]
  warning: string | null
}

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'research-summary.json')

const FALLBACK: OwnerResearchSummary = {
  schemaVersion: 1,
  generatedAt: null,
  latestResearchAt: null,
  integrity: { status: 'attention', issueCount: 0 },
  counts: { researchItems: 0, activeResearchItems: 0, unresolvedQuestions: 0, researchFamilies: 0 },
  researchItems: [],
  warning: '研究サマリーを読み込めませんでした。生成データを確認してください。',
}

const ITEM_STATUSES = new Set<OwnerResearchItemStatus>([
  'captured', 'triage', 'investigating', 'synthesized', 'resolved', 'parked', 'archived',
])
const QUESTION_STATUSES = new Set<OwnerResearchQuestionStatus>([
  'open', 'partially_answered', 'answered', 'blocked', 'obsolete',
])

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
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

function parseSummary(value: unknown): OwnerResearchSummary | null {
  if (!isObject(value) || value.schemaVersion !== 1) return null
  if (typeof value.generatedAt !== 'string') return null
  if (value.latestResearchAt !== null && typeof value.latestResearchAt !== 'string') return null
  if (!isObject(value.integrity) || (value.integrity.status !== 'ok' && value.integrity.status !== 'attention')) return null
  if (!isNonNegativeInteger(value.integrity.issueCount)) return null
  if (!isObject(value.counts)) return null
  if (!isNonNegativeInteger(value.counts.researchItems)
    || !isNonNegativeInteger(value.counts.activeResearchItems)
    || !isNonNegativeInteger(value.counts.unresolvedQuestions)
    || !isNonNegativeInteger(value.counts.researchFamilies)) return null
  if (!Array.isArray(value.researchItems) || !value.researchItems.every(isItem)) return null

  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    latestResearchAt: value.latestResearchAt as string | null,
    integrity: value.integrity as OwnerResearchSummary['integrity'],
    counts: value.counts as OwnerResearchSummary['counts'],
    researchItems: value.researchItems,
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
