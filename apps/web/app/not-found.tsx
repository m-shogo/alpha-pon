import Link from 'next/link'

export default function NotFoundPage() {
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
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: 'var(--ink)' }}>
        ページが見つかりません
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.6, margin: '0 0 24px' }}>
        お探しのページは存在しないか、移動しました。
      </p>
      <Link
        href="/"
        style={{
          padding: '12px 24px',
          borderRadius: 12,
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          textDecoration: 'none',
          boxShadow: '0 4px 12px var(--accent-shadow)',
        }}
      >
        ホームに戻る
      </Link>
    </div>
  )
}
