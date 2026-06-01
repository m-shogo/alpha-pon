import type { CSSProperties, ReactNode } from 'react'

type Props = {
  children: ReactNode
  colorVar: string
  softVar: string
  solid?: boolean
}

export function Badge({ children, colorVar, softVar, solid }: Props) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    color: solid ? '#fff' : colorVar,
    background: solid ? colorVar : softVar,
  }
  return <span style={style}>{children}</span>
}

import { ALERT_META, STATUS_META, PRIO_META } from '@/lib/labels'
import type { AlertLevel, CandidateStatus, Priority } from '@/lib/types'

export function AlertBadge({ level, dot }: { level: AlertLevel; dot?: boolean }) {
  const a = ALERT_META[level]
  return (
    <Badge colorVar={a.colorVar} softVar={a.softVar}>
      {dot && (
        <span
          style={{ width: 6, height: 6, borderRadius: 99, background: a.colorVar, flexShrink: 0 }}
        />
      )}
      {a.jp}
    </Badge>
  )
}

export function StatusPill({ status }: { status: CandidateStatus }) {
  const s = STATUS_META[status]
  return <Badge colorVar={s.colorVar} softVar={s.softVar}>{s.jp}</Badge>
}

export function PrioBadge({ priority }: { priority: Priority }) {
  const m = PRIO_META[priority]
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        background: m.bgVar,
        color: m.color,
        fontSize: 12.5,
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {priority}
    </span>
  )
}

export function TagChip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--ink-2)',
        background: 'var(--surface-2)',
        borderRadius: 7,
        padding: '3px 8px',
      }}
    >
      {children}
    </span>
  )
}

export function AlertDot({ level }: { level: AlertLevel }) {
  const a = ALERT_META[level]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: a.colorVar }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>{a.jp}</span>
    </span>
  )
}
