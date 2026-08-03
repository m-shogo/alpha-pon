'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './Icon'

const TABS = [
  { key: '/',         label: 'ホーム', icon: 'home' },
  { key: '/calendar', label: '予定',   icon: 'calendar' },
  { key: '/stocks',   label: '銘柄',   icon: 'watch' },
  { key: '/alerts',   label: '候補',   icon: 'bell' },
  { key: '/actions',  label: '行動',   icon: 'spark' },
  { key: '/reports',  label: '資料',   icon: 'doc' },
  { key: '/ops',      label: '運用',   icon: 'check' },
]

export function NavBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="メインナビゲーション"
      style={{
        display: 'flex',
        padding: '7px 5px calc(12px + env(safe-area-inset-bottom))',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--line)',
        flexShrink: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {TABS.map((t) => {
        const active = pathname === t.key || (t.key !== '/' && pathname.startsWith(t.key))
        return (
          <Link
            key={t.key}
            href={t.key}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: '1 0 54px',
              minWidth: 54,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '4px 0',
              color: active ? 'var(--accent)' : 'var(--ink-3)',
              textDecoration: 'none',
              fontFamily: 'var(--ui)',
            }}
          >
            <Icon name={t.icon} size={22} strokeWidth={active ? 2.4 : 2} color="currentColor" />
            <span style={{ fontSize: 9.5, fontWeight: active ? 850 : 650 }}>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
