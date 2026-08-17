export type GeneratedStockInput = {
  code: string
  name: string
  market?: string | null
  sector?: string | null
  price?: number | null
  previousClose?: number | null
  change?: number | null
  changeRate?: number | null
  per?: number | null
  pbr?: number | null
  dividendYield?: number | null
  marketCap?: number | null
  score?: number | null
  rank?: string | null
  reasons?: string[]
  updatedAt?: string | null
}

function isOptionalStringOrNull(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string'
}

function isOptionalFiniteNumberOrNull(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value))
}

export function isGeneratedStockInput(value: unknown): value is GeneratedStockInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const stock = value as Record<string, unknown>
  return typeof stock.code === 'string'
    && stock.code.trim().length > 0
    && typeof stock.name === 'string'
    && stock.name.trim().length > 0
    && isOptionalStringOrNull(stock.market)
    && isOptionalStringOrNull(stock.sector)
    && isOptionalFiniteNumberOrNull(stock.price)
    && isOptionalFiniteNumberOrNull(stock.previousClose)
    && isOptionalFiniteNumberOrNull(stock.change)
    && isOptionalFiniteNumberOrNull(stock.changeRate)
    && isOptionalFiniteNumberOrNull(stock.per)
    && isOptionalFiniteNumberOrNull(stock.pbr)
    && isOptionalFiniteNumberOrNull(stock.dividendYield)
    && isOptionalFiniteNumberOrNull(stock.marketCap)
    && isOptionalFiniteNumberOrNull(stock.score)
    && isOptionalStringOrNull(stock.rank)
    && (stock.reasons === undefined || (Array.isArray(stock.reasons) && stock.reasons.every((item) => typeof item === 'string')))
    && isOptionalStringOrNull(stock.updatedAt)
}

export function normalizeGeneratedStocksInput(
  value: unknown,
): { rows: GeneratedStockInput[]; warning: string | null } {
  if (!Array.isArray(value)) return { rows: [], warning: 'stocks: invalid_root' }
  const rows = value.filter(isGeneratedStockInput)
  const invalidCount = value.length - rows.length
  return {
    rows,
    warning: invalidCount > 0 ? `stocks: invalid_rows ${invalidCount}` : null,
  }
}
