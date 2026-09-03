import type { AlphaPonStock } from '@/types/alpha-pon'
import { StockCard } from './StockCard'
import styles from './StockList.module.css'

type Props = {
  stocks: AlphaPonStock[]
}

export function StockList({ stocks }: Props) {
  if (stocks.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>表示できる銘柄データがありません</div>
        <div className={styles.emptyText}>データが更新されると、ここに銘柄が表示されます。</div>
      </div>
    )
  }

  const sorted = [...stocks].sort((a, b) => {
    const scoreA = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : -Infinity
    const scoreB = typeof b.score === 'number' && Number.isFinite(b.score) ? b.score : -Infinity
    return scoreB - scoreA
  })

  return (
    <div className={styles.list}>
      {sorted.map((stock, i) => (
        <StockCard key={stock.code} stock={stock} rank={i} />
      ))}
    </div>
  )
}
