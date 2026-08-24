import 'server-only'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readCanonicalGeneratedJsonFile } from './generated-api-file'
import {
  EMPTY_MARKET_EVENT_DATA,
  normalizeMarketEventData,
  type WebMarketEventData,
} from './market-event-data'

export * from './market-event-data'

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'alpha-pon-events.json')

export function loadMarketEventData(): WebMarketEventData {
  if (!existsSync(DATA_PATH)) return EMPTY_MARKET_EVENT_DATA
  try {
    return normalizeMarketEventData(readCanonicalGeneratedJsonFile(DATA_PATH))
  } catch {
    return {
      ...EMPTY_MARKET_EVENT_DATA,
      meta: { ...EMPTY_MARKET_EVENT_DATA.meta, warnings: ['イベントJSONの読み込みに失敗しました。'] },
    }
  }
}
