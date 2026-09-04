'use client'

import Link from 'next/link'
import type { WebMarketEventData, WebMarketEvent } from '@/lib/market-event-data'
import {
  compareWebMarketEventSortAt,
  marketEventDateLabel,
  webMarketEventJapanDate,
} from '@/lib/market-event-data'
import { useMarketEventData } from '@/lib/use-market-events'
import styles from './MarketEventHomeCard.module.css'

const PRIORITY_COLOR: Record<WebMarketEvent['priority'], string> = {
  S0: 'var(--urgent)',
  S1: 'var(--amber)',
  S2: 'var(--sky-deep)',
  S3: 'var(--ink-3)',
}

const PRIORITY_LABEL: Record<WebMarketEvent['priority'], string> = {
  S0: '最優先',
  S1: '重要',
  S2: '確認',
  S3: '記録',
}

function decisionLabel(value: WebMarketEvent['currentDecisionState']): string {
  const labels: Record<string, string> = {
    INFO: '情報確認',
    WAIT: '待ち',
    BUY_WATCH: '条件監視',
    RISK_WATCH: '要注意',
    BLOCKED: '保留',
  }
  return labels[value] ?? value
}

function sortValue(event: WebMarketEvent): string {
  return event.sortAt ?? '9999-12-31'
}

export function MarketEventHomeCard({ data: fallback }: { data: WebMarketEventData }) {
  const { data, delivery, loading } = useMarketEventData(fallback)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const upcoming = data.events
    .filter(event => !['CANCELLED', 'COMPLETED'].includes(event.status))
    .filter(event => event.sortAt === null || webMarketEventJapanDate(event.sortAt) >= today)
    .sort((a, b) => {
      const date = compareWebMarketEventSortAt(sortValue(a), sortValue(b))
      if (date !== 0) return date
      return a.priority.localeCompare(b.priority)
    })
    .slice(0, 3)

  const deliveryText = loading
    ? '更新を確認中'
    : delivery === 'api'
      ? '最新データ'
      : '保存済みデータ'

  return (
    <section className={styles.section} aria-labelledby="home-market-events-title">
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <div className={styles.titleRow}>
            <h2 id="home-market-events-title" className={styles.title}>次の重要イベント</h2>
            <span className={`${styles.delivery}${delivery === 'api' && !loading ? ` ${styles.deliveryLive}` : ''}`}>
              {deliveryText}
            </span>
          </div>
          <p className={styles.description}>日程が近いイベントを3件まで表示します。詳細な確認条件は予定画面で見られます。</p>
        </div>
        <Link href="/calendar" className={styles.allLink}>
          予定を見る <span aria-hidden="true">›</span>
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className={styles.empty}>直近の重要イベントはまだ登録されていません。</div>
      ) : (
        <div className={styles.events}>
          {upcoming.map(event => (
            <Link key={event.eventId} href={`/calendar#${event.eventId}`} className={styles.eventLink}>
              <span className={styles.priorityBar} style={{ background: PRIORITY_COLOR[event.priority] }} aria-hidden="true" />
              <span className={styles.eventContent}>
                <span className={styles.eventMeta}>
                  <span className={styles.eventPriority} style={{ color: PRIORITY_COLOR[event.priority] }}>
                    {PRIORITY_LABEL[event.priority]}
                  </span>
                  <span>{marketEventDateLabel(event)}</span>
                </span>
                <span className={styles.eventTitle}>
                  {event.issuerCode ? `${event.issuerCode} ` : ''}{event.issuerName} — {event.title}
                </span>
              </span>
              <span className={styles.decision}>{decisionLabel(event.currentDecisionState)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
