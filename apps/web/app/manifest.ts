import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Alpha Pon',
    short_name: 'Alpha Pon',
    description: 'Edge候補・重要イベント・判断条件を追跡する個人用リサーチアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFF7F2',
    theme_color: '#FFF7F2',
    orientation: 'portrait-primary',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    shortcuts: [
      {
        name: '重要イベント',
        short_name: 'カレンダー',
        description: '次の決算・会見・調査報告を見る',
        url: '/calendar',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      {
        name: '調査候補',
        short_name: '候補',
        description: '現在の調査候補を見る',
        url: '/alerts',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    ],
  }
}
