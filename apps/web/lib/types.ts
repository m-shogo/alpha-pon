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

export type RunCursorState = {
  jobName?: string
  offset?: number
  maxPerRun?: number
  total?: number
  updatedAt?: string
}

export type IpoThemeWatch = {
  generatedAt: string | null
  defaultAction?: string
  neverTreatAs?: string[]
  phases?: Array<{
    id: string
    label: string
    defaultAction: string
    focus?: string[]
    touchAvoidReasons?: string[]
  }>
  rules?: Array<{
    id: string
    label: string
    names?: string[]
    defaultAction: string
    phaseIds?: string[]
    touchAvoidReasons?: string[]
    evidenceNeeded?: string[]
    watchEvidence?: string[]
    japaneseSpilloverThemes?: string[]
    relatedCompanies?: Array<{ code: string; name: string; relation: string }>
  }>
  outcomeStats?: Array<{
    themeId: string
    phase: string
    relatedCompanyCode: string
    /** actionLabel (watch/log/ignore) */
    finalLabel: string
    /** result (hit/miss/too_early/etc) — sampleTooSmall=true の場合は強い判断に使わない */
    originalFinalLabel: string
    sampleSize: number
    sampleTooSmall: boolean
    hitRate: number | null
    avgReturn1w: number | null
    avgReturn1m: number | null
    avgTopixRelative1m: number | null
    phaseFromPriceSignal?: boolean
  }>
  worldEventHighlights?: Array<{
    title: string
    source: string
    publishedAt: string
    snippet: string
    relatedThemeIds: string[]
  }>
}

type SpecialSituationListingInfo = {
  listedAt?: string | null
  plannedListingAt?: string | null
  ipoPrice?: number | null
  firstPrice?: number | null
  lockupExpiryAt?: string | null
  firstEarningsAt?: string | null
  source?: string | null
  sourceCheckedAt?: string | null
  confidence: 'official' | 'reported' | 'rumor' | 'unknown'
}

export type SpecialSituationWatch = {
  generatedAt: string | null
  defaultAction?: string
  neverTreatAs?: string[]
  safetyRules?: string[]
  patterns?: Array<{
    id: string
    label: string
    description: string
    whyInteresting: string[]
    whyDangerous: string[]
    evidenceNeeded: string[]
  }>
  candidates?: Array<{
    code: string
    name: string
    patterns: string[]
    watchPhase: string
    finalLabel: string
    chanceLevel: 'none' | 'watch' | 'attention' | 'high'
    notificationEligible: boolean
    reasonSummary: string
    whyInteresting: string[]
    whyDangerous: string[]
    evidenceNeeded: string[]
    waitFor: string[]
    /** なぜ今見るのか */
    whyNow: string[]
    /** なぜ今はまだ待つのか */
    whyNotNow: string[]
    sellerPressureProfile?: {
      sellerType: string
      sellerName: string | null
      sellerMotivation: string
      remainingOverhang: string
      estimatedClearedAt: string | null
      whyItMatters: string[]
      evidenceNeeded: string[]
    }
    parentOrSponsor: string | null
    sellerPressure: string
    lockupRisk: string
    debtRisk: string
    capexRisk: string
    cycleRisk: string
    dilutionRisk: string
    listingInfo?: SpecialSituationListingInfo
    smallTicket?: {
      price: number | null
      minimumAmount: number | null
      isSmallTicket: boolean
      caution: string[]
    }
    outcomeStats?: {
      sampleSize: number
      sampleTooSmall: boolean
      hitRate: number | null
      avgReturn1w: number | null
      avgReturn1m: number | null
      avgTopixRelative1m: number | null
    }
  }>
  topChanceList?: Array<{
    code: string
    name: string
    finalLabel: string
    chanceLevel: string
    reasonSummary: string
    topReasons: string[]
    mainRisks: string[]
    nextCheck: string[]
    whyNow: string[]
    whyNotNow: string[]
    sellerPressureSummary?: {
      sellerType: string
      sellerName: string | null
      remainingOverhang: string
      topRisk: string | null
    }
    listingInfo?: Omit<SpecialSituationListingInfo, 'ipoPrice' | 'firstPrice' | 'source' | 'sourceCheckedAt'>
  }>
  referenceEvents?: Array<{
    eventName: string
    companyName: string
    eventType: string
    plannedDate: string | null
    actualDate: string | null
    confidence: 'official' | 'reported' | 'rumor' | 'unknown'
    source: string | null
    sourceCheckedAt: string | null
    relatedThemes: string[]
    relatedJapaneseCompanies: string[]
  }>
}

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
  runCursors?: Record<string, RunCursorState>
  readiness?: ReadinessReport | null
  ipoThemeWatch?: IpoThemeWatch | null
  specialSituationWatch?: SpecialSituationWatch | null
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
