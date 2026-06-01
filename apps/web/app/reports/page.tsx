import { loadGeneratedData } from '@/lib/generated-data'
import { ReportViewer } from '@/components/ReportViewer'

export default function ReportsPage() {
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
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.3, marginBottom: 2 }}>
              reports / generated
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)', letterSpacing: 0.2 }}>
              レポート
            </h1>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {data.reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>レポートがありません</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              ルートで <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm daily</code> を実行してください
            </p>
          </div>
        ) : (
          <ReportViewer reports={data.reports} />
        )}
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
