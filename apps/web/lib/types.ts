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
