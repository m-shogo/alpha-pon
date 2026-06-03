import type { InternalSignal } from '../display-mode'

export type PriceZone = {
  label: string
  priceFrom: number | null
  priceTo: number | null
  reason: string
}

export type DangerLine = {
  label: string
  price: number | null
  reason: string
}

export type PriceSignal = {
  code: string
  asOf: string
  close: number | null
  change5dPct: number | null
  change20dPct: number | null
  topixChange5dPct: number | null
  topixChange20dPct: number | null
  relativeTopix5dPct: number | null
  relativeTopix20dPct: number | null
  volumeSpikeRatio: number | null
  source: 'jquants' | 'external' | 'company_memory' | 'missing'
  quality: 'exact' | 'fallback' | 'stale' | 'missing'
}

export type PriceRiskWarning = {
  level: 'info' | 'warning' | 'block'
  reason: string
  evidence: string[]
}

export type GenerateStockRuleInput = {
  code: string
  name: string
  currentPrice: number | null
  previousClose: number | null
  high52w: number | null
  low52w: number | null
  drawdownFromHigh52wPct: number | null
  recentReturn5dPct: number | null
  recentReturn20dPct: number | null
  recentReturn60dPct: number | null
  per: number | null
  pbr: number | null
  roe: number | null
  revenueGrowthPct: number | null
  operatingProfitGrowthPct: number | null
  operatingMarginPct: number | null
  dividendYieldPct: number | null
  hasDangerDisclosure: boolean
  hasPositiveDisclosure: boolean
  isBeforeEarnings: boolean
  isAfterEarnings: boolean
  worldEventTags: string[]
  companyTheme: string[]
  currentThesis: string[]
  knownRisks: string[]
  priceSignal?: PriceSignal
  priceRiskWarnings?: PriceRiskWarning[]
  positionStatus: 'not_owned' | 'owned'
  averageCost?: number | null
  unrealizedGainPct?: number | null
  positionWeightPct?: number | null
}

export type GeneratedStockRule = {
  generatedRuleId: string
  code: string
  name: string
  generatedAt: string
  thesis: string[]
  actionSignal: InternalSignal
  confidence: number
  watchPriceZones: PriceZone[]
  addWatchZones: PriceZone[]
  trimWatchZones: PriceZone[]
  dangerLines: DangerLine[]
  invalidationSignals: string[]
  evidenceNeeded: string[]
  reasons: string[]
  risks: string[]
  priceSignal?: PriceSignal
  priceRiskWarnings?: PriceRiskWarning[]
  privateMemo: string
  publicMemo: string
  reviewDueAt: string
}
