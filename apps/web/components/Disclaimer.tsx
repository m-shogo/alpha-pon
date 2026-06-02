import { getAppMode, getDisclaimer } from '@/lib/stock/display-mode'

type Props = {
  compact?: boolean
}

export function Disclaimer({ compact }: Props) {
  const text = getDisclaimer(getAppMode())

  if (compact) {
    return (
      <div
        style={{
          padding: '8px 14px',
          background: 'var(--surface-2)',
          borderRadius: 10,
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--ink-3)',
          lineHeight: 1.6,
          textAlign: 'center',
        }}
      >
        {text}
      </div>
    )
  }

  return (
    <section
      style={{
        margin: '20px 0 8px',
        padding: '14px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        borderRadius: 14,
        fontSize: 12.5,
        fontWeight: 600,
        color: 'var(--ink-2)',
        lineHeight: 1.7,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 6, letterSpacing: 0.3 }}>
        ⚠ 免責事項
      </div>
      <p style={{ margin: 0 }}>
        {text}
      </p>
    </section>
  )
}
