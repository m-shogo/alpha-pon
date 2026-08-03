import { MarketEventCalendar } from '@/components/MarketEventCalendar'
import { loadMarketEventData } from '@/lib/market-events'

export const metadata = {
  title: '重要イベント',
  description: '決算・会見・調査報告・企業構造イベントを、判断条件と一次情報付きで確認します。',
}

export const dynamic = 'force-static'

export default function CalendarPage() {
  const data = loadMarketEventData()
  return <MarketEventCalendar data={data} nowIso={new Date().toISOString()} />
}
