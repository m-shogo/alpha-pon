import type { CSSProperties, ReactNode } from 'react'

type Props = {
  children: ReactNode
  pad?: number
  style?: CSSProperties
}

export function Card({ children, pad = 16, style }: Props) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 20,
        padding: pad,
        boxShadow: 'var(--shadow)',
        border: '1px solid var(--card-line)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

type SectionLabelProps = {
  children: ReactNode
  icon?: ReactNode
}

export function SectionLabel({ children, icon }: SectionLabelProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '22px 4px 11px' }}>
      {icon && <span style={{ color: 'var(--ink-3)', display: 'flex' }}>{icon}</span>}
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)', letterSpacing: 0.4 }}>
        {children}
      </span>
    </div>
  )
}
