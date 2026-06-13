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

export type SpecialSituationOpsSummary = {
  generatedAt: string
  today: string
  healthStatus: 'ok' | 'needs_attention' | 'action_required'
  actionItems: Array<{
    priority: 'urgent' | 'attention' | 'info' | 'ok'
    category: string
    title: string
    detail: string
    command?: string
  }>
  coverage: {
    totalCandidates: number
    withSpecialOutcome: number
    noOutcomeRecord: number
    noOutcomeRecordCodes: string[]
    needSeed: boolean
  }
  reviewDue: {
    overdue: number
    historicalSeedOverdue: number
    dueToday: number
    dueThisWeek: number
    notDueYet: number
  }
  backfill: {
    structurallyUpdatable: number
    historicalUpdatable: number
    recentUpdatable: number
    notDueYet: number
  }
  outcomeStats: {
    sampleTooSmall: number
    hasStats: number
  }
  mixedOutcomes: {
    count: number
  }
}

export type HypothesisOutcomeIntegrity = {
  generatedAt: string
  status: 'ok' | 'duplicate_found' | 'db_unavailable' | 'parse_error' | 'action_required'
  jsonl: {
    path?: string
    exists?: boolean
    totalRows: number
    duplicateGroups: Array<{ key: string; count: number }>
    parseErrors?: Array<{ lineNumber: number; preview: string; message: string }>
  }
  sqlite: {
    path?: string
    exists?: boolean
    totalRows: number | null
    uniqueIndexExists: boolean
    duplicateGroups: Array<{ key: string; count: number }>
    error: string | null
  }
  nextAction: string
}

export type LegendProCommittee = {
  generatedAt: string | null
  decisions: Array<{
    code?: string
    name?: string
    originalFinalLabel?: string | null
    finalLabel?: string
    finalScore?: number
    consensus?: {
      agreementLevel?: string
    } | null
    disagreements?: unknown[]
    missingEvidence?: string[]
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

export type WorldImpactDataAvailability = 'ok' | 'partial' | 'missing' | 'priceDataPending'

export type WorldImpactMechanism =
  | 'demand' | 'supply' | 'cost' | 'fx' | 'rates' | 'regulation' | 'energy' | 'defense'
  | 'semiconductor' | 'consumer' | 'travel' | 'logistics' | 'ip_brand' | 'geopolitical'
  | 'climate_disaster' | 'unknown'

export type WorldImpactMissReason =
  | 'already_priced_in' | 'weak_linkage' | 'macro_overpowered' | 'wrong_lag'
  | 'wrong_direction' | 'company_specific_offset' | 'data_insufficient' | 'unclear'

export type WorldImpactReview = {
  schemaVersion: 1 | 2
  reviewKey: string
  eventId: string
  eventDate: string
  topic: string
  source: string | null
  sourceQuality: 'official' | 'tier1' | 'tier2' | 'unknown'
  namedEntities: string[]
  affectedSectors: string[]
  affectedCompanyCodes: string[]
  expectedMechanism: string
  secondOrderEffect: string
  counterArgument: string
  timeLag: string
  expectedHorizon: '1d' | '1w' | '1m' | string
  dataAvailability: WorldImpactDataAvailability
  outcomes: Array<{
    horizon: '1d' | '1w' | '1m' | string
    dueAt: string
    result: 'hit' | 'miss' | 'inverse' | 'too_early' | 'unclear' | 'insufficient_data' | 'unknown' | null
    expectedDirection: 'up' | 'down' | 'sideways' | 'mixed' | 'unknown'
    actualDirection: 'up' | 'down' | 'sideways' | 'mixed' | 'unknown'
    dataAvailability: WorldImpactDataAvailability
    returnPct: number | null
    topixReturnPct: number | null
    relativeToTopixPct: number | null
    missReason?: WorldImpactMissReason | null
    missedSignals: string[]
    lesson: string | null
    // v3 自動評価フィールド（v1/v2 レコードでは省略されうる・全て null 安全に扱う）
    evaluatedAt?: string | null
    evaluationAsOf?: string | null
    priceStartDate?: string | null
    priceEndDate?: string | null
    priceStart?: number | null
    priceEnd?: number | null
    priceReturnPct?: number | null
    benchmarkCode?: string | null
    benchmarkReturnPct?: number | null
    relativeReturnPct?: number | null
    directionMatched?: boolean | null
    expectedLagDays?: number | null
    actualLagDays?: number | null
    lagMatched?: boolean | null
    movementMagnitude?: number | null
    evidence?: string[]
    evaluationNotes?: string | null
    autoMissReason?: string | null
    manualMissReason?: WorldImpactMissReason | null
    confidenceAtPrediction?: number | null
    mechanismAtPrediction?: WorldImpactMechanism[]
    sourceReliabilityAtPrediction?: string | null
  }>
  missedSignals: string[]
  lesson: string | null
  createdAt: string
  updatedAt: string
  // v2 検証可能仮説フィールド（v1 レコードでは省略されうる）
  mechanisms?: WorldImpactMechanism[]
  impactPath?: {
    event: string
    mechanisms: WorldImpactMechanism[]
    themes: string[]
    companies: string[]
    note: string
  } | null
  direction?: 'positive' | 'negative' | 'mixed' | 'unclear'
  confidence?: number | null
  expectedLagDays?: number | null
  thesis?: string
  falsification?: string
  watchSignals?: string[]
  riskFactors?: string[]
  reviewDueAt?: string | null
  reviewStatus?: 'pending' | 'reviewed' | 'skipped' | 'insufficient_data'
}

export type WorldImpactAudit = {
  schemaVersion: 1
  generatedAt: string
  healthStatus: 'ok' | 'needs_attention' | 'action_required'
  totalReviews: number
  pendingReviews: number
  overdueReviews: number
  missingCounterArguments: number
  missingMechanisms: number
  dataUnavailable: number
  priceDataPending: number
  sourceQualityUnknown: number
  unknownMatchedAsHit: number
  // v2 監査項目（旧 audit JSON では省略されうる）
  insufficientData?: number
  confidenceMissing?: number
  mechanismUnknown?: number
  falsificationMissing?: number
  jsonlParseErrors?: number
  latestMismatch?: number
  reviewStatusCounts?: Record<string, number>
  outcomeResultCounts?: Record<string, number>
  missReasonCounts?: Record<string, number>
  duplicateKeys?: Array<{ key: string; count: number }>
  // v3 監査項目（省略されうる）
  dueWithoutOutcome?: number
  evaluatedAtMissing?: number
  evaluationAsOfMissing?: number
  resultEnumViolations?: number
  directionEnumViolations?: number
  confidenceOutOfRange?: number
  autoMissReasonViolations?: number
  missReasonConflicts?: number
  insufficientDataWithReturn?: number
  judgedWithoutReturn?: number
  priorityIssues: Array<{
    severity: 'urgent' | 'attention' | 'info'
    category: string
    title: string
    detail: string
  }>
}

import type {
  UniverseCandidate,
  UniverseScanMetadata,
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
    themeCompanyFitReview?: {
      themeId: string
      themeLabel: string
      themeWasRight: string
      selectedCompanyFit: string
      fitSummary: string
      whyThemeMayBeRight: string[]
      whyCompanyMayBeWrong: string[]
      betterCompanyCandidates: Array<{
        code: string
        name: string
        reason: string
        relation: string
      }>
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
    themeCompanyFitSummary?: {
      themeLabel: string
      selectedCompanyFit: string
      fitSummary: string
      betterCompanyCodes: string[]
    }
    listingInfo?: Omit<SpecialSituationListingInfo, 'ipoPrice' | 'firstPrice' | 'source' | 'sourceCheckedAt'>
  }>
  outcomeCoverageAudit?: {
    generatedAt: string
    totalMatchedOutcomes: number
    coverage: {
      withResult: number
      withReturn1w: number
      withReturn1m: number
      withTopixRelative1m: number
      withAnyReturn: number
    }
    missing: {
      result: number
      return1w: number
      return1m: number
      topixRelative1m: number
    }
    byCode: Array<{
      code: string
      name: string
      matchedOutcomes: number
      missingResult: number
      missingReturn1w: number
      missingReturn1m: number
      missingTopixRelative1m: number
      nextAction: string
    }>
    notes: string[]
  }
  outcomeStats?: Array<{
    groupType: string
    groupKey: string
    sampleSize: number
    sampleTooSmall: boolean
    hitRate: number | null
    avgReturn1w: number | null
    avgReturn1m: number | null
    avgTopixRelative1m: number | null
    note: string
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
  universeScan?: UniverseScanMetadata | null
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
  specialSituationOps?: SpecialSituationOpsSummary | null
  hypothesisOutcomeIntegrity?: HypothesisOutcomeIntegrity | null
  worldImpactReviews?: WorldImpactReview[]
  worldImpactAudit?: WorldImpactAudit | null
  legendProCommittee?: LegendProCommittee | null
  stockProCommitteeJson?: LegendProCommittee | null
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
