'use client'

import { useEffect, useState } from 'react'
import type { WebMarketEventData } from '@/lib/market-event-data'
import { useMarketEventData } from '@/lib/use-market-events'
import { MarketEventCalendar } from './MarketEventCalendar'

export function LiveMarketEventCalendar({ fallback, nowIso: initialNowIso }: { fallback: WebMarketEventData; nowIso: string }) {
  const { data, delivery, loading } = useMarketEventData(fallback)
  const [nowIso, setNowIso] = useState(initialNowIso)

  useEffect(() => {
    const refreshNow = () => setNowIso(new Date().toISOString())
    refreshNow()
    const timer = window.setInterval(refreshNow, 60_000)
    return () => window.clearInterval(timer)
  }, [])

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
