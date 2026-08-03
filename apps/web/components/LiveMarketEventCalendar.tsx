'use client'

import type { WebMarketEventData } from '@/lib/market-events'
import { useMarketEventData } from '@/lib/use-market-events'
import { MarketEventCalendar } from './MarketEventCalendar'

export function LiveMarketEventCalendar({ fallback, nowIso }: { fallback: WebMarketEventData; nowIso: string }) {
  const { data, delivery, loading } = useMarketEventData(fallback)
  const warnings = [
    ...data.meta.warnings,
    loading
      ? 'Cloudflare APIの接続状態を確認中です。'
      : delivery === 'api'
        ? 'Cloudflare D1のLIVEデータを表示しています。'
        : '生成済みSNAPSHOTを表示しています。Cloudflare未接続またはAPI利用不可です。',
  ]
  return <MarketEventCalendar data={{ ...data, meta: { ...data.meta, warnings } }} nowIso={nowIso} />
}
