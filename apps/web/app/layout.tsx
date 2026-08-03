import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppShell } from '@/components/AppShell'
import { loadMarketEventData } from '@/lib/market-events'

export const metadata: Metadata = {
  title: {
    default: 'alpha-pon',
    template: '%s | alpha-pon',
  },
  description:
    '一次情報からEdge候補・重要イベント・確認条件を追跡する個人用リサーチアプリ。特定銘柄の売買を推奨するものではありません。',
  manifest: '/manifest.webmanifest',
  applicationName: 'Alpha Pon',
  appleWebApp: {
    capable: true,
    title: 'Alpha Pon',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFF7F2',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const marketEvents = loadMarketEventData()
  return (
    <html lang="ja">
      <body>
        <AppShell marketEvents={marketEvents}>{children}</AppShell>
      </body>
    </html>
  )
}
