import Link from 'next/link'
import type { AlphaPonStock } from '@/types/alpha-pon'
import { formatPrice, formatPercent, formatRatio, formatNumber } from '@/lib/format'
import styles from './StockCard.module.css'

type Props = {
  stock: AlphaPonStock
  rank?: number
}

function changeColor(value: AlphaPonStock['changeRate']): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'var(--ink-3)'
  if (value > 0) return 'var(--mint-deep)'
  if (value < 0) return 'var(--urgent)'
  return 'var(--ink-2)'
}

function changeLabel(value: AlphaPonStock['changeRate']): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '未取得'
  return formatPercent(value, true)
}

export function StockCard({ stock, rank }: Props) {
  const scoreNum = typeof stock.score === 'number' && Number.isFinite(stock.score) ? stock.score : null
  const scoreColor = scoreNum === null
    ? 'var(--ink-3)'
    : scoreNum >= 85
      ? 'var(--urgent)'
      : scoreNum >= 70
        ? 'var(--amber)'
        : 'var(--sky-deep)'

  const metrics = [
    { label: '現在値', value: formatPrice(stock.price), color: 'var(--ink)' },
    { label: '騰落率', value: changeLabel(stock.changeRate), color: changeColor(stock.changeRate) },
    { label: 'PER', value: formatRatio(stock.per), color: 'var(--ink)' },
    { label: 'PBR', value: formatRatio(stock.pbr), color: 'var(--ink)' },
    { label: '配当利回り', value: formatPercent(stock.dividendYield), color: 'var(--ink)' },
    { label: 'スコア', value: formatNumber(stock.score), color: scoreColor },
  ]

  return (
    <Link href={`/stocks/${stock.code}`} className={styles.link}>
      <article className={styles.row}>
        <div className={styles.identity}>
          <div className={styles.metaRow}>
            {rank !== undefined && <span className={styles.rank}>#{rank + 1}</span>}
            <span>{stock.code}</span>
            {stock.market && <span>{stock.market}</span>}
          </div>
          <h2 className={styles.name}>{stock.name}</h2>
          {stock.sector && <div className={styles.sector}>{stock.sector}</div>}
        </div>

        <dl className={styles.metrics}>
          {metrics.map((metric) => (
            <div key={metric.label} className={styles.metric}>
              <dt className={styles.metricLabel}>{metric.label}</dt>
              <dd className={styles.metricValue} style={{ color: metric.color }}>{metric.value}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.score}>
          <div className={styles.scoreValue} style={{ color: scoreColor }}>
            {scoreNum ?? '—'}
          </div>
          <div className={styles.scoreMax}>{scoreNum !== null ? '/100' : '未計測'}</div>
        </div>

        {(stock.reasons?.length ?? 0) > 0 && (
          <div className={styles.reasons}>
            理由: {stock.reasons?.slice(0, 3).join(' · ')}
          </div>
        )}
      </article>
    </Link>
  )
}
