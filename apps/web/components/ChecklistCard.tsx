'use client'

import { useState } from 'react'
import { Icon } from './Icon'

type Props = {
  items: string[]
}

export function ChecklistCard({ items }: Props) {
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 20,
        padding: 6,
        boxShadow: 'var(--shadow)',
        border: '1px solid var(--card-line)',
      }}
    >
      {items.map((r, i) => {
        const on = checked[i] ?? false
        return (
          <div
            key={i}
            onClick={() => setChecked((s) => ({ ...s, [i]: !s[i] }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 20, height: 20, borderRadius: 99,
                border: on ? 'none' : '2px solid var(--line-strong)',
                background: on ? 'var(--accent)' : 'transparent',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all .15s',
              }}
            >
              {on && <Icon name="check" size={12} strokeWidth={3} color="#fff" />}
            </span>
            <span
              style={{
                fontSize: 14, fontWeight: 600,
                color: on ? 'var(--ink-3)' : 'var(--ink)',
                textDecoration: on ? 'line-through' : 'none',
              }}
            >
              {r}
            </span>
          </div>
        )
      })}
    </div>
  )
}
