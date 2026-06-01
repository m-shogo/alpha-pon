import Link from 'next/link'
import type { AlphaPonStock } from '@/types/alpha-pon'
import { formatPrice, formatPercent, formatRatio, formatNumber } from '@/lib/format'

type Props = {
  stock: AlphaPonStock
  rank?: number
}

function ChangeLabel({ value }: { value: AlphaPonStock['changeRate'] }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return <span style={{ color: 'var(--ink-3)' }}>未取得</span>
  }
  const color = value > 0 ? 'var(--mint-deep)' : value < 0 ? 'var(--urgent)' : 'var(--ink-2)'
  return <span style={{ color, fontWeight: 700 }}>{formatPercent(value, true)}</span>
}

export function StockCard({ stock, rank }: Props) {
  const scoreNum = typeof stock.score === 'number' && Number.isFinite(stock.score) ? stock.score : null

  return (
    <Link href={`/stocks/${stock.code}`} style={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
      <article
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '14px 16px',
          border: '1px solid var(--card-line)',
          boxShadow: 'var(--shadow)',
          marginBottom: 10,
        }}
      >
        {/* header */}
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {rank !== undefined && (
                <span style={{
                  fontSize: 11, fontWeight: 800, color: 'var(--ink-3)',
                  background: 'var(--surface-2)', borderRadius: 5, padding: '1px 5px',
                }}>
                  #{rank + 1}
                </span>
              )}
              <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{stock.code}</p>
              {stock.market && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-3)' }}>{stock.market}</p>
              )}
            </div>
            <h2 style={{ margin: '2px 0 0', fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {stock.name}
            </h2>
            {stock.sector && (
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--ink-3)' }}>{stock.sector}</p>
            )}
          </div>
          {scoreNum !== null && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700, lineHeight: 1,
                color: scoreNum >= 85 ? 'var(--urgent)' : scoreNum >= 70 ? 'var(--amber)' : 'var(--sky-deep)',
              }}>
                {scoreNum}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>/100</div>
            </div>
          )}
        </header>

        {/* price data */}
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px 0',
            margin: '12px 0 0',
            padding: '10px 0 0',
            borderTop: '1px solid var(--line)',
          }}
        >
          <div>
            <dt style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>現在値</dt>
            <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {formatPrice(stock.price)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>騰落率</dt>
            <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>
              <ChangeLabel value={stock.changeRate} />
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>スコア</dt>
            <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {formatNumber(stock.score)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>PER</dt>
            <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {formatRatio(stock.per)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>PBR</dt>
            <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {formatRatio(stock.pbr)}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>配当利回り</dt>
            <dd style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {formatPercent(stock.dividendYield)}
            </dd>
          </div>
        </dl>

        {/* reasons */}
        {stock.reasons && stock.reasons.length > 0 && (
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {stock.reasons.slice(0, 3).map((reason) => (
              <li
                key={reason}
                style={{
                  fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)',
                  background: 'var(--surface-2)', borderRadius: 6, padding: '2px 8px',
                }}
              >
                {reason}
              </li>
            ))}
          </ul>
        )}
      </article>
    </Link>
  )
}
