// 現在は apps/web/public/generated/alpha-pon-data.json から読み込む。
// 将来 DB/API 化する場合も、UI 側はこのファイルの関数を呼ぶだけにしておく。
//
// 将来の差し替え例:
// - Prisma から読む場合: prisma.stock.findMany() をラップする
// - Route Handler 経由: fetch('/api/stocks') に変える
// - 外部 API から読む: fetch('https://api.example.com/alpha-pon/data') に変える
//
// UI コンポーネントはこのファイル以外で JSON を直接読まない。

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AlphaPonGeneratedData as ProData } from './types'
import type { AlphaPonGeneratedData as StocksData } from '@/types/alpha-pon'

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'alpha-pon-data.json')

// ─── sync 版（Server Component から直接呼ぶ用・既存ページ互換） ────────────────

const FALLBACK_PRO: ProData = {
  generatedAt: null,
  headline: 'alpha-pon Pro Dashboard',
  summary: { strategic: '', pipeline: '', committee: '', roadmap: [], refresh: [] },
  reports: [],
  candidates: [],
}

export function loadGeneratedData(): ProData {
  if (!existsSync(DATA_PATH)) return FALLBACK_PRO
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as ProData
  } catch {
    return FALLBACK_PRO
  }
}

// ─── async 版（新しい stocks ページ向け） ──────────────────────────────────────

const FALLBACK_STOCKS: StocksData = {
  generatedAt: new Date().toISOString(),
  stocks: [],
  meta: { warnings: ['データファイルが見つかりません。pnpm ui:data を実行してください。'] },
}

export async function getGeneratedData(): Promise<StocksData> {
  if (!existsSync(DATA_PATH)) return FALLBACK_STOCKS
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // stocks フィールドが存在しない場合（古いJSONとの互換）はフォールバック
    if (!Array.isArray(parsed.stocks)) {
      return {
        ...FALLBACK_STOCKS,
        generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : FALLBACK_STOCKS.generatedAt,
        meta: { warnings: ['stocks フィールドがありません。pnpm ui:data を再実行してください。'] },
      }
    }

    return {
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : FALLBACK_STOCKS.generatedAt,
      stocks: parsed.stocks as StocksData['stocks'],
      meta: { source: 'generated-json', version: '1' },
    }
  } catch {
    return FALLBACK_STOCKS
  }
}
