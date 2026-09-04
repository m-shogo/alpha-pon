import type { AlphaPonStock } from '@/types/alpha-pon'
import styles from './DataStatus.module.css'

type Props = {
  generatedAt: string
  stocks: AlphaPonStock[]
}

function isValidPrice(stock: AlphaPonStock): boolean {
  return typeof stock.price === 'number' && Number.isFinite(stock.price)
}

export function DataStatus({ generatedAt, stocks }: Props) {
  const total = stocks.length
  const pricedCount = stocks.filter(isValidPrice).length
  const missingPriceCount = total - pricedCount
  const coverage = total > 0 ? Math.round((pricedCount / total) * 100) : 0

  return (
    <section className={styles.status} aria-label="銘柄データの取得状況">
      <div className={styles.summary}>
        <div>
          <div className={styles.label}>価格データ</div>
          <div className={styles.headline}>
            {total > 0 ? `${total}銘柄中 ${pricedCount}件で取得済み` : '監視銘柄はまだありません'}
          </div>
        </div>
        {total > 0 && <div className={styles.coverage}>{coverage}%</div>}
      </div>
      <div className={styles.metaRow}>
        <span>最終生成 {generatedAt}</span>
        {missingPriceCount > 0 ? (
          <strong className={styles.warn}>{missingPriceCount}件は価格未取得</strong>
        ) : total > 0 ? (
          <strong className={styles.good}>全銘柄で価格取得済み</strong>
        ) : null}
      </div>
    </section>
  )
}
