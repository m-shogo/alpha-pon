'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import type { WebMarketEventData } from '@/lib/market-event-data'
import { MarketEventHomeCard } from './MarketEventHomeCard'
import { DesktopNav, MobileNav } from './NavBar'
import { DisclaimerBar } from './DisclaimerBar'
import { PwaRegistrar } from './PwaRegistrar'

function shellWidth(pathname: string): number {
  if (pathname.startsWith('/calendar')) return 1180
  if (pathname.startsWith('/research')) return 1180
  if (pathname.startsWith('/ops')) return 960
  if (pathname === '/') return 760
  return 880
}

export function AppShell({ children, marketEvents }: { children: ReactNode; marketEvents: WebMarketEventData }) {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const maxWidth = shellWidth(pathname)

  return (
    <div className="ap-app-shell">
      <DesktopNav />
      <div className="ap-app-content" style={{ maxWidth }}>
        <main className="ap-main-content">
          {isHome && <MarketEventHomeCard data={marketEvents} />}
          {children}
        </main>
        <DisclaimerBar />
        <MobileNav />
        <PwaRegistrar />
      </div>
    </div>
  )
}
