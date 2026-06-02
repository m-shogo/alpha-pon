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

export function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

export function daysBetweenJst(fromDate: string, toDate: string): number | null {
  const from = Date.parse(`${fromDate.slice(0, 10)}T00:00:00+09:00`)
  const to = Date.parse(`${toDate.slice(0, 10)}T00:00:00+09:00`)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.ceil((to - from) / 86400000)
}

export function todayJstDate(): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

export function formatDueLabel(dueDate: string, baseDate = todayJstDate()): { label: string; overdue: boolean } {
  const diff = daysBetweenJst(baseDate, dueDate)
  if (diff == null) return { label: '期限不明', overdue: false }
  if (diff < 0) return { label: `${Math.abs(diff)}日超過`, overdue: true }
  if (diff === 0) return { label: '今日', overdue: true }
  return { label: `残${diff}日`, overdue: false }
}
