'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './Icon'

const TABS = [
  { key: '/',        label: 'ホーム', icon: 'home' },
  { key: '/stocks',  label: '銘柄',   icon: 'watch' },
  { key: '/alerts',  label: '候補',   icon: 'bell' },
  { key: '/world',   label: '情勢',   icon: 'spark' },
  { key: '/reports', label: 'レポート', icon: 'doc' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        display: 'flex',
        padding: '8px 8px 24px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--line)',
        flexShrink: 0,
      }}
    >
      {TABS.map((t) => {
        const active = pathname === t.key || (t.key !== '/' && pathname.startsWith(t.key))
        return (
          <Link
            key={t.key}
            href={t.key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '4px 0',
              color: active ? 'var(--accent)' : 'var(--ink-3)',
              textDecoration: 'none',
              fontFamily: 'var(--ui)',
            }}
          >
            <Icon name={t.icon} size={24} strokeWidth={active ? 2.4 : 2} color="currentColor" />
            <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600 }}>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
