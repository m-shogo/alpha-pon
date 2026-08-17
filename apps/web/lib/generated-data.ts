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
import type { AlphaPonGeneratedData as ProData, Candidate, GeneratedReport, RunCursorState } from './types'
import type { AlphaPonGeneratedData as StocksData } from '@/types/alpha-pon'
import {
  isGeneratedPipelineStatusInput,
  isGeneratedReportInput,
  isGeneratedRunCursorState,
  isGeneratedWorldThemeCandidateHypothesisInput,
  normalizeGeneratedArrayInput,
  normalizeGeneratedObjectInput,
  normalizeGeneratedWarningsInput,
  normalizeOptionalGeneratedRecordInput,
  type GeneratedWorldThemeCandidateHypothesisInput,
} from './generated-array-input'

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'alpha-pon-data.json')

// ─── sync 版（Server Component から直接呼ぶ用・既存ページ互換） ────────────────

const FALLBACK_PRO: ProData = {
  generatedAt: null,
  headline: 'alpha-pon Pro Dashboard',
  summary: { strategic: '', pipeline: '', committee: '', roadmap: [], refresh: [] },
  reports: [],
  candidates: [],
  universeCandidates: [],
  universeScan: null,
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
  specialSituationOps: null,
  hypothesisOutcomeIntegrity: null,
  worldImpactReviews: [],
  worldImpactAudit: null,
  meta: { warnings: ['データファイルが見つからないか、読み込みに失敗しました。pnpm ui:data を実行してください。'] },
}

type DataQualityRow = NonNullable<ProData['dataQualityByCode']>[string]
type UniverseCandidateRow = NonNullable<ProData['universeCandidates']>[number]

type ProDataWithWorldThemeCandidateHypotheses = ProData & {
  worldThemeCandidateHypotheses?: GeneratedWorldThemeCandidateHypothesisInput[]
}

const CANDIDATE_STATUSES = new Set(['research', 'watch', 'candidate', 'active', 'ignore', 'expired'])
const CANDIDATE_PRIORITIES = new Set(['S', 'A', 'B', 'C'])
const SCORE_KEYS = ['structuralEvent', 'supplyDemand', 'valuation', 'theme', 'businessSafety', 'aiReview'] as const

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isCandidateRow(value: unknown): value is Candidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const score = row.score
  if (!score || typeof score !== 'object' || Array.isArray(score)) return false
  const scoreRecord = score as Record<string, unknown>

  return typeof row.code === 'string'
    && row.code.length > 0
    && typeof row.name === 'string'
    && typeof row.market === 'string'
    && typeof row.status === 'string'
    && CANDIDATE_STATUSES.has(row.status)
    && typeof row.priority === 'string'
    && CANDIDATE_PRIORITIES.has(row.priority)
    && isStringArray(row.tags)
    && isFiniteNumberOrNull(row.price)
    && isFiniteNumberOrNull(row.changePct)
    && isFiniteNumberOrNull(row.drawdownPct)
    && SCORE_KEYS.every((key) => typeof scoreRecord[key] === 'number' && Number.isFinite(scoreRecord[key]))
    && isStringArray(row.reasons)
    && isStringArray(row.negativeReasons)
    && isStringArray(row.nextToSee)
    && typeof row.triggeredRule === 'string'
    && (row.lastNotifiedAt === null || typeof row.lastNotifiedAt === 'string')
    && (row.sparkline === undefined || (Array.isArray(row.sparkline) && row.sparkline.every((item) => typeof item === 'number' && Number.isFinite(item))))
}

function isUniverseCandidateRow(value: unknown): value is UniverseCandidateRow {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isDataQualityRow(value: unknown): value is DataQualityRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.dataQuality === 'string'
    && Array.isArray(row.warnings)
    && row.warnings.every((warning) => typeof warning === 'string')
}

function normalizeGeneratedMeta(meta: unknown, warning: string | null): ProData['meta'] {
  const isObject = Boolean(meta && typeof meta === 'object' && !Array.isArray(meta))
  const object = isObject ? meta as Record<string, unknown> : {}
  const warningLoad = normalizeGeneratedWarningsInput(object.warnings)
  const warnings = [...warningLoad.warnings]
  if (warningLoad.warning) warnings.push(warningLoad.warning)
  if (warning) warnings.push(warning)

  if (!isObject && warnings.length === 0) return null
  return {
    ...object,
    warnings,
  } as ProData['meta']
}

function normalizeGeneratedData(value: unknown): ProDataWithWorldThemeCandidateHypotheses {
  const rootLoad = normalizeGeneratedObjectInput(value, 'generatedData')
  const data = rootLoad.object as Partial<ProData> & { worldThemeCandidateHypotheses?: unknown }
  const reportLoad = normalizeGeneratedArrayInput<GeneratedReport>(data.reports, 'reports', isGeneratedReportInput)
  const candidateLoad = normalizeGeneratedArrayInput<Candidate>(data.candidates, 'candidates', isCandidateRow)
  const universeCandidateLoad = normalizeGeneratedArrayInput<UniverseCandidateRow>(
    data.universeCandidates,
    'universeCandidates',
    isUniverseCandidateRow,
  )
  const companyMemoryLoad = normalizeGeneratedArrayInput<NonNullable<ProData['companyMemory']>[number]>(
    data.companyMemory,
    'companyMemory',
  )
  const dataQualityLoad = normalizeOptionalGeneratedRecordInput<DataQualityRow>(
    data.dataQualityByCode,
    'dataQualityByCode',
    isDataQualityRow,
  )
  const runCursorLoad = normalizeOptionalGeneratedRecordInput<RunCursorState>(
    data.runCursors,
    'runCursors',
    isGeneratedRunCursorState,
  )
  const worldThemeCandidateHypothesisLoad = normalizeGeneratedArrayInput<GeneratedWorldThemeCandidateHypothesisInput>(
    data.worldThemeCandidateHypotheses,
    'worldThemeCandidateHypotheses',
    isGeneratedWorldThemeCandidateHypothesisInput,
  )
  const hasPipelineStatus = data.pipelineStatus !== undefined && data.pipelineStatus !== null
  const pipelineStatus = hasPipelineStatus && isGeneratedPipelineStatusInput(data.pipelineStatus)
    ? data.pipelineStatus
    : null
  const pipelineStatusWarning = hasPipelineStatus && !pipelineStatus
    ? 'pipelineStatus: invalid_shape'
    : null
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
    reports: reportLoad.rows,
    candidates: candidateLoad.rows,
    universeCandidates: universeCandidateLoad.rows,
    universeScan: data.universeScan ?? null,
    hypothesisPredictions: Array.isArray(data.hypothesisPredictions) ? data.hypothesisPredictions : [],
    hypothesisOutcomes: Array.isArray(data.hypothesisOutcomes) ? data.hypothesisOutcomes : [],
    generatedCompanyRules: Array.isArray(data.generatedCompanyRules) ? data.generatedCompanyRules : [],
    positions: Array.isArray(data.positions) ? data.positions : [],
    accuracySummary: data.accuracySummary ?? null,
    worldContext: data.worldContext ?? null,
    worldThemeCandidateHypotheses: worldThemeCandidateHypothesisLoad.rows,
    companyMemory: companyMemoryLoad.rows,
    companyMemoryByCode: data.companyMemoryByCode ?? {},
    primaryDisclosureReviews: data.primaryDisclosureReviews ?? {},
    dataQualityByCode: dataQualityLoad.record,
    runCursors: runCursorLoad.record,
    readiness: data.readiness ?? null,
    ipoThemeWatch: data.ipoThemeWatch ?? null,
    specialSituationWatch: data.specialSituationWatch ?? null,
    specialSituationOps: data.specialSituationOps ?? null,
    hypothesisOutcomeIntegrity: data.hypothesisOutcomeIntegrity ?? null,
    worldImpactReviews: Array.isArray((data as { worldImpactReviews?: unknown[] }).worldImpactReviews)
      ? (data as { worldImpactReviews?: ProData['worldImpactReviews'] }).worldImpactReviews
      : [],
    worldImpactAudit: (data as { worldImpactAudit?: ProData['worldImpactAudit'] }).worldImpactAudit ?? null,
    pipelineStatus,
    meta: normalizeGeneratedMeta(
      normalizeGeneratedMeta(
        normalizeGeneratedMeta(
          normalizeGeneratedMeta(
            normalizeGeneratedMeta(
              normalizeGeneratedMeta(
                normalizeGeneratedMeta(
                  normalizeGeneratedMeta(
                    normalizeGeneratedMeta(data.meta, rootLoad.warning),
                    reportLoad.warning,
                  ),
                  candidateLoad.warning,
                ),
                universeCandidateLoad.warning,
              ),
              companyMemoryLoad.warning,
            ),
            dataQualityLoad.warning,
          ),
          runCursorLoad.warning,
        ),
        worldThemeCandidateHypothesisLoad.warning,
      ),
      pipelineStatusWarning,
    ),
  }
}

export function loadGeneratedData(): ProDataWithWorldThemeCandidateHypotheses {
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