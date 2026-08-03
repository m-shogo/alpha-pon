import Link from 'next/link'
import { eventDisplayDate, loadMarketEvents, type MarketEventView } from '@/lib/market-events'

export const metadata = { title: 'alpha-pon — 重要イベント' }

const PRIORITY_STYLE = {
  S0: { label: '緊急', color: 'var(--urgent)', background: 'var(--urgent-soft)' },
  S1: { label: '重要', color: 'var(--amber)', background: 'var(--amber-soft)' },
  S2: { label: '監視', color: 'var(--sky-deep)', background: 'var(--sky-soft)' },
  S3: { label: '記録', color: 'var(--ink-3)', background: 'var(--surface-2)' },
} as const

const DECISION_STYLE = {
  BUY_WATCH: { label: 'BUY WATCH', color: 'var(--mint-deep)', background: 'var(--mint-soft)' },
  WAIT: { label: 'WAIT', color: 'var(--sky-deep)', background: 'var(--sky-soft)' },
  BLOCK: { label: 'BLOCK', color: 'var(--urgent)', background: 'var(--urgent-soft)' },
  ABSTAIN: { label: 'ABSTAIN', color: 'var(--amber)', background: 'var(--amber-soft)' },
  INFO: { label: 'INFO', color: 'var(--ink-3)', background: 'var(--surface-2)' },
} as const

function eventTimeValue(event: MarketEventView): number | null {
  const value = event.time.startAt ?? event.time.windowStart
  return value ? Date.parse(value) : null
}

function EventCard({ event }: { event: MarketEventView }) {
  const priority = PRIORITY_STYLE[event.priority]
  const decision = DECISION_STYLE[event.currentDecisionState]
  return (
    <article id={event.eventId} style={{
      background: 'var(--surface)', border: '1px solid var(--card-line)', borderRadius: 16,
      boxShadow: 'var(--shadow)', padding: 14, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 850, color: priority.color, background: priority.background, borderRadius: 999, padding: '4px 8px' }}>
          {event.priority} {priority.label}
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 850, color: decision.color, background: decision.background, borderRadius: 999, padding: '4px 8px' }}>
          {decision.label}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: 'var(--ink-3)' }}>{eventDisplayDate(event)}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 3 }}>
        {event.issuerCode ?? '—'} · {event.issuerName}
      </div>
      <h2 style={{ fontSize: 16, lineHeight: 1.45, margin: 0, color: 'var(--ink)' }}>{event.title}</h2>
      <p style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: '8px 0 0' }}>{event.whyItMatters}</p>
      {event.checksBefore.length > 0 && (
        <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--ink-3)', marginBottom: 4 }}>通過前に確認</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{event.checksBefore.join(' / ')}</div>
        </div>
      )}
      {event.checksAfter.length > 0 && (
        <div style={{ marginTop: 7, padding: '9px 10px', borderRadius: 10, background: 'var(--sky-soft)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: 'var(--sky-deep)', marginBottom: 4 }}>通過後に判断更新</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{event.checksAfter.join(' / ')}</div>
        </div>
      )}
    </article>
  )
}

export default function CalendarPage() {
  const data = loadMarketEvents()
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const upcoming = data.events.filter((event) => {
    const value = eventTimeValue(event)
    return value != null && value >= now && value <= now + sevenDays
  })
  const later = data.events.filter((event) => {
    const value = eventTimeValue(event)
    return value != null && value > now + sevenDays
  })
  const unknown = data.events.filter((event) => event.time.precision === 'UNKNOWN')
  const completed = data.events.filter((event) => event.status === 'COMPLETED').slice(-10).reverse()

  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 8, padding: '48px 16px 12px', background: 'var(--header-bg)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'var(--accent)', fontWeight: 900 }}>←</Link>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>判断のための待ち伏せ</div>
            <h1 style={{ margin: 0, fontSize: 24, color: 'var(--ink)' }}>重要イベント</h1>
          </div>
        </div>
      </header>

      <main style={{ padding: '14px 14px 36px' }}>
        {data.warnings.map((warning) => (
          <div key={warning} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--amber-soft)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700 }}>
            ⚠ {warning}
          </div>
        ))}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            ['7日以内', upcoming.length],
            ['判断待ち', data.counts.actionRequired],
            ['日程未定', unknown.length],
            ['全イベント', data.counts.total],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: '10px 12px', borderRadius: 13, background: 'var(--surface)', border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)' }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{value}</div>
            </div>
          ))}
        </div>

        {data.generatedAt && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 14 }}>
            最終生成: {data.generatedAt} / source: {data.source}
          </div>
        )}

        <section>
          <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--ink)' }}>🔥 7日以内</h2>
          {upcoming.length ? upcoming.map((event) => <EventCard key={event.eventId} event={event} />) : <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>現在、7日以内の登録イベントはありません。</p>}
        </section>

        {unknown.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--ink)' }}>？ 日程未確定</h2>
            {unknown.map((event) => <EventCard key={event.eventId} event={event} />)}
          </section>
        )}

        {later.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--ink)' }}>📅 その先</h2>
            {later.map((event) => <EventCard key={event.eventId} event={event} />)}
          </section>
        )}

        {completed.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 8px', color: 'var(--ink)' }}>✓ 最近通過したイベント</h2>
            {completed.map((event) => <EventCard key={event.eventId} event={event} />)}
          </section>
        )}
      </main>
    </>
  )
}
