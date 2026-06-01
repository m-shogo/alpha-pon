// ユニバース候補・仮説・検証の型定義（apps/web 用）
// src/universe.ts と同じ形状。JSON で連携する。

export type UniverseScreeningStatus = 'monitoring' | 'escalated' | 'dismissed'

export type UniverseCandidate = {
  code: string
  name: string
  sector: string | null
  detectedAt: string
  currentPrice: number | null
  high52w: number | null
  drawdownPct: number | null
  operatingProfitYoY: number | null
  hasDownwardRevision: boolean
  hasNegativeFlag: boolean
  hasRecentDisclosure: boolean
  matchedWorldEventTags: string[]
  screeningScore: number
  warnings: string[]
  status: UniverseScreeningStatus
  dataSource: 'jquants' | 'mock'
}

export type HypothesisTimeframe = '1w' | '1m' | '3m'
export type HypothesisDirection = 'up' | 'down' | 'sideways' | 'unknown'
export type HypothesisStatus = 'open' | 'closed'
export type HypothesisResult = 'hit' | 'miss' | 'too_early' | 'invalidated' | 'unknown'
export type HypothesisLabel = '監視候補' | '検証候補' | '反証待ち'

export type StockCandidateHypothesis = {
  schemaVersion: 1
  code: string
  name: string
  detectedAt: string
  reviewDueAt: string
  reason: string
  expectedTimeframe: HypothesisTimeframe
  expectedDirection: HypothesisDirection
  confidence: number
  invalidationSignals: string[]
  evidenceNeeded: string[]
  relatedWorldEventIds: string[]
  relatedDisclosureIds: string[]
  status: HypothesisStatus
  label: HypothesisLabel
}

export type HypothesisOutcome = {
  schemaVersion: 1
  code: string
  name: string
  hypothesis: StockCandidateHypothesis
  evaluatedAt: string
  return1w: number | null
  return1m: number | null
  return3m: number | null
  topixReturn1m: number | null
  relativeToTopix1m: number | null
  result: HypothesisResult
  notes: string
  dataSource: 'jquants' | 'mock'
}

export type AccuracySummary = {
  total: number
  hit: number
  miss: number
  tooEarly: number
  unknown: number
  hitRate: number | null
  avgReturn1m: number | null
  avgTopixReturn1m: number | null
}

export type WorldContextRegime = {
  id: string
  level: string
  why: string
  watchCategories: string[]
  caution: string[]
}

export type WorldContext = {
  asOf: string
  mode: string
  summary: string
  activeRegimes: WorldContextRegime[]
  operatingRules: string[]
}
