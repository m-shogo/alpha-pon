import type { AlphaPonStock } from '@/types/alpha-pon'

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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 9,
        marginBottom: 16,
      }}
    >
      {[
        { label: '最終生成', value: generatedAt },
        { label: '銘柄数', value: `${total} 銘柄` },
        { label: '価格取得済み', value: `${pricedCount} 件`, ok: pricedCount > 0 },
        { label: '価格未取得', value: `${missingPriceCount} 件`, warn: missingPriceCount > 0 },
      ].map(({ label, value, ok, warn }) => (
        <div
          key={label}
          style={{
            background: 'var(--surface)',
            borderRadius: 14,
            padding: '10px 12px',
            border: '1px solid var(--card-line)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 3 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: ok ? 'var(--mint-deep)' : warn ? 'var(--amber)' : 'var(--ink)',
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}
