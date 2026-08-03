'use client'

import { useState } from 'react'
import styles from '@/app/calendar/calendar.module.css'

type State = 'idle' | 'loading' | 'copied-live' | 'copied-snapshot' | 'failed'

async function resolveFeedUrl(): Promise<{ url: string; live: boolean }> {
  try {
    const response = await fetch('/api/calendar-feed-url', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    if (response.ok) {
      const body = await response.json() as { configured?: boolean; url?: unknown }
      if (body.configured && typeof body.url === 'string' && body.url.startsWith('https://')) {
        return { url: body.url, live: true }
      }
    }
  } catch {
    // Cloudflare未接続・offline時は静的snapshotへフォールバックする。
  }
  return { url: `${window.location.origin}/generated/alpha-pon-events.ics`, live: false }
}

export function CalendarFeedActions() {
  const [state, setState] = useState<State>('idle')

  async function copyFeedUrl() {
    setState('loading')
    try {
      const feed = await resolveFeedUrl()
      await navigator.clipboard.writeText(feed.url)
      setState(feed.live ? 'copied-live' : 'copied-snapshot')
    } catch {
      setState('failed')
    }
  }

  async function openFeed() {
    setState('loading')
    try {
      const feed = await resolveFeedUrl()
      window.open(feed.url, '_blank', 'noopener,noreferrer')
      setState(feed.live ? 'idle' : 'copied-snapshot')
    } catch {
      setState('failed')
    }
  }

  const label = state === 'loading'
    ? '取得中…'
    : state === 'copied-live'
      ? 'LIVE購読URLをコピー済み'
      : state === 'copied-snapshot'
        ? 'SNAPSHOT URLを使用'
        : state === 'failed'
          ? '取得失敗'
          : '購読URLをコピー'

  return (
    <div className={styles.actions}>
      <button className={styles.actionButton} type="button" onClick={copyFeedUrl} disabled={state === 'loading'}>
        {label}
      </button>
      <button className={styles.actionButton} type="button" onClick={openFeed} disabled={state === 'loading'}>
        ICSを開く
      </button>
    </div>
  )
}
