'use client'

import { useState } from 'react'
import styles from '@/app/calendar/calendar.module.css'

type State = 'idle' | 'loading' | 'copied' | 'failed'

function snapshotFeedUrl(): string {
  return new URL('/generated/alpha-pon-events.ics', window.location.origin).toString()
}

export function CalendarFeedActions() {
  const [state, setState] = useState<State>('idle')

  async function copySnapshotUrl() {
    setState('loading')
    try {
      await navigator.clipboard.writeText(snapshotFeedUrl())
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  function openSnapshotFeed() {
    setState('loading')
    try {
      window.open(snapshotFeedUrl(), '_blank', 'noopener,noreferrer')
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  const copyLabel = state === 'loading'
    ? '処理中…'
    : state === 'copied'
      ? 'SNAPSHOT URLをコピー済み'
      : state === 'failed'
        ? 'コピー失敗'
        : 'SNAPSHOT URLをコピー'

  return (
    <div>
      <div className={styles.actions} aria-label="公開カレンダー購読">
        <button className={styles.actionButton} type="button" onClick={copySnapshotUrl} disabled={state === 'loading'} aria-live="polite">
          {copyLabel}
        </button>
        <button className={styles.actionButton} type="button" onClick={openSnapshotFeed} disabled={state === 'loading'}>
          SNAPSHOT ICSを開く
        </button>
      </div>
      <div className={styles.subtitle}>
        公開購読は生成時点のSNAPSHOTです。画面の表示元はページ内の状態メッセージで確認できます。
        Token付きLIVE購読URLはこの画面へ出さず、本人がパスワード管理アプリから手動登録します。
      </div>
    </div>
  )
}
