import { loadGeneratedData } from '@/lib/generated-data'
import { SectionLabel, Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import type { StockCandidateHypothesis } from '@/types/universe'
import Link from 'next/link'
import { formatDueLabel, todayJstDate } from '@/lib/format'

export const metadata = { title: '仮説一覧 | alpha-pon' }

const LABEL_STYLE: Record<string, { color: string; bg: string }> = {
  '監視候補':  { color: 'var(--sky-deep)',      bg: 'var(--sky-soft)' },
  '検証候補':  { color: 'var(--lavender-deep)', bg: 'var(--lavender-soft)' },
  '反証待ち':  { color: 'var(--amber)',          bg: 'var(--amber-soft)' },
}

function HypothesisCard({ h }: { h: StockCandidateHypothesis }) {
  const ls = LABEL_STYLE[h.label] ?? { color: 'var(--ink-3)', bg: 'var(--surface-2)' }
  const due = formatDueLabel(h.reviewDueAt, todayJstDate())

  return (
    <Link href={`/stocks/${h.code}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 10, color: 'inherit' }}>
      <Card pad={13}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{
                fontSize: 11.5, fontWeight: 800, color: ls.color,
                background: ls.bg, borderRadius: 6, padding: '2px 8px',
              }}>
                {h.label}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{h.code}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{h.name}</span>
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {h.reason}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11.5, fontWeight: 700 }}>
              <span style={{ color: 'var(--ink-3)' }}>検証: {h.expectedTimeframe}</span>
              <span style={{ color: 'var(--ink-3)' }}>方向: {h.expectedDirection}</span>
              <span style={{ color: 'var(--ink-3)' }}>確信: {Math.round(h.confidence * 100)}%</span>
              <span style={{ color: due.overdue ? 'var(--urgent)' : 'var(--ink-3)' }}>
                {due.label} ({h.reviewDueAt})
              </span>
            </div>
          </div>
          <span style={{
            fontSize: 10.5, fontWeight: 800, padding: '2px 6px', borderRadius: 5, flexShrink: 0,
            color: h.status === 'open' ? 'var(--mint-deep)' : 'var(--ink-3)',
            background: h.status === 'open' ? 'var(--mint-soft)' : 'var(--surface-2)',
          }}>
            {h.status === 'open' ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
      </Card>
    </Link>
  )
}

export default function HypothesesPage() {
  const data = loadGeneratedData()
  const all = data.hypothesisPredictions ?? []
  const open = all.filter(h => h.status === 'open')
  const closed = all.filter(h => h.status === 'closed')

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
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lavender-deep)', marginBottom: 2 }}>
              監視候補・検証候補・反証待ち
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
              仮説一覧
            </h1>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {all.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>仮説なし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm scan:universe</code> → <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm ui:data</code> を実行してください
            </p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <>
                <SectionLabel icon={<Icon name="spark" size={15} />}>オープン ({open.length}件)</SectionLabel>
                {open
                  .sort((a, b) => b.confidence - a.confidence)
                  .map(h => <HypothesisCard key={`${h.code}:${h.detectedAt}`} h={h} />)}
              </>
            )}
            {closed.length > 0 && (
              <>
                <SectionLabel icon={<Icon name="check" size={15} />}>検証済み ({closed.length}件)</SectionLabel>
                {closed
                  .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
                  .map(h => <HypothesisCard key={`${h.code}:${h.detectedAt}`} h={h} />)}
              </>
            )}
          </>
        )}

        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
