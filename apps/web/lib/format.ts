type NullableNumber = number | null | undefined

function isValidNumber(value: NullableNumber): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatPrice(value: NullableNumber): string {
  if (!isValidNumber(value)) return '未取得'
  return `${value.toLocaleString('ja-JP')}円`
}

export function formatPercent(value: NullableNumber, showSign = false): string {
  if (!isValidNumber(value)) return '未取得'
  const sign = showSign && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatNumber(value: NullableNumber): string {
  if (!isValidNumber(value)) return '未取得'
  return value.toLocaleString('ja-JP')
}

export function formatRatio(value: NullableNumber, suffix = '倍'): string {
  if (!isValidNumber(value)) return '未取得'
  return `${value.toFixed(2)}${suffix}`
}

export function formatMarketCap(value: NullableNumber): string {
  if (!isValidNumber(value)) return '未取得'
  if (value >= 1_0000_0000_0000) return `${(value / 1_0000_0000_0000).toFixed(1)}兆円`
  if (value >= 1_0000_0000) return `${(value / 1_0000_0000).toFixed(1)}億円`
  return `${value.toLocaleString('ja-JP')}円`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '未取得'
  return value
}
