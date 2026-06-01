const POSITIVE_KEYWORDS = [
  '上方修正',
  '増配',
  '自社株買い',
  '株式分割',
  '最高益',
  '業績予想の修正',
  '中期経営計画',
  '自己株式取得',
  '記念配当',
  '特別配当',
  '過去最高',
] as const

const DANGER_KEYWORDS = [
  '決算延期',
  '監査',
  '不適切',
  '不正',
  '第三者委員会',
  '特別調査委員会',
  '下方修正',
  '減配',
  '継続企業の前提',
  '債務超過',
  '重要な疑義',
  '調査委員会',
  '特別損失',
  '訴訟',
  '行政処分',
] as const

export type DisclosureClassification = {
  positive: boolean
  danger: boolean
  matchedPositive: string[]
  matchedDanger: string[]
  matchedKeywords: string[]
}

export function classifyDisclosureTitle(title: string): DisclosureClassification {
  const matchedPositive = POSITIVE_KEYWORDS.filter(k => title.includes(k))
  const matchedDanger = DANGER_KEYWORDS.filter(k => title.includes(k))

  return {
    positive: matchedPositive.length > 0,
    danger: matchedDanger.length > 0,
    matchedPositive,
    matchedDanger,
    matchedKeywords: [...matchedPositive, ...matchedDanger],
  }
}
