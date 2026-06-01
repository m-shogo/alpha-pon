import type { InternalSignal } from './display-mode'

export type StockCode = string

export type DataQuality = 'ok' | 'partial' | 'missing' | 'mock'

export type StockSnapshot = {
  code: StockCode
  name: string
  market: string | null
  sector: string | null
  price: number | null
  previousClose: number | null
  changeRate: number | null
  high52w: number | null
  low52w: number | null
  drawdownFromHigh52w: number | null
  per: number | null
  pbr: number | null
  roe: number | null
  dividendYield: number | null
  operatingProfitGrowth: number | null
  marketCap: number | null
  updatedAt: string | null
  dataQuality: DataQuality
}

export type WatchlistStock = {
  code: StockCode
  name: string
  theme: string[]
  watchPriceZones: { label: string; priceFrom: number | null; priceTo: number | null }[]
  dangerLines: { label: string; price: number | null; reason: string }[]
  memo: string
  thesis: string[]
  risks: string[]
  nextDataNeeded: string[]
}

export type DisclosureEvent = {
  id: string
  code: StockCode
  title: string
  publishedAt: string
  isPositive: boolean
  isDanger: boolean
  matchedKeywords: string[]
}

export type WorldEvent = {
  id: string
  title: string
  summary: string
  tags: string[]
  publishedAt: string
  relatedCodes: StockCode[]
}

export type Position = {
  code: StockCode
  name: string
  shares: number
  averageCost: number
  currentPrice: number | null
  marketValue: number | null
  unrealizedGain: number | null
  unrealizedGainPct: number | null
  positionWeightPct: number | null
  nisaType: 'nisa_growth' | 'nisa_accumulation' | 'taxable' | null
  boughtReason: string
  addCondition: string
  trimCondition: string
  exitCondition: string
  thesis: string[]
  invalidationLine: string
  nextEvent: string
  memo: string
}

export type AlertRank = 'S' | 'A' | 'B' | 'C'

export type AlertReason = {
  text: string
  strength: 'strong' | 'medium' | 'weak'
}

export type AlertRisk = {
  text: string
  severity: 'high' | 'medium' | 'low'
}

export type ActionSignal = InternalSignal

export type StockAlertResult = {
  code: StockCode
  name: string
  rank: AlertRank
  score: number
  actionSignal: ActionSignal
  displaySignal: string
  reasons: AlertReason[]
  risks: AlertRisk[]
  internalMemo: string
  publicMemo: string
  disclaimer: string
  dataQuality: DataQuality
  updatedAt: string
}

export type StockDecision = {
  signal: ActionSignal
  score: number
  message: string
  reasons: string[]
  risks: string[]
}
