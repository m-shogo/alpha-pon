import type { Score, AlertLevel } from './types'

export const SCORE_CATS = [
  { key: 'structuralEvent' as const, label: '構造イベント', max: 30, color: '#B6A4E6' },
  { key: 'supplyDemand'   as const, label: '需給改善',     max: 25, color: '#FF7EA6' },
  { key: 'valuation'      as const, label: '割安感',       max: 15, color: '#7EC8E3' },
  { key: 'theme'          as const, label: 'テーマ性',     max: 15, color: '#F2B945' },
  { key: 'businessSafety' as const, label: '業績安全性',   max: 10, color: '#6FD3AC' },
  { key: 'aiReview'       as const, label: 'AI/手動評価',  max: 5,  color: '#BCABB3' },
]

export function calcTotal(score: Score): number {
  return Object.values(score).reduce((a, b) => a + b, 0)
}

export function calcLevel(total: number): AlertLevel {
  if (total >= 85) return 'urgent'
  if (total >= 70) return 'daily'
  if (total >= 50) return 'log'
  return 'ignore'
}
