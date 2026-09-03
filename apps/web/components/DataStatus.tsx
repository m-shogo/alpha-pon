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

  const items = [
    { label: '最終生成', value: generatedAt, tone: '' },
    { label: '銘柄数', value: `${total} 銘柄`, tone: '' },
    { label: '価格取得済み', value: `${pricedCount} 件`, tone: pricedCount > 0 ? styles.good : '' },
    { label: '価格未取得', value: `${missingPriceCount} 件`, tone: missingPriceCount > 0 ? styles.warn : '' },
  ]

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <div key={item.label} className={styles.item}>
          <div className={styles.label}>{item.label}</div>
          <div className={`${styles.value} ${item.tone}`}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}
