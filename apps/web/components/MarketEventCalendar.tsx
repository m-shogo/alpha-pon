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

function relativeDayLabel(today: string, target: string): string {
  const diff = daysFrom(today, target)
  if (diff === 0) return '今日'
  if (diff === 1) return '明日'
  if (diff > 1) return `あと${diff}日`
  return `${Math.abs(diff)}日前`
}

function readableDay(day: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(`${day}T00:00:00+09:00`))
  } catch {
    return day
  }
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

function EventBadges({ event }: { event: WebMarketEvent }) {
  const priority = PRIORITY_STYLE[event.priority]
  const decision = DECISION_STYLE[event.currentDecisionState]
  return (
    <div className={styles.badges}>
      <span className={styles.badge} style={{ color: priority.color, background: priority.background }}>{event.priority}</span>
      <span className={styles.badge} style={{ color: decision.color, background: decision.background }}>{event.currentDecisionState}</span>
      <span className={styles.badge} style={{ color: 'var(--ink-2)', background: 'var(--surface-2)' }}>{STATUS_LABEL[event.status]}</span>
      {event.freshnessState === 'STALE' && (
        <span className={styles.badge} style={{ color: 'var(--urgent)', background: 'var(--urgent-soft)' }}>STALE</span>
      )}
    </div>
  )
}

function EventCard({ event, onOpen }: { event: WebMarketEvent; onOpen: (event: WebMarketEvent) => void }) {
  return (
    <article id={event.eventId} className={styles.eventCard}>
      <div className={styles.eventTop}>
        <EventBadges event={event} />
        <div className={styles.eventDate}>{marketEventDateLabel(event)}</div>
      </div>
      <h3 className={styles.eventTitle}>{event.issuerCode ? `${event.issuerCode} ` : ''}{event.issuerName} — {event.title}</h3>
      <div className={styles.eventMeta}>{event.eventType} · rev.{event.revisionNumber} · {categoryOf(event)}</div>
      <p className={styles.why}>{event.whyItMatters}</p>
      <button type="button" className={styles.openDetailButton} onClick={() => onOpen(event)}>
        詳細・一次情報を見る
      </button>
    </article>
  )
}

function EventDetail({ event }: { event: WebMarketEvent }) {
  return (
    <>
      <div className={styles.modalEventTop}>
        <EventBadges event={event} />
        <div className={styles.eventDate}>{marketEventDateLabel(event)}</div>
      </div>
      <h2 id="market-event-dialog-title" className={styles.modalTitle}>
        {event.issuerCode ? `${event.issuerCode} ` : ''}{event.issuerName} — {event.title}
      </h2>
      <div className={styles.eventMeta}>{event.eventType} · rev.{event.revisionNumber} · {categoryOf(event)}</div>
      <p className={styles.modalWhy}>{event.whyItMatters}</p>

      <div className={styles.detailGrid}>
        <div className={styles.detailBlock}>
          <div className={styles.detailLabel}>事前に見る</div>
          {event.checksBefore.length ? (
            <ul className={styles.detailList}>{event.checksBefore.map(item => <li key={item}>{item}</li>)}</ul>
          ) : <div className={styles.eventMeta}>未登録</div>}
        </div>
        <div className={styles.detailBlock}>
          <div className={styles.detailLabel}>通過後に見る</div>
          {event.checksAfter.length ? (
            <ul className={styles.detailList}>{event.checksAfter.map(item => <li key={item}>{item}</li>)}</ul>
          ) : <div className={styles.eventMeta}>未登録</div>}
        </div>
        <div className={styles.detailBlock}>
          <div className={styles.detailLabel}>関連Edge</div>
          <div className={styles.eventMeta}>{event.edgeTypes.join(' / ') || '未登録'}</div>
        </div>
        <div className={styles.detailBlock}>
          <div className={styles.detailLabel}>鮮度</div>
          <div className={styles.eventMeta}>最終確認 {event.lastVerifiedAt}<br />stale予定 {event.staleAfter ?? '未設定'}</div>
        </div>
        <div className={`${styles.detailBlock} ${styles.sourceBlock}`}>
          <div className={styles.detailLabel}>一次情報</div>
          {event.sources.length ? event.sources.map(source => (
            <a key={source.sourceId} className={styles.sourceLink} href={source.url} target="_blank" rel="noreferrer">
              {source.authority} · {source.title}
            </a>
          )) : <div className={styles.eventMeta}>一次情報リンクなし</div>}
        </div>
      </div>
    </>
  )
}

export function MarketEventCalendar({ data, nowIso }: { data: WebMarketEventData; nowIso: string }) {
  const today = dateOnlyJst(nowIso)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('ALL')
  const [visibility, setVisibility] = useState<Visibility>('ACTIVE')
  const [viewMode, setViewMode] = useState<ViewMode>('CALENDAR')
  const [calendarMonth, setCalendarMonth] = useState(() => monthForEvents(data.events, today))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<WebMarketEvent | null>(null)
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

  useEffect(() => {
    if (!selectedDay && !selectedEvent) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedDay(null)
        setSelectedEvent(null)
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedDay, selectedEvent])

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

  const nextEvent = useMemo(() => data.events
    .filter(event => {
      const day = eventDay(event)
      return day && day >= today && !['COMPLETED', 'CANCELLED'].includes(event.status)
    })
    .sort((a, b) => (a.sortAt ?? '9999-12-31').localeCompare(b.sortAt ?? '9999-12-31'))[0] ?? null, [data.events, today])

  const selectedDayEvents = useMemo(
    () => selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [],
    [eventsByDay, selectedDay],
  )

  const cells = useMemo(() => calendarCells(calendarMonth), [calendarMonth])
  const nextAvailableMonth = availableMonths.find(month => month > calendarMonth) ?? availableMonths[0]
  const dialogOpen = Boolean(selectedDay || selectedEvent)

  const closeDialog = () => {
    setSelectedDay(null)
    setSelectedEvent(null)
  }

  const openEvent = (event: WebMarketEvent, day: string | null = null) => {
    setSelectedDay(day)
    setSelectedEvent(event)
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>重要イベント</h1>
            <div className={styles.subtitle}>予定は日付をタップして確認。詳細はポップアップで開きます。</div>
          </div>
          <CalendarFeedActions />
        </div>
      </header>

      <div className={styles.page}>
        {data.meta.warnings.map(warning => <div key={warning} className={styles.warning}>⚠ {warning}</div>)}

        {nextEvent && (() => {
          const day = eventDay(nextEvent)
          const priority = PRIORITY_STYLE[nextEvent.priority]
          return (
            <button type="button" className={styles.nextEventWidget} onClick={() => openEvent(nextEvent)}>
              <span className={styles.widgetAccent} style={{ background: priority.color }} aria-hidden="true" />
              <span className={styles.widgetBody}>
                <span className={styles.widgetEyebrow}>次の重要予定</span>
                <span className={styles.widgetTitle}>{nextEvent.issuerCode ? `${nextEvent.issuerCode} ` : ''}{nextEvent.issuerName}</span>
                <span className={styles.widgetSubtitle}>{nextEvent.title}</span>
              </span>
              <span className={styles.widgetDate}>
                <strong>{day ? relativeDayLabel(today, day) : '日程未確定'}</strong>
                <span>{marketEventDateLabel(nextEvent)}</span>
              </span>
            </button>
          )
        })()}

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
                  const label = dayEvents.length
                    ? `${readableDay(cell.day)}、予定${dayEvents.length}件。タップして表示`
                    : readableDay(cell.day)
                  return (
                    <button
                      key={cell.day}
                      type="button"
                      className={`${styles.calendarDay} ${cell.inMonth ? '' : styles.outsideMonth} ${isToday ? styles.today : ''} ${dayEvents.length ? styles.hasEvents : ''}`}
                      onClick={() => dayEvents.length && setSelectedDay(cell.day)}
                      disabled={dayEvents.length === 0}
                      aria-label={label}
                    >
                      <span className={styles.dayNumber}>{cell.dayNumber}</span>
                      <span className={styles.calendarEventDots} aria-hidden="true">
                        {dayEvents.slice(0, 3).map(event => (
                          <span key={event.eventId} className={styles.calendarEventDot} style={{ background: PRIORITY_STYLE[event.priority].color }} />
                        ))}
                      </span>
                      {dayEvents.length > 0 && <span className={styles.calendarEventCount}>{dayEvents.length}件</span>}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><span>{monthLabel(calendarMonth)}の予定</span><span>{monthEvents.length}件</span></h2>
              {monthEvents.length ? (
                <div className={styles.eventGrid}>{monthEvents.map(event => <EventCard key={event.eventId} event={event} onOpen={openEvent} />)}</div>
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
              <div className={styles.eventGrid}>{events.map(event => <EventCard key={event.eventId} event={event} onOpen={openEvent} />)}</div>
            </section>
          )
        })}
      </div>

      {dialogOpen && (
        <div className={styles.modalBackdrop} onMouseDown={event => event.target === event.currentTarget && closeDialog()}>
          <section className={styles.modalSheet} role="dialog" aria-modal="true" aria-labelledby="market-event-dialog-title">
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.modalHeader}>
              {selectedEvent && selectedDay ? (
                <button type="button" className={styles.backButton} onClick={() => setSelectedEvent(null)}>← 日付の予定</button>
              ) : <span />}
              <button type="button" className={styles.closeButton} onClick={closeDialog} aria-label="閉じる">×</button>
            </div>

            <div className={styles.modalContent}>
              {selectedEvent ? (
                <EventDetail event={selectedEvent} />
              ) : selectedDay ? (
                <>
                  <div className={styles.modalEyebrow}>この日の予定</div>
                  <h2 id="market-event-dialog-title" className={styles.modalTitle}>{readableDay(selectedDay)}</h2>
                  <div className={styles.dayEventList}>
                    {selectedDayEvents.map(event => {
                      const priority = PRIORITY_STYLE[event.priority]
                      return (
                        <button key={event.eventId} type="button" className={styles.dayEventButton} onClick={() => setSelectedEvent(event)}>
                          <span className={styles.dayEventAccent} style={{ background: priority.color }} />
                          <span className={styles.dayEventBody}>
                            <span className={styles.dayEventIssuer}>{event.issuerCode ? `${event.issuerCode} ` : ''}{event.issuerName}</span>
                            <span className={styles.dayEventTitle}>{event.title}</span>
                            <span className={styles.dayEventMeta}>{event.priority} · {STATUS_LABEL[event.status]} · {event.currentDecisionState}</span>
                          </span>
                          <span className={styles.dayEventArrow}>›</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
