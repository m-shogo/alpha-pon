import type { InternalSignal } from './display-mode'
import type { StockDecision } from './types'

type PositionStatus = 'not_owned' | 'owned'
type ValuationRisk = 'low' | 'middle' | 'high' | 'unknown'

export type StockDecisionInput = {
  code: string
  name: string
  price: number | null
  averageCost?: number | null
  positionStatus: PositionStatus
  positionWeightPct: number
  drawdownFromHigh52wPct: number | null
  unrealizedGainPct?: number | null
  operatingProfitGrowthPct: number | null
  hasDownwardRevision: boolean
  hasAccountingOrAuditRisk: boolean
  thesisStillValid: boolean
  isBeforeEarnings: boolean
  valuationRisk: ValuationRisk
}

export function judgeStockAction(input: StockDecisionInput): StockDecision {
  const reasons: string[] = []
  const risks: string[] = []
  let score = 50

  if (input.price == null) {
    return {
      signal: 'NO_ACTION',
      score: 0,
      message: '株価未取得のため判断しない',
      reasons: [],
      risks: ['株価データ未取得'],
    }
  }

  if (input.hasAccountingOrAuditRisk) {
    return {
      signal: 'DANGER',
      score: 10,
      message: '会計・監査リスクがあるため、まず一次情報確認',
      reasons: [],
      risks: ['会計・監査リスクあり'],
    }
  }

  if (input.hasDownwardRevision) {
    score -= 30
    risks.push('下方修正あり')
  }

  if (!input.thesisStillValid) {
    return {
      signal: 'EXIT_WATCH',
      score: 20,
      message: '投資仮説が崩れている可能性。撤退検討',
      reasons: [],
      risks: ['買った理由が崩れている'],
    }
  }

  if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct >= 10) {
    score += 20
    reasons.push('営業利益が成長している')
  }

  if (
    input.drawdownFromHigh52wPct !== null &&
    input.drawdownFromHigh52wPct <= -15 &&
    input.drawdownFromHigh52wPct >= -35
  ) {
    score += 20
    reasons.push('高値から適度に下落している')
  }

  if (input.valuationRisk === 'high') {
    score -= 15
    risks.push('バリュエーション過熱の可能性')
  }

  if (input.isBeforeEarnings) {
    score -= 5
    risks.push('決算前で不確定要素がある')
  }

  if (input.positionWeightPct >= 25) {
    return {
      signal: 'NO_ACTION',
      score,
      message: '保有比率が高いため、買い足しよりリスク管理優先',
      reasons,
      risks: [...risks, 'ポジション比率が高い'],
    }
  }

  if (input.positionStatus === 'not_owned' && score >= 75) {
    return { signal: 'ENTRY_WATCH', score, message: '新規監視候補', reasons, risks }
  }

  if (
    input.positionStatus === 'owned' &&
    score >= 75 &&
    (input.unrealizedGainPct ?? 0) <= 5
  ) {
    return { signal: 'ADD_WATCH', score, message: '買い足し監視候補', reasons, risks }
  }

  if (
    input.positionStatus === 'owned' &&
    (input.unrealizedGainPct ?? 0) >= 25 &&
    input.valuationRisk === 'high'
  ) {
    return {
      signal: 'TRIM_WATCH',
      score,
      message: '一部売り検討候補',
      reasons,
      risks: [...risks, '含み益拡大後の過熱に注意'],
    }
  }

  if (input.positionStatus === 'owned') {
    return { signal: 'HOLD', score, message: '保有継続で監視', reasons, risks }
  }

  return { signal: 'NO_ACTION', score, message: '今は無理に動かない', reasons, risks }
}

export function scoreToRank(score: number): 'S' | 'A' | 'B' | 'C' {
  if (score >= 85) return 'S'
  if (score >= 70) return 'A'
  if (score >= 55) return 'B'
  return 'C'
}

export function signalPriority(signal: InternalSignal): number {
  const order: Record<InternalSignal, number> = {
    DANGER: 0,
    EXIT_WATCH: 1,
    TRIM_WATCH: 2,
    ENTRY_WATCH: 3,
    ADD_WATCH: 4,
    HOLD: 5,
    NO_ACTION: 6,
  }
  return order[signal]
}
