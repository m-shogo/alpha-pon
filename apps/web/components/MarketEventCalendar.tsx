'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { WebMarketEvent, WebMarketEventData } from '@/lib/market-event-data'
import { marketEventDateLabel } from '@/lib/market-event-data'
import { CalendarFeedActions } from './CalendarFeedActions'
import styles from '@/app/calendar/calendar.module.css'

type Category = 'ALL' | 'GOVERNANCE' | 'EARNINGS' | 'STRUCTURE' | 'FUTURE' | 'REVIEW'
type Visibility = 'ACTIVE' | 'ALL'
type ViewMode = 'CALENDAR' | 'LIST'

type CalendarCell = {
  day: string
  dayNumber: number
  inMonth: boolean
}

const CATEGORY_LABELS: Array<{ key: Category; label: string }> = [
  { key: 'ALL', label: 'すべて' },
  { key: 'GOVERNANCE', label: '不祥事・統制' },
  { key: 'EARNINGS', label: '決算' },
  { key: 'STRUCTURE', label: '企業構造' },
  { key: 'FUTURE', label: '将来需要' },
  { key: 'REVIEW', label: '答え合わせ' },
]

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const PRIORITY_STYLE: Record<WebMarketEvent['priority'], { color: string; background: string }> = {
  S0: { color: 'var(--urgent)', background: 'var(--urgent-soft)' },
  S1: { color: 'var(--amber)', background: 'var(--amber-soft)' },
  S2: { color: 'var(--sky-deep)', background: 'var(--sky-soft)' },
  S3: { color: 'var(--ink-2)', background: 'var(--surface-2)' },
}

const DECISION_STYLE: Record<WebMarketEvent['currentDecisionState'], { color: string; background: string }> = {
  BUY_WATCH: { color: 'var(--mint-deep)', background: 'var(--mint-soft)' },
  WAIT: { color: 'var(--amber)', background: 'var(--amber-soft)' },
  BLOCK: { color: 'var(--urgent)', background: 'var(--urgent-soft)' },
  ABSTAIN: { color: 'var(--lavender-deep)', background: 'var(--lavender-soft)' },
  INFO: { color: 'var(--sky-deep)', background: 'var(--sky-soft)' },
}

const STATUS_LABEL: Record<WebMarketEvent['status'], string> = {
  TENTATIVE: '仮予定',
  SCHEDULED: '予定',
  IN_PROGRESS: '進行中',
  COMPLETED: '通過済み',
  POSTPONED: '延期',
  CANCELLED: '取消',
  UNKNOWN_DATE: '日程未確定',
}

function categoryOf(event: WebMarketEvent): Exclude<Category, 'ALL'> {
  if (['EARNINGS_RELEASE', 'EARNINGS_BRIEFING'].includes(event.eventType)) return 'EARNINGS'
  if (['TOB_DEADLINE', 'CORPORATE_ACTION'].includes(event.eventType)) return 'STRUCTURE'
  if (['CERTIFICATION_OR_APPROVAL', 'PROCUREMENT_OR_AWARD', 'CAPACITY_OR_PRODUCTION_START'].includes(event.eventType)) return 'FUTURE'
  if (event.eventType === 'REVIEW_CHECKPOINT') return 'REVIEW'
  return 'GOVERNANCE'
}

function dateOnlyJst(value: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(value))
}

function eventDay(event: WebMarketEvent): string | null {
  if (!event.sortAt) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(event.sortAt)) return event.sortAt
  try {
    return dateOnlyJst(event.sortAt)
  } catch {
    return event.sortAt.slice(0, 10)
  }
}

function daysFrom(today: string, target: string): number {
  const start = Date.parse(`${today}T00:00:00Z`)
  const end = Date.parse(`${target}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

function groupFor(event: WebMarketEvent, today: string): string {
  if (event.status === 'COMPLETED' || event.status === 'CANCELLED') return '完了・取消'
  if (event.time.precision === 'UNKNOWN') return '日程未確定'
  if (event.priority === 'S0' || event.status === 'IN_PROGRESS' || event.freshnessState === 'STALE') return '緊急・要確認'
  const day = eventDay(event)
  if (!day) return '日程未確定'
  const diff = daysFrom(today, day)
  if (diff < 0) return '期限通過・結果待ち'
  if (diff === 0) return '今日'
  if (diff <= 7) return '7日以内'
  return 'それ以降'
}

const GROUP_ORDER = ['緊急・要確認', '今日', '7日以内', '期限通過・結果待ち', 'それ以降', '日程未確定', '完了・取消']

function matchesQuery(event: WebMarketEvent, query: string): boolean {
  if (!query.trim()) return true
  const normalized = query.normalize('NFKC').toLocaleLowerCase('ja-JP')
  return [
    event.issuerCode ?? '',
    event.issuerName,
    event.title,
    event.whyItMatters,
    event.eventType,
    event.currentDecisionState,
    ...event.edgeTypes,
  ].join(' ').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(normalized)
}

function monthForEvents(events: WebMarketEvent[], today: string): string {
  const currentMonth = today.slice(0, 7)
  const months = Array.from(new Set(events
    .map(eventDay)
    .filter((day): day is string => Boolean(day))
    .map(day => day.slice(0, 7))))
    .sort()
  return months.find(month => month >= currentMonth) ?? months[0] ?? currentMonth
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}年${monthNumber}月`
}

function calendarCells(month: string): CalendarCell[] {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const firstWeekday = first.getUTCDay()
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - 1, index - firstWeekday + 1))
    return {
      day: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCMonth() === monthNumber - 1,
    }
  })
}

function EventCard({ event }: { event: WebMarketEvent }) {
  const priority = PRIORITY_STYLE[event.priority]
  const decision = DECISION_STYLE[event.currentDecisionState]
  return (
    <article id={event.eventId} className={styles.eventCard}>
      <div className={styles.eventTop}>
        <div className={styles.badges}>
          <span className={styles.badge} style={{ color: priority.color, background: priority.background }}>{event.priority}</span>
          <span className={styles.badge} style={{ color: decision.color, background: decision.background }}>{event.currentDecisionState}</span>
          <span className={styles.badge} style={{ color: 'var(--ink-2)', background: 'var(--surface-2)' }}>{STATUS_LABEL[event.status]}</span>
          {event.freshnessState === 'STALE' && (
            <span className={styles.badge} style={{ color: 'var(--urgent)', background: 'var(--urgent-soft)' }}>STALE</span>
          )}
        </div>
        <div className={styles.eventDate}>{marketEventDateLabel(event)}</div>
      </div>
      <h3 className={styles.eventTitle}>{event.issuerCode ? `${event.issuerCode} ` : ''}{event.issuerName} — {event.title}</h3>
      <div className={styles.eventMeta}>{event.eventType} · rev.{event.revisionNumber} · {categoryOf(event)}</div>
      <p className={styles.why}>{event.whyItMatters}</p>

      <details className={styles.details}>
        <summary>確認項目・一次情報を見る</summary>
        <div className={styles.detailGrid}>
          <div>
            <div className={styles.detailLabel}>事前に見る</div>
            {event.checksBefore.length ? (
              <ul className={styles.detailList}>{event.checksBefore.map(item => <li key={item}>{item}</li>)}</ul>
            ) : <div className={styles.eventMeta}>未登録</div>}
          </div>
          <div>
            <div className={styles.detailLabel}>通過後に見る</div>
            {event.checksAfter.length ? (
              <ul className={styles.detailList}>{event.checksAfter.map(item => <li key={item}>{item}</li>)}</ul>
            ) : <div className={styles.eventMeta}>未登録</div>}
          </div>
          <div>
            <div className={styles.detailLabel}>関連Edge</div>
            <div className={styles.eventMeta}>{event.edgeTypes.join(' / ') || '未登録'}</div>
          </div>
          <div>
            <div className={styles.detailLabel}>鮮度</div>
            <div className={styles.eventMeta}>最終確認 {event.lastVerifiedAt}<br />stale予定 {event.staleAfter ?? '未設定'}</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className={styles.detailLabel}>一次情報</div>
            {event.sources.length ? event.sources.map(source => (
              <a key={source.sourceId} className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer">
                {source.authority} · {source.title}
              </a>
            )) : <div className={styles.eventMeta}>一次情報リンクなし</div>}
          </div>
        </div>
      </details>
    </article>
  )
}

export function MarketEventCalendar({ data, nowIso }: { data: WebMarketEventData; nowIso: string }) {
  const today = dateOnlyJst(nowIso)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('ALL')
  const [visibility, setVisibility] = useState<Visibility>('ACTIVE')
  const [viewMode, setViewMode] = useState<ViewMode>('CALENDAR')
  const [calendarMonth, setCalendarMonth] = useState(() => monthForEvents(data.events, today))
  const autoSelectedMonth = useRef(false)

  const filtered = useMemo(() => data.events.filter(event => {
    if (visibility === 'ACTIVE' && ['COMPLETED', 'CANCELLED'].includes(event.status)) return false
    if (category !== 'ALL' && categoryOf(event) !== category) return false
    return matchesQuery(event, query)
  }), [category, data.events, query, visibility])

  const availableMonths = useMemo(() => Array.from(new Set(filtered
    .map(eventDay)
    .filter((day): day is string => Boolean(day))
    .map(day => day.slice(0, 7))))
    .sort(), [filtered])

  useEffect(() => {
    if (autoSelectedMonth.current || availableMonths.length === 0) return
    setCalendarMonth(availableMonths.find(month => month >= today.slice(0, 7)) ?? availableMonths[0])
    autoSelectedMonth.current = true
  }, [availableMonths, today])

  const grouped = useMemo(() => {
    const result = new Map<string, WebMarketEvent[]>()
    for (const event of filtered) {
      const group = groupFor(event, today)
      const events = result.get(group) ?? []
      events.push(event)
      result.set(group, events)
    }
    for (const events of result.values()) {
      events.sort((a, b) => {
        const date = (a.sortAt ?? '9999-12-31').localeCompare(b.sortAt ?? '9999-12-31')
        if (date !== 0) return date
        return a.priority.localeCompare(b.priority)
      })
    }
    return result
  }, [filtered, today])

  const eventsByDay = useMemo(() => {
    const result = new Map<string, WebMarketEvent[]>()
    for (const event of filtered) {
      const day = eventDay(event)
      if (!day) continue
      const events = result.get(day) ?? []
      events.push(event)
      result.set(day, events)
    }
    return result
  }, [filtered])

  const monthEvents = useMemo(() => filtered
    .filter(event => eventDay(event)?.startsWith(calendarMonth))
    .sort((a, b) => (a.sortAt ?? '').localeCompare(b.sortAt ?? '')), [calendarMonth, filtered])

  const cells = useMemo(() => calendarCells(calendarMonth), [calendarMonth])
  const nextAvailableMonth = availableMonths.find(month => month > calendarMonth) ?? availableMonths[0]

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>重要イベント</h1>
            <div className={styles.subtitle}>決算・会見・調査報告・企業構造イベントを、買う前の確認条件と一緒に管理します。</div>
          </div>
          <CalendarFeedActions />
        </div>
      </header>

      <div className={styles.page}>
        {data.meta.warnings.map(warning => <div key={warning} className={styles.warning}>⚠ {warning}</div>)}

        <div className={styles.summaryGrid}>
          {[
            ['予定', data.summary.scheduled],
            ['S0 / S1', data.summary.priorityCounts.S0 + data.summary.priorityCounts.S1],
            ['日程未確定', data.summary.unknownDate],
            ['STALE', data.summary.stale],
          ].map(([label, value]) => (
            <div key={String(label)} className={styles.summaryCard}>
              <div className={styles.summaryLabel}>{label}</div>
              <div className={styles.summaryValue}>{value}</div>
            </div>
          ))}
        </div>

        <div className={styles.viewTabs} aria-label="表示形式">
          <button
            type="button"
            className={`${styles.viewTab} ${viewMode === 'CALENDAR' ? styles.viewTabActive : ''}`}
            onClick={() => setViewMode('CALENDAR')}
          >
            月間カレンダー
          </button>
          <button
            type="button"
            className={`${styles.viewTab} ${viewMode === 'LIST' ? styles.viewTabActive : ''}`}
            onClick={() => setViewMode('LIST')}
          >
            イベント一覧
          </button>
        </div>

        <div className={styles.filterPanel}>
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="会社名・コード・Edge・イベントを検索"
            aria-label="イベントを検索"
          />
          <div className={styles.chips}>
            {CATEGORY_LABELS.map(item => (
              <button
                key={item.key}
                type="button"
                className={`${styles.chip} ${category === item.key ? styles.chipActive : ''}`}
                onClick={() => setCategory(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.chip} ${visibility === 'ALL' ? styles.chipActive : ''}`}
              onClick={() => setVisibility(value => value === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
            >
              {visibility === 'ACTIVE' ? '完了済みも表示' : '進行中だけ表示'}
            </button>
          </div>
        </div>

        {viewMode === 'CALENDAR' ? (
          <>
            <section className={styles.calendarPanel} aria-label={`${monthLabel(calendarMonth)}の月間カレンダー`}>
              <div className={styles.calendarToolbar}>
                <button type="button" className={styles.monthButton} onClick={() => setCalendarMonth(month => shiftMonth(month, -1))} aria-label="前の月">←</button>
                <h2 className={styles.calendarTitle}>{monthLabel(calendarMonth)}</h2>
                <button type="button" className={styles.monthButton} onClick={() => setCalendarMonth(month => shiftMonth(month, 1))} aria-label="次の月">→</button>
                {nextAvailableMonth && nextAvailableMonth !== calendarMonth && (
                  <button type="button" className={styles.nextEventMonth} onClick={() => setCalendarMonth(nextAvailableMonth)}>
                    予定がある月へ
                  </button>
                )}
              </div>

              <div className={styles.calendarGrid}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <div key={label} className={`${styles.weekday} ${index === 0 ? styles.sunday : ''} ${index === 6 ? styles.saturday : ''}`}>{label}</div>
                ))}
                {cells.map(cell => {
                  const dayEvents = eventsByDay.get(cell.day) ?? []
                  const isToday = cell.day === today
                  return (
                    <div
                      key={cell.day}
                      className={`${styles.calendarDay} ${cell.inMonth ? '' : styles.outsideMonth} ${isToday ? styles.today : ''}`}
                    >
                      <div className={styles.dayNumber}>{cell.dayNumber}</div>
                      <div className={styles.calendarEvents}>
                        {dayEvents.slice(0, 2).map(event => {
                          const priority = PRIORITY_STYLE[event.priority]
                          const label = `${event.issuerCode ? `${event.issuerCode} ` : ''}${event.issuerName} ${event.title}`
                          return (
                            <a
                              key={event.eventId}
                              href={`#${event.eventId}`}
                              className={styles.calendarEvent}
                              style={{ color: priority.color, background: priority.background }}
                              title={label}
                              aria-label={`${cell.day} ${label}`}
                            >
                              <span className={styles.calendarEventDot} aria-hidden="true">●</span>
                              <span className={styles.calendarEventLabel}>{event.issuerCode ?? event.issuerName}</span>
                            </a>
                          )
                        })}
                        {dayEvents.length > 2 && <div className={styles.moreEvents}>+{dayEvents.length - 2}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><span>{monthLabel(calendarMonth)}の予定</span><span>{monthEvents.length}件</span></h2>
              {monthEvents.length ? (
                <div className={styles.eventGrid}>{monthEvents.map(event => <EventCard key={event.eventId} event={event} />)}</div>
              ) : (
                <div className={styles.empty}>この月に条件と一致するイベントはありません。「予定がある月へ」を押すと次の予定を表示します。</div>
              )}
            </section>
          </>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>条件に合うイベントはありません。</div>
        ) : GROUP_ORDER.map(group => {
          const events = grouped.get(group)
          if (!events?.length) return null
          return (
            <section key={group} className={styles.section}>
              <h2 className={styles.sectionTitle}><span>{group}</span><span>{events.length}件</span></h2>
              <div className={styles.eventGrid}>{events.map(event => <EventCard key={event.eventId} event={event} />)}</div>
            </section>
          )
        })}
      </div>
    </>
  )
}
