'use client'

import { useEffect } from 'react'

type Props = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: Props) {
  useEffect(() => {
    console.error('[alpha-pon] error boundary:', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '60dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
        color: 'var(--ink)',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: 'var(--ink)' }}>
        エラーが発生しました
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.6, margin: '0 0 20px' }}>
        データの読み込みに失敗しました。<br />
        <code
          style={{
            background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4,
            fontSize: 12, fontFamily: 'monospace',
          }}
        >
          pnpm ui:data
        </code>{' '}
        を実行後、再試行してください。
      </p>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '0 0 24px' }}>
        {error.message}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '12px 24px',
          borderRadius: 12,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--ui)',
          cursor: 'pointer',
          boxShadow: '0 4px 12px var(--accent-shadow)',
        }}
      >
        再試行する
      </button>
    </div>
  )
}
