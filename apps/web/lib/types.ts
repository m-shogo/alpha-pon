export type ScoreKey =
  | 'structuralEvent'
  | 'supplyDemand'
  | 'valuation'
  | 'theme'
  | 'businessSafety'
  | 'aiReview'

export type Score = Record<ScoreKey, number>

export type CandidateStatus =
  | 'research'
  | 'watch'
  | 'candidate'
  | 'active'
  | 'ignore'
  | 'expired'

export type Priority = 'S' | 'A' | 'B' | 'C'

export type AlertLevel = 'urgent' | 'daily' | 'log' | 'ignore'

export type Candidate = {
  code: string
  name: string
  market: string
  status: CandidateStatus
  priority: Priority
  tags: string[]
  price: number | null
  changePct: number | null
  drawdownPct: number | null
  score: Score
  reasons: string[]
  negativeReasons: string[]
  nextToSee: string[]
  triggeredRule: string
  lastNotifiedAt: string | null
  sparkline?: number[]
}

export type GeneratedReport = {
  key: string
  label: string
  path: string
  available: boolean
  excerpt: string[]
  fullContent?: string
}

export type PrimaryDisclosureReview = {
  sourceCoverage: {
    tdnetCount: number
    edinetCount: number
    hasPrimarySource: boolean
    scannedEdinetDates?: string[]
    fetchErrorCount?: number
  }
  decision: 'confirmed' | 'caution' | 'block' | 'missing'
  positives: string[]
  warnings: string[]
  blockers: string[]
  evidenceNeeded: string[]
  items: Array<{
    source: string
    title: string
    publishedAt: string
    severity: 'positive' | 'neutral' | 'caution' | 'blocker'
    category: string
    url: string
  }>
}

export type CompanyMemoryRecord = {
  schemaVersion: 1
  code: string
  name: string
  firstSeenAt: string
  lastReviewedAt: string
  watchReason: string[]
  knownRisks: string[]
  strongRules: string[]
  weakRules: string[]
  recurringWarnings: string[]
  recentOutcomes: Array<{
    createdAt: string
    evaluatedAt: string
    timeframe?: string
    lessonTitle: string
    direction: string
    quality: string
    relativeReturnPct?: number
    maxDrawdownPct?: number
  }>
  notes: string[]
}

export type ReadinessReport = {
  generatedAt: string
  overallScore: number
  overallStatus: 'done' | 'partial' | 'blocked' | 'not_started' | string
  blockers: string[]
  items: Array<{
    id: string
    label: string
    status: 'done' | 'partial' | 'blocked' | 'not_started' | string
    score: number
    evidence: string[]
    nextActions: string[]
  }>
}

export type DataQualityReason =
  | 'jquants_delayed'
  | 'tdnet_unavailable'
  | 'financial_partial'
  | 'outcome_insufficient'
  | 'price_missing'
  | 'news_partial'

export type DataQualityDetail = {
  level: 'full' | 'partial' | 'low'
  reasons: DataQualityReason[]
  updatedAt: string
}

export type ScoreBreakdownDetail = {
  companyCode: string
  totalScore: number
  label: string
  positives: string[]
  negatives: string[]
  missingData: string[]
  confidence: 'low' | 'medium' | 'high'
}

import type {
  UniverseCandidate,
  StockCandidateHypothesis,
  HypothesisOutcome,
  AccuracySummary,
  WorldContext,
} from '@/types/universe'

export type AlphaPonGeneratedData = {
  generatedAt: string | null
  headline: string
  summary: {
    strategic: string
    pipeline: string
    committee: string
    roadmap: string[]
    refresh: string[]
  }
  reports: GeneratedReport[]
  candidates: Candidate[]
  // ユニバース・仮説・検証フィールド（省略可 = データ生成前は空）
  universeCandidates?: UniverseCandidate[]
  hypothesisPredictions?: StockCandidateHypothesis[]
  hypothesisOutcomes?: HypothesisOutcome[]
  accuracySummary?: AccuracySummary | null
  meta?: {
    source?: string
    version?: string
    warnings?: string[]
  } | null
  worldContext?: WorldContext | null
  generatedCompanyRules?: import('@/lib/stock/rules/types').GeneratedStockRule[]
  positions?: import('@/lib/stock/types').Position[]
  companyMemory?: CompanyMemoryRecord[]
  companyMemoryByCode?: Record<string, CompanyMemoryRecord>
  primaryDisclosureReviews?: Record<string, PrimaryDisclosureReview>
  dataQualityByCode?: Record<string, {
    dataQuality: string
    warnings: string[]
    quality?: DataQualityDetail
    scoreBreakdown?: ScoreBreakdownDetail
  }>
  runCursors?: Record<string, unknown>
  readiness?: ReadinessReport | null
  pipelineStatus?: {
    date?: string
    status?: string
    startedAt?: string
    endedAt?: string
    failedSteps?: string
    completeWrapperFailedSteps?: string[]
    completeWrapperRunAt?: string
    steps?: Array<{
      name: string
      criticality: string
      status: string
      code: number
      durationSec: number
    }>
  } | null
}

export type FeedItem = {
  code: string
  name: string
  level: 'urgent' | 'daily' | 'log'
  score: number
  delta: number
  time: string
  date: string
  reason: string
  suppressed: boolean
}
