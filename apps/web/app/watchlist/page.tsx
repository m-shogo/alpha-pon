import { loadGeneratedData } from '@/lib/generated-data'
import { Icon } from '@/components/Icon'
import { WatchlistClient } from '@/components/WatchlistClient'

export default function WatchlistPage() {
  const data = loadGeneratedData()

  return (
    <>
      {/* header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '52px 20px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: 0.3, marginBottom: 2 }}>
              status で銘柄を管理
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)', letterSpacing: 0.2 }}>
              ウォッチリスト
            </h1>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--card-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-2)' }}>
            <Icon name="filter" size={19} />
          </div>
        </div>
      </div>

      <WatchlistClient candidates={data.candidates} />
    </>
  )
}
