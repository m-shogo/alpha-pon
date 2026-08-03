'use client'

import Link from 'next/link'
import type { WebMarketEventData, WebMarketEvent } from '@/lib/market-event-data'
import { marketEventDateLabel } from '@/lib/market-event-data'
import { useMarketEventData } from '@/lib/use-market-events'

const PRIORITY_COLOR: Record<WebMarketEvent['priority'], string> = {
  S0: 'var(--urgent)',
  S1: 'var(--amber)',
  S2: 'var(--sky-deep)',
  S3: 'var(--ink-3)',
}

function sortValue(event: WebMarketEvent): string {
  return event.sortAt ?? '9999-12-31'
}

export function MarketEventHomeCard({ data: fallback }: { data: WebMarketEventData }) {
  const { data, delivery, loading } = useMarketEventData(fallback)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const upcoming = data.events
    .filter(event => !['CANCELLED', 'COMPLETED'].includes(event.status))
    .filter(event => event.sortAt === null || sortValue(event) >= today)
    .sort((a, b) => {
      const date = sortValue(a).localeCompare(sortValue(b))
      if (date !== 0) return date
      return a.priority.localeCompare(b.priority)
    })
    .slice(0, 3)

  return (
    <section style={{ padding: '12px 16px 0' }} aria-label="次の重要イベント">
      <div style={{
        padding: '13px 14px',
        borderRadius: 16,
        background: 'var(--surface)',
        border: '1px solid var(--card-line)',
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: upcoming.length ? 10 : 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 850, color: 'var(--accent)', letterSpacing: 0.3 }}>MARKET EVENT</span>
              <span style={{ fontSize: 9.5, fontWeight: 850, color: delivery === 'api' ? 'var(--mint-deep)' : 'var(--ink-3)' }}>
                {loading ? '更新確認中' : delivery === 'api' ? 'LIVE' : 'SNAPSHOT'}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 850, color: 'var(--ink)', marginTop: 2 }}>次の重要イベント</div>
          </div>
          <Link href="/calendar" style={{ fontSize: 12, fontWeight: 850, color: 'var(--sky-deep)', textDecoration: 'none' }}>
            全て見る →
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div style={{ padding: '9px 10px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>
            予定はまだ登録されていません。カレンダー基盤は利用可能です。
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            {upcoming.map(event => (
              <Link
                key={event.eventId}
                href={`/calendar#${event.eventId}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '5px minmax(0, 1fr)',
                  gap: 10,
                  alignItems: 'stretch',
                  padding: '9px 10px',
                  borderRadius: 11,
                  background: 'var(--surface-2)',
                  textDecoration: 'none',
                }}
              >
                <span style={{ borderRadius: 99, background: PRIORITY_COLOR[event.priority] }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 850, color: PRIORITY_COLOR[event.priority] }}>
                      {event.priority} · {marketEventDateLabel(event)}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 850, color: 'var(--ink-3)' }}>{event.currentDecisionState}</span>
                  </span>
                  <span style={{ display: 'block', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>
                    {event.issuerCode ? `${event.issuerCode} ` : ''}{event.issuerName} — {event.title}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}