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
  universeCandidates: [],
  hypothesisPredictions: [],
  hypothesisOutcomes: [],
  generatedCompanyRules: [],
  positions: [],
  accuracySummary: null,
  worldContext: null,
  companyMemory: [],
  companyMemoryByCode: {},
  primaryDisclosureReviews: {},
  dataQualityByCode: {},
  runCursors: {},
  readiness: null,
  ipoThemeWatch: null,
  specialSituationWatch: null,
  meta: { warnings: ['データファイルが見つからないか、読み込みに失敗しました。pnpm ui:data を実行してください。'] },
}

function normalizeGeneratedData(value: unknown): ProData {
  const data = value && typeof value === 'object' ? value as Partial<ProData> : {}
  return {
    ...FALLBACK_PRO,
    ...data,
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : null,
    headline: typeof data.headline === 'string' ? data.headline : FALLBACK_PRO.headline,
    summary: {
      ...FALLBACK_PRO.summary,
      ...(data.summary && typeof data.summary === 'object' ? data.summary : {}),
      roadmap: Array.isArray(data.summary?.roadmap) ? data.summary.roadmap : [],
      refresh: Array.isArray(data.summary?.refresh) ? data.summary.refresh : [],
    },
    reports: Array.isArray(data.reports) ? data.reports : [],
    candidates: Array.isArray(data.candidates) ? data.candidates : [],
    universeCandidates: Array.isArray(data.universeCandidates) ? data.universeCandidates : [],
    hypothesisPredictions: Array.isArray(data.hypothesisPredictions) ? data.hypothesisPredictions : [],
    hypothesisOutcomes: Array.isArray(data.hypothesisOutcomes) ? data.hypothesisOutcomes : [],
    generatedCompanyRules: Array.isArray(data.generatedCompanyRules) ? data.generatedCompanyRules : [],
    positions: Array.isArray(data.positions) ? data.positions : [],
    accuracySummary: data.accuracySummary ?? null,
    worldContext: data.worldContext ?? null,
    companyMemory: Array.isArray(data.companyMemory) ? data.companyMemory : [],
    companyMemoryByCode: data.companyMemoryByCode ?? {},
    primaryDisclosureReviews: data.primaryDisclosureReviews ?? {},
    dataQualityByCode: data.dataQualityByCode ?? {},
    runCursors: data.runCursors ?? {},
    readiness: data.readiness ?? null,
    ipoThemeWatch: data.ipoThemeWatch ?? null,
    specialSituationWatch: data.specialSituationWatch ?? null,
    meta: data.meta ?? null,
  }
}

export function loadGeneratedData(): ProData {
  if (!existsSync(DATA_PATH)) return FALLBACK_PRO
  try {
    return normalizeGeneratedData(JSON.parse(readFileSync(DATA_PATH, 'utf-8')))
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
