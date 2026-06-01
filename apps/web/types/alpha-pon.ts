export type Nullable<T> = T | null | undefined

export type AlphaPonStock = {
  code: string
  name: string
  market?: Nullable<string>
  sector?: Nullable<string>

  price?: Nullable<number>
  previousClose?: Nullable<number>
  change?: Nullable<number>
  changeRate?: Nullable<number>

  per?: Nullable<number>
  pbr?: Nullable<number>
  dividendYield?: Nullable<number>
  marketCap?: Nullable<number>

  score?: Nullable<number>
  rank?: Nullable<string>
  reasons?: string[]

  updatedAt?: Nullable<string>
}

export type AlphaPonGeneratedData = {
  generatedAt: string
  stocks: AlphaPonStock[]
  meta?: {
    source?: string
    version?: string
    warnings?: string[]
  }
}
