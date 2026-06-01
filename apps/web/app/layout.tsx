import type { Metadata } from 'next'
import './globals.css'
import { NavBar } from '@/components/NavBar'
import { DisclaimerBar } from '@/components/DisclaimerBar'

export const metadata: Metadata = {
  title: {
    default: 'alpha-pon',
    template: '%s | alpha-pon',
  },
  description:
    '長期投資向け調査候補・確認ポイント自動発見アプリ。特定銘柄の売買を推奨するものではありません。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            justifyContent: 'center',
            background: 'var(--bg)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100dvh',
            }}
          >
            <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
              {children}
            </main>
            <DisclaimerBar />
            <NavBar />
          </div>
        </div>
      </body>
    </html>
  )
}
