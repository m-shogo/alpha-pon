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
  { key: '/research', label: '研究',   icon: 'spark' },
  { key: '/reports',  label: '資料',   icon: 'doc' },
  { key: '/ops',      label: '運用',   icon: 'check' },
]

const MOBILE_PRIMARY = TABS.filter((tab) => ['/', '/research', '/stocks', '/alerts'].includes(tab.key))
const MOBILE_MORE = TABS.filter((tab) => ['/calendar', '/actions', '/reports', '/ops'].includes(tab.key))

function isActive(pathname: string, key: string): boolean {
  return pathname === key || (key !== '/' && pathname.startsWith(key))
}

export function DesktopNav() {
  const pathname = usePathname()

  return (
    <aside className="ap-desktop-sidebar" aria-label="メインナビゲーション">
      <div className="ap-sidebar-brand">
        <div className="ap-sidebar-brand-mark">AP</div>
        <div>
          <div className="ap-sidebar-brand-title">Alpha Pon</div>
          <div className="ap-sidebar-brand-subtitle">調査・研究</div>
        </div>
      </div>

      <nav className="ap-sidebar-nav">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.key)
          return (
            <Link
              key={tab.key}
              href={tab.key}
              aria-current={active ? 'page' : undefined}
              className={`ap-sidebar-link${active ? ' is-active' : ''}`}
            >
              <Icon name={tab.icon} size={19} strokeWidth={active ? 2.25 : 1.9} />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="ap-sidebar-footer">
        <span className="ap-readonly-dot" aria-hidden="true" />
        閲覧専用
      </div>
    </aside>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const moreActive = MOBILE_MORE.some((tab) => isActive(pathname, tab.key))

  return (
    <nav className="ap-mobile-nav" aria-label="メインナビゲーション">
      {MOBILE_PRIMARY.map((tab) => {
        const active = isActive(pathname, tab.key)
        return (
          <Link
            key={tab.key}
            href={tab.key}
            aria-current={active ? 'page' : undefined}
            className={`ap-mobile-nav-link${active ? ' is-active' : ''}`}
          >
            <Icon name={tab.icon} size={22} strokeWidth={active ? 2.35 : 1.9} />
            <span>{tab.label}</span>
          </Link>
        )
      })}

      <details className={`ap-mobile-more${moreActive ? ' is-active' : ''}`}>
        <summary className="ap-mobile-nav-link" aria-label="その他のメニュー">
          <Icon name="more" size={22} strokeWidth={2} />
          <span>その他</span>
        </summary>
        <div className="ap-mobile-more-menu">
          <div className="ap-mobile-more-title">その他</div>
          {MOBILE_MORE.map((tab) => {
            const active = isActive(pathname, tab.key)
            return (
              <Link
                key={tab.key}
                href={tab.key}
                aria-current={active ? 'page' : undefined}
                className={`ap-mobile-more-link${active ? ' is-active' : ''}`}
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              >
                <Icon name={tab.icon} size={19} strokeWidth={active ? 2.25 : 1.9} />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </details>
    </nav>
  )
}
