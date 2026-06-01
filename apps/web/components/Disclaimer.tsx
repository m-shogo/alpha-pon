type Props = {
  compact?: boolean
}

export function Disclaimer({ compact }: Props) {
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
        本サービスは投資判断の補助情報を提供するものであり、特定銘柄の売買を推奨するものではありません。
        掲載情報の正確性・完全性を保証するものではなく、最終的な投資判断はご自身の責任で行ってください。
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
        本サービスは投資判断の補助情報を提供するものであり、特定銘柄の売買を推奨するものではありません。
        掲載されている情報の正確性・完全性・最新性を保証するものではなく、
        情報の利用によって生じたいかなる損害についても責任を負いません。
        最終的な投資判断はご自身の責任において行ってください。
      </p>
    </section>
  )
}
