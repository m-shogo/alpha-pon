import type { MarketEvent } from './contracts.js'

export type MarketEventWebProjection = {
  schemaVersion: 1
  generatedAt: string
  source: 'local-ledger' | 'd1' | 'fallback'
  staleAfter: string
  events: MarketEvent[]
  counts: {
    total: number
    scheduled: number
    unknownDate: number
    actionRequired: number
  }
}

function eventSortKey(event: MarketEvent): string {
  return event.time.startAt ?? event.time.windowStart ?? '9999-12-31T23:59:59Z'
}

export function buildWebProjection(params: {
  events: Iterable<MarketEvent>
  generatedAt: string
  source?: MarketEventWebProjection['source']
  staleAfterHours?: number
}): MarketEventWebProjection {
  const events = [...params.events].sort((a, b) => {
    const dateOrder = eventSortKey(a).localeCompare(eventSortKey(b))
    if (dateOrder !== 0) return dateOrder
    const priorityOrder = a.priority.localeCompare(b.priority)
    return priorityOrder !== 0 ? priorityOrder : a.eventId.localeCompare(b.eventId)
  })
  const staleAfterHours = params.staleAfterHours ?? 6
  const staleAfter = new Date(Date.parse(params.generatedAt) + staleAfterHours * 60 * 60 * 1000).toISOString()

  return {
    schemaVersion: 1,
    generatedAt: params.generatedAt,
    source: params.source ?? 'local-ledger',
    staleAfter,
    events,
    counts: {
      total: events.length,
      scheduled: events.filter((event) => ['SCHEDULED', 'TENTATIVE', 'IN_PROGRESS'].includes(event.status)).length,
      unknownDate: events.filter((event) => event.time.precision === 'UNKNOWN').length,
      actionRequired: events.filter((event) => ['BUY_WATCH', 'WAIT', 'BLOCK', 'ABSTAIN'].includes(event.currentDecisionState)).length,
    },
  }
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function toUtcIcs(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function dateOnly(value: string): string {
  return value.slice(0, 10).replace(/-/g, '')
}

export function buildIcsCalendar(params: {
  events: Iterable<MarketEvent>
  generatedAt: string
  calendarName?: string
  detailBaseUrl?: string
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alpha Pon//Market Events//JA',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(params.calendarName ?? 'Alpha Pon Market Events')}`,
  ]

  for (const event of params.events) {
    if (event.status === 'CANCELLED' || event.time.precision === 'UNKNOWN') continue
    const start = event.time.startAt ?? event.time.windowStart
    if (!start) continue
    const end = event.time.endAt ?? event.time.windowEnd
    const description = [
      `重要度: ${event.priority}`,
      `判断: ${event.currentDecisionState}`,
      event.whyItMatters,
      event.checksBefore.length ? `事前確認: ${event.checksBefore.join(' / ')}` : '',
      event.checksAfter.length ? `通過後確認: ${event.checksAfter.join(' / ')}` : '',
    ].filter(Boolean).join('\n')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.eventId}@alpha-pon`)
    lines.push(`DTSTAMP:${toUtcIcs(params.generatedAt)}`)
    if (event.time.precision === 'DATE_ONLY' || event.time.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`)
      if (end) lines.push(`DTEND;VALUE=DATE:${dateOnly(end)}`)
    } else {
      lines.push(`DTSTART:${toUtcIcs(start)}`)
      if (end) lines.push(`DTEND:${toUtcIcs(end)}`)
    }
    lines.push(`SUMMARY:${escapeIcs(`[${event.priority}][${event.issuerCode ?? '-'}] ${event.title}`)}`)
    lines.push(`DESCRIPTION:${escapeIcs(description)}`)
    if (params.detailBaseUrl) {
      lines.push(`URL:${params.detailBaseUrl.replace(/\/$/, '')}/calendar?event=${encodeURIComponent(event.eventId)}`)
    }
    lines.push(`STATUS:${event.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
