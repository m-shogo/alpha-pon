'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import type { WebMarketEventData } from '@/lib/market-events'
import { MarketEventHomeCard } from './MarketEventHomeCard'
import { NavBar } from './NavBar'
import { DisclaimerBar } from './DisclaimerBar'
import { PwaRegistrar } from './PwaRegistrar'

function shellWidth(pathname: string): number {
  if (pathname.startsWith('/calendar')) return 1180
  if (pathname.startsWith('/ops')) return 760
  return 480
}

export function AppShell({ children, marketEvents }: { children: ReactNode; marketEvents: WebMarketEventData }) {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const maxWidth = shellWidth(pathname)

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{
        width: '100%',
        maxWidth,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        transition: 'max-width 180ms ease',
      }}>
        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
          {isHome && <MarketEventHomeCard data={marketEvents} />}
          {children}
        </main>
        <DisclaimerBar />
        <NavBar />
        <PwaRegistrar />
      </div>
    </div>
  )
}
