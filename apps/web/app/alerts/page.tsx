import { loadGeneratedData } from '@/lib/generated-data'
import { SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import type { UniverseCandidate } from '@/types/universe'
import Link from 'next/link'

export const metadata = { title: '監視候補 | alpha-pon' }

function DrawdownBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>未取得</span>
  const abs = Math.abs(pct)
  const color = abs >= 25 ? 'var(--amber)' : 'var(--sky-deep)'
  return (
    <span style={{ color, fontWeight: 700, fontSize: 13 }}>
      -{abs.toFixed(1)}%
    </span>
  )
}

function CandidateRow({ c }: { c: UniverseCandidate }) {
  const isMock = c.dataSource === 'mock'
  return (
    <Link href={`/stocks/${c.code}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10, color: 'inherit' }}>
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '13px 15px',
          border: '1px solid var(--card-line)',
          boxShadow: 'var(--shadow)',
          opacity: isMock ? 0.85 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{c.code}</span>
              {isMock && (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: 'var(--amber)', borderRadius: 4, padding: '1px 5px' }}>
                  MOCK
                </span>
              )}
            </div>
            <h3 style={{ margin: '2px 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                background: 'var(--sky-soft)', color: 'var(--sky-deep)',
              }}>
                監視候補
              </span>
              {c.matchedWorldEventTags.slice(0, 2).map(tag => (
                <span key={tag} style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
                  background: 'var(--surface-2)', borderRadius: 5, padding: '1px 6px',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>高値比</div>
            <DrawdownBadge pct={c.drawdownPct} />
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              スコア {c.screeningScore}
            </div>
          </div>
        </div>

        {c.warnings.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--amber)', fontWeight: 600 }}>
            ⚠ {c.warnings[0]}
          </div>
        )}
      </div>
    </Link>
  )
}

export default function AlertsPage() {
  const data = loadGeneratedData()
  const candidates = data.universeCandidates ?? []
  const isMock = candidates.length > 0 && candidates.every(c => c.dataSource === 'mock')
  const scanDate = data.generatedAt ?? null
  const dataMode = candidates.length === 0 ? null : isMock ? 'MOCK' : '本番'

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
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sky-deep)', marginBottom: 2 }}>
              自動スクリーニング ・ 未登録銘柄
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
              監視候補
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {dataMode && (
              <span style={{
                fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
                background: isMock ? 'var(--amber-soft)' : 'var(--mint-soft)',
                color: isMock ? 'var(--amber)' : 'var(--mint-deep)',
              }}>
                {dataMode}
              </span>
            )}
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--sky-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sky-deep)' }}>
              <Icon name="bell" size={19} />
            </div>
          </div>
        </div>
        {scanDate && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>
            最終スキャン: {scanDate}
          </div>
        )}
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {isMock && (
          <div style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--amber-soft)', borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--amber)', flexShrink: 0 }}>⚠</span>
            モックデータを表示しています。実データで見るには J-Quants を設定してから
            <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4 }}>pnpm scan:universe</code>
            を実行してください。
          </div>
        )}

        {/* リンク: 仮説・検証 */}
        <div style={{ display: 'flex', gap: 9, marginBottom: 16 }}>
          <Link href="/hypotheses" style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 14,
            border: '1px solid var(--card-line)', background: 'var(--surface)',
            textDecoration: 'none',
          }}>
            <span style={{ color: 'var(--lavender-deep)' }}><Icon name="doc" size={16} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>仮説一覧</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--lavender-deep)', fontWeight: 700 }}>
                {(data.hypothesisPredictions ?? []).filter(h => h.status === 'open').length} 件 オープン
              </span>
            </span>
          </Link>
          <Link href="/outcomes" style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 14,
            border: '1px solid var(--card-line)', background: 'var(--surface)',
            textDecoration: 'none',
          }}>
            <span style={{ color: 'var(--mint-deep)' }}><Icon name="check" size={16} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>当たり外れ</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--mint-deep)', fontWeight: 700 }}>
                {(data.hypothesisOutcomes ?? []).length} 件 検証済み
              </span>
            </span>
          </Link>
        </div>

        <SectionLabel icon={<Icon name="spark" size={15} />}>
          今日のスクリーニング結果（スコア順）
        </SectionLabel>

        {candidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>監視候補なし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm scan:universe</code> を実行してください
            </p>
          </div>
        ) : (
          [...candidates]
            .sort((a, b) => b.screeningScore - a.screeningScore)
            .map(c => <CandidateRow key={c.code} c={c} />)
        )}

        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
