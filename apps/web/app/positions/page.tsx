import { loadGeneratedData } from '@/lib/generated-data'
import { Disclaimer } from '@/components/Disclaimer'
import type { Position } from '@/lib/stock/types'

export const metadata = { title: '保有銘柄 | alpha-pon' }

function PositionCard({ pos }: { pos: Position }) {
  const gainColor = pos.unrealizedGainPct == null ? 'var(--ink-3)'
    : pos.unrealizedGainPct > 0 ? 'var(--mint-deep)'
    : pos.unrealizedGainPct < 0 ? 'var(--urgent)'
    : 'var(--ink-2)'

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16, padding: '14px 15px',
      border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{pos.code}</span>
            {pos.nisaType && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'var(--mint-soft)', color: 'var(--mint-deep)' }}>
                {pos.nisaType === 'nisa_growth' ? 'NISA成長' : pos.nisaType === 'nisa_accumulation' ? 'NISA積立' : '特定'}
              </span>
            )}
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{pos.name}</h3>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>含み損益</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: gainColor }}>
            {pos.unrealizedGainPct != null ? `${pos.unrealizedGainPct > 0 ? '+' : ''}${pos.unrealizedGainPct.toFixed(1)}%` : '未取得'}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px', fontSize: 12 }}>
        <span style={{ color: 'var(--ink-3)' }}>平均取得</span>
        <span style={{ fontWeight: 700 }}>{pos.averageCost.toLocaleString()} 円</span>
        <span style={{ color: 'var(--ink-3)' }}>現在価格</span>
        <span style={{ fontWeight: 700 }}>{pos.currentPrice?.toLocaleString() ?? '未取得'} 円</span>
        <span style={{ color: 'var(--ink-3)' }}>保有株数</span>
        <span style={{ fontWeight: 700 }}>{pos.shares.toLocaleString()} 株</span>
        {pos.positionWeightPct != null && (
          <>
            <span style={{ color: 'var(--ink-3)' }}>保有比率</span>
            <span style={{ fontWeight: 700 }}>{pos.positionWeightPct.toFixed(1)}%</span>
          </>
        )}
      </div>

      {pos.thesis.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-2)' }}>
          <span style={{ fontWeight: 700 }}>仮説: </span>{pos.thesis[0]}
        </div>
      )}

      {pos.nextEvent && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--sky-deep)', fontWeight: 600 }}>
          次のイベント: {pos.nextEvent}
        </div>
      )}
    </div>
  )
}

export default function PositionsPage() {
  const data = loadGeneratedData()
  const positions: Position[] = (data as Record<string, unknown>).positions as Position[] ?? []

  const totalValue = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0)

  return (
    <>
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '52px 20px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--mint-deep)', marginBottom: 2 }}>
              保有銘柄 · ポジション管理
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
              保有銘柄
            </h1>
          </div>
          {totalValue > 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>
              評価額 {totalValue.toLocaleString()} 円
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {positions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>保有銘柄なし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>config/positions.yml</code> を追加すると表示されます
            </p>
          </div>
        ) : (
          positions.map(p => <PositionCard key={p.code} pos={p} />)
        )}
        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
