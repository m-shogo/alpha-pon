import type { AlphaPonStock } from '@/types/alpha-pon'
import { StockCard } from './StockCard'

type Props = {
  stocks: AlphaPonStock[]
}

export function StockList({ stocks }: Props) {
  if (stocks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
        <p>表示できる銘柄データがありません</p>
        <p style={{ marginTop: 8, fontSize: 12 }}>
          ルートで{' '}
          <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
            pnpm ui:data
          </code>{' '}
          を実行してください
        </p>
      </div>
    )
  }

  const sorted = [...stocks].sort((a, b) => {
    const scoreA = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : -Infinity
    const scoreB = typeof b.score === 'number' && Number.isFinite(b.score) ? b.score : -Infinity
    return scoreB - scoreA
  })

  return (
    <div>
      {sorted.map((stock, i) => (
        <StockCard key={stock.code} stock={stock} rank={i} />
      ))}
    </div>
  )
}
