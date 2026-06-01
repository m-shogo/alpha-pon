import { getGeneratedData } from '@/lib/generated-data'
import { StockList } from '@/components/StockList'
import { DataStatus } from '@/components/DataStatus'
import { Disclaimer } from '@/components/Disclaimer'
import { Icon } from '@/components/Icon'

export default async function StocksPage() {
  const data = await getGeneratedData()

  return (
    <>
      {/* header */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 8,
          padding: '52px 20px 12px',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: 0.3, marginBottom: 2 }}>
              スコア順 ・ 価格未取得は「未取得」表示
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)', letterSpacing: 0.2 }}>
              銘柄一覧
            </h1>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--card-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}>
            <Icon name="filter" size={19} />
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* data status */}
        <DataStatus generatedAt={data.generatedAt} stocks={data.stocks} />

        {/* warnings */}
        {data.meta?.warnings?.map((w, i) => (
          <div
            key={i}
            style={{
              padding: '10px 14px', marginBottom: 10,
              background: 'var(--amber-soft)', borderRadius: 10,
              fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)',
              display: 'flex', gap: 8,
            }}
          >
            <span style={{ color: 'var(--amber)', flexShrink: 0 }}>⚠</span>
            {w}
          </div>
        ))}

        {/* stock list */}
        <StockList stocks={data.stocks} />

        {/* disclaimer */}
        <Disclaimer />

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
