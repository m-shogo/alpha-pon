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
        {(data.meta?.warnings ?? []).length > 0 && (
          <div style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--amber-soft)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>⚠ データ更新に問題が発生しました</div>
            {(data.meta?.warnings ?? []).map((w: string, i: number) => (
              <div key={i} style={{ marginTop: 2 }}>• {w}</div>
            ))}
          </div>
        )}
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

        {/* pipeline status */}
        {data.pipelineStatus && (
          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 8, letterSpacing: 0.3 }}>
              PIPELINE STATUS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
              {data.pipelineStatus.date && (
                <>
                  <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>日付</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{data.pipelineStatus.date}</span>
                </>
              )}
              {data.pipelineStatus.status && (
                <>
                  <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>ステータス</span>
                  <span style={{
                    color: data.pipelineStatus.status === 'success' ? 'var(--mint-deep)' : 'var(--amber)',
                    fontWeight: 800,
                  }}>
                    {data.pipelineStatus.status}
                  </span>
                </>
              )}
              {data.pipelineStatus.startedAt && (
                <>
                  <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>開始</span>
                  <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{data.pipelineStatus.startedAt}</span>
                </>
              )}
              {data.pipelineStatus.endedAt && (
                <>
                  <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>終了</span>
                  <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{data.pipelineStatus.endedAt}</span>
                </>
              )}
            </div>
            {(data.pipelineStatus.completeWrapperFailedSteps ?? []).length > 0 && (
              <div style={{ marginTop: 8, padding: '7px 10px', background: 'var(--amber-soft)', borderRadius: 8, fontSize: 11.5 }}>
                <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 3 }}>失敗したステップ</div>
                {(data.pipelineStatus.completeWrapperFailedSteps ?? []).map((s: string, i: number) => (
                  <div key={i} style={{ color: 'var(--ink-2)', fontWeight: 600 }}>• {s}</div>
                ))}
              </div>
            )}
            {(data.pipelineStatus.completeWrapperFailedSteps ?? []).length === 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--mint-deep)', fontWeight: 700 }}>✓ 全ステップ正常完了</div>
            )}
            {(data.pipelineStatus.steps ?? []).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 5 }}>ステップ詳細</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {(data.pipelineStatus.steps ?? []).map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: s.status === 'ok' ? 'var(--mint-deep)' : s.status === 'skipped' ? 'var(--ink-3)' : 'var(--amber)',
                      }} />
                      <span style={{ color: 'var(--ink)', fontWeight: 600, flex: 1 }}>{s.name}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700,
                        color: s.status === 'ok' ? 'var(--mint-deep)' : s.status === 'skipped' ? 'var(--ink-3)' : 'var(--amber)',
                      }}>
                        {s.status}
                      </span>
                      {s.durationSec > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{s.durationSec}s</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
