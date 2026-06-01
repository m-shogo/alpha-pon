import { Icon } from './Icon'

export function DisclaimerBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '7px 14px',
        background: 'var(--disc-bg)',
        borderTop: '1px solid var(--disc-line)',
        flexShrink: 0,
      }}
    >
      <span style={{ color: 'var(--accent)', display: 'flex' }}>
        <Icon name="alert" size={14} strokeWidth={2.2} />
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--disc-ink)', letterSpacing: 0.2 }}>
        買い推奨ではありません ・ これは調査候補です
      </span>
    </div>
  )
}
