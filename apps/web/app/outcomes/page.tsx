import { loadGeneratedData } from '@/lib/generated-data'
import { SectionLabel, Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'

export const metadata = { title: '当たり外れ検証 | alpha-pon' }

const RESULT_META = {
  hit:         { label: '一致',   color: 'var(--mint-deep)',  bg: 'var(--mint-soft)' },
  miss:        { label: '不一致', color: 'var(--urgent)',     bg: 'var(--urgent-soft)' },
  too_early:   { label: '時期尚早', color: 'var(--amber)',    bg: 'var(--amber-soft)' },
  invalidated: { label: '反証',   color: 'var(--lavender-deep)', bg: 'var(--lavender-soft)' },
  unknown:     { label: '不明',   color: 'var(--ink-3)',      bg: 'var(--surface-2)' },
} as const

function ReturnCell({ value, prefix = '' }: { value: number | null; prefix?: string }) {
  if (value == null) return <span style={{ color: 'var(--ink-3)' }}>N/A</span>
  const color = value >= 0 ? 'var(--mint-deep)' : 'var(--urgent)'
  return (
    <span style={{ color, fontWeight: 700 }}>
      {prefix}{value >= 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

export default function OutcomesPage() {
  const data = loadGeneratedData()
  const outcomes = data.hypothesisOutcomes ?? []
  const summary = data.accuracySummary ?? null

  const sorted = [...outcomes].sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))

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
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--mint-deep)', marginBottom: 2 }}>
            仮説の精度・反省
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
            当たり外れ検証
          </h1>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* サマリー */}
        {summary && (
          <>
            <SectionLabel icon={<Icon name="arc" size={15} />}>精度サマリー</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9, marginBottom: 16 }}>
              {[
                { label: '総検証数', value: `${summary.total}件` },
                { label: '一致率', value: summary.hitRate != null ? `${(summary.hitRate * 100).toFixed(0)}%` : 'N/A' },
                { label: '平均1Mリターン', value: summary.avgReturn1m != null ? `${summary.avgReturn1m >= 0 ? '+' : ''}${summary.avgReturn1m.toFixed(1)}%` : 'N/A' },
                { label: 'vs TOPIX', value: summary.avgTopixReturn1m != null ? `${summary.avgTopixReturn1m >= 0 ? '+' : ''}${summary.avgTopixReturn1m.toFixed(1)}%` : 'N/A' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--surface)', borderRadius: 14, padding: '10px 12px', border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 検証リスト */}
        <SectionLabel icon={<Icon name="check" size={15} />}>
          検証済み仮説 ({outcomes.length}件)
        </SectionLabel>

        {outcomes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>検証済みデータなし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm review:hypotheses</code> を実行してください
            </p>
          </div>
        ) : (
          sorted.map((o, i) => {
            const rm = RESULT_META[o.result]
            return (
              <Card key={i} pad={13} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11.5, fontWeight: 800, color: rm.color,
                        background: rm.bg, borderRadius: 6, padding: '2px 8px',
                      }}>
                        {rm.label}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{o.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700 }}>{o.code}</span>
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>
                      検証日: {o.evaluatedAt} ・ 仮説日: {o.hypothesis.detectedAt} ({o.hypothesis.label})
                    </p>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12.5, flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ color: 'var(--ink-3)', marginRight: 4 }}>1W</span>
                        <ReturnCell value={o.return1w} />
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-3)', marginRight: 4 }}>1M</span>
                        <ReturnCell value={o.return1m} />
                      </div>
                      <div>
                        <span style={{ color: 'var(--ink-3)', marginRight: 4 }}>TOPIX比</span>
                        <ReturnCell value={o.relativeToTopix1m} />
                      </div>
                    </div>
                  </div>
                  {o.dataSource === 'mock' && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: 'var(--amber)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                      MOCK
                    </span>
                  )}
                </div>
                {o.notes && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
                    {o.notes}
                  </p>
                )}
              </Card>
            )
          })
        )}

        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
