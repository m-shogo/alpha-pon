import assert from 'node:assert/strict'
import { normalizeGeneratedStocksInput } from '../apps/web/lib/generated-stock-input.js'

const valid = {
  code: '8136',
  name: 'サンプル',
  market: 'Prime',
  sector: '卸売業',
  price: 1200,
  changeRate: 1.5,
  score: 72,
  reasons: ['一次情報確認済み'],
}

assert.deepEqual(normalizeGeneratedStocksInput({}), { rows: [], warning: 'stocks: invalid_root' })
assert.deepEqual(normalizeGeneratedStocksInput([valid]), { rows: [valid], warning: null })
assert.deepEqual(
  normalizeGeneratedStocksInput([valid, { ...valid, code: '9999', reasons: 'broken' }]),
  { rows: [valid], warning: 'stocks: invalid_rows 1' },
)
assert.deepEqual(
  normalizeGeneratedStocksInput([valid, { ...valid, code: '9998', price: '1200' }]),
  { rows: [valid], warning: 'stocks: invalid_rows 1' },
)
assert.deepEqual(
  normalizeGeneratedStocksInput([valid, null, []]),
  { rows: [valid], warning: 'stocks: invalid_rows 2' },
)

console.log('generated stock input: malformed rows are isolated before Stocks page rendering OK')
