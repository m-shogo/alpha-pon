import { existsSync, readFileSync } from 'fs'
import { basename, join } from 'path'
import { loadGeneratedData } from './generated-data'
import type { Candidate } from './types'
import type { HypothesisOutcome, StockCandidateHypothesis, UniverseCandidate } from '../types/universe'

export type StockDetailStatus = 'ok' | 'info' | 'attention' | 'missing'
export type StockDataAvailability = 'ok' | 'partial' | 'missing' | 'unknown' | 'priceDataPending'

export type StockOpsSignal = {
  status: StockDetailStatus
  title: string
  detail: string
}

export type StockRiskNote = {
  label: string
  items: string[]
}

export type StockOutcomeReview = {
  horizon: '1d' | '1w' | '1m' | '3m' | string
  evaluatedAt: string | null
  dueAt: string | null
  resultLabel: string
  status: StockDetailStatus
  expectedDirection: string
  actualDirection: string
  dataAvailability: StockDataAvailability
  returnPct: number | null
  topixReturnPct: number | null
  relativeToTopixPct: number | null
  maxDrawdownPct: number | null
  missedSignals: string[]
  notes: string[]
  priceDataPending: boolean
}

export type StockHypothesisHistory = {
  detectedAt: string | null
  reviewDueAt: string | null
  horizon: string | null
  expectedDirection: string
  label: string | null
  reason: string | null
  confidence: number | null
  status: string | null
  invalidationSignals: string[]
  evidenceNeeded: string[]
  relatedWorldEventIds: string[]
}

export type StockReflection = {
  missedSignals: string[]
  notes: string[]
  improvedRuleIdeas: string[]
  memoryNotes: string[]
}

export type StockEventNote = {
  label: string
  value: string
}

export type StockDetail = {
  code: string
  name: string
  market: string | null
  generatedAt: string | null
  lastUpdatedAt: string | null
  sourceKinds: string[]
  score: number | null
  status: StockDetailStatus
  dataAvailability: StockDataAvailability
  dataAvailabilityReason: string
  candidate: Candidate | null
  universeCandidate: UniverseCandidate | null
  hypotheses: StockHypothesisHistory[]
  outcomes: StockOutcomeReview[]
  opsSignals: StockOpsSignal[]
  researchReasons: string[]
  eventNotes: StockEventNote[]
  riskNotes: StockRiskNote[]
  reflection: StockReflection
  nextChecks: string[]
  staleFallback: boolean
  sourceVerification: StockDetailStatus
  priceDataPending: boolean
}

type OpsDashboardLike = {
  generatedAt?: string | null
  healthStatus?: string | null
  priorityIssues?: Array<{ severity?: string; category?: string; title?: string; detail?: string }>
  allIssues?: Array<{ severity?: string; category?: string; title?: string; detail?: string }>
  staleFallbackAudit?: { universeScanStatus?: string | null; universeFallbackReason?: string | null }
  outcomeQualityAudit?: { healthStatus?: string | null; checkCounts?: Record<string, number> }
}

type OutcomeQualityAuditLike = {
  generatedAt?: string | null
  healthStatus?: string | null
  checks?: Record<string, { count?: number; items?: Array<{ code?: string; detail?: string }> }>
}

type SpecialSituationCandidate = {
  code?: string
  name?: string
  finalLabel?: string
  reasonSummary?: string
  watchPhase?: string
  whyInteresting?: string[]
  whyDangerous?: string[]
  whyNotNow?: string[]
  evidenceNeeded?: string[]
  waitFor?: string[]
  whyNow?: string[]
  outcomeStats?: {
    sampleSize?: number
    sampleTooSmall?: boolean
    hitRate?: number | null
    avgReturn1w?: number | null
    avgReturn1m?: number | null
    avgTopixRelative1m?: number | null
  }
}

const HORIZONS = ['1d', '1w', '1m', '3m'] as const

function rootPath(...parts: string[]): string {
  const cwd = process.cwd()
  const fromWeb = basename(cwd) === 'web' && basename(join(cwd, '..')) === 'apps'
  return fromWeb ? join(cwd, '..', '..', ...parts) : join(cwd, ...parts)
}

function readJsonFile<T>(paths: string[], fallback: T): T {
  for (const path of paths) {
    if (!existsSync(path)) continue
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

export function loadOpsDashboard(): OpsDashboardLike | null {
  return readJsonFile<OpsDashboardLike | null>(
    [
      rootPath('apps', 'web', 'public', 'generated', 'ops-dashboard.json'),
      rootPath('public', 'generated', 'ops-dashboard.json'),
      rootPath('reports', 'ops-dashboard.json'),
    ],
    null
  )
}

export function loadOutcomeQualityAudit(): OutcomeQualityAuditLike | null {
  return readJsonFile<OutcomeQualityAuditLike | null>(
    [rootPath('reports', 'outcome-quality-audit.json')],
    null
  )
}

function compactStrings(values: Array<string | null | undefined>, limit?: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
    if (limit && result.length >= limit) break
  }
  return result
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function statusFromSeverity(value: string | null | undefined): StockDetailStatus {
  if (value === 'urgent' || value === 'attention' || value === 'action_required' || value === 'needs_attention') return 'attention'
  if (value === 'info' || value === 'ok') return value
  return 'missing'
}

function normalizeAvailability(value: unknown): StockDataAvailability {
  if (value === 'ok' || value === 'partial' || value === 'missing') return value
  if (value === 'priceDataPending') return 'priceDataPending'
  return 'unknown'
}

function isUnevaluatedResult(result: unknown, availability: StockDataAvailability): boolean {
  if (availability !== 'ok') return true
  return result == null || result === 'unknown'
}

function resultLabel(outcome: HypothesisOutcome): { label: string; status: StockDetailStatus } {
  const availability = normalizeAvailability(outcome.dataAvailability)
  if (availability !== 'ok') return { label: '未評価: 価格データ不足', status: 'info' }
  if (outcome.result == null || outcome.result === 'unknown') return { label: '未評価', status: 'missing' }
  if (
    outcome.result === 'hit' &&
    outcome.actualDirection === 'unknown' &&
    outcome.hypothesis?.expectedDirection === 'unknown'
  ) {
    return { label: '未評価: 方向未確定', status: 'missing' }
  }
  if (outcome.result === 'too_early') return { label: '時期尚早', status: 'info' }
  if (outcome.result === 'invalidated') return { label: '反証済み', status: 'attention' }
  if (outcome.result === 'miss') return { label: '想定差分あり', status: 'attention' }
  if (outcome.result === 'hit') return { label: '仮説と整合', status: 'ok' }
  return { label: String(outcome.result), status: 'missing' }
}

function dueDate(detectedAt: string | null | undefined, horizon: string): string | null {
  if (!detectedAt) return null
  const date = new Date(`${detectedAt.slice(0, 10)}T00:00:00+09:00`)
  if (Number.isNaN(date.getTime())) return null
  const days = horizon === '1d' ? 1 : horizon === '1w' ? 7 : horizon === '1m' ? 30 : horizon === '3m' ? 90 : 0
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizeOutcome(outcome: HypothesisOutcome): StockOutcomeReview {
  const availability = normalizeAvailability(outcome.dataAvailability)
  const result = resultLabel(outcome)
  const horizon = outcome.reviewHorizon
  const priceDataPending = availability !== 'ok' && isUnevaluatedResult(outcome.result, availability)
  return {
    horizon,
    evaluatedAt: outcome.evaluatedAt ?? null,
    dueAt: dueDate(outcome.hypothesis?.detectedAt, horizon),
    resultLabel: result.label,
    status: result.status,
    expectedDirection: outcome.hypothesis?.expectedDirection ?? 'unknown',
    actualDirection: outcome.actualDirection ?? 'unknown',
    dataAvailability: priceDataPending ? 'priceDataPending' : availability,
    returnPct: horizon === '1d' ? numeric(outcome.return1d) : horizon === '1w' ? numeric(outcome.return1w) : horizon === '1m' ? numeric(outcome.return1m) : numeric(outcome.return3m),
    topixReturnPct: horizon === '1d' ? numeric(outcome.topixReturn1d) : horizon === '1m' ? numeric(outcome.topixReturn1m) : null,
    relativeToTopixPct: horizon === '1d' ? numeric(outcome.relativeToTopix1d) : horizon === '1w' ? numeric(outcome.relativeToTopix1w) : horizon === '1m' ? numeric(outcome.relativeToTopix1m) : numeric(outcome.relativeToTopix3m),
    maxDrawdownPct: numeric(outcome.maxDrawdownPct),
    missedSignals: compactStrings(outcome.missedSignals ?? []),
    notes: compactStrings([outcome.notes]),
    priceDataPending,
  }
}

function normalizeHypothesis(hypothesis: StockCandidateHypothesis): StockHypothesisHistory {
  return {
    detectedAt: hypothesis.detectedAt ?? null,
    reviewDueAt: hypothesis.reviewDueAt ?? null,
    horizon: hypothesis.expectedTimeframe ?? null,
    expectedDirection: hypothesis.expectedDirection ?? 'unknown',
    label: hypothesis.label ?? null,
    reason: hypothesis.reason ?? null,
    confidence: numeric(hypothesis.confidence),
    status: hypothesis.status ?? null,
    invalidationSignals: compactStrings(hypothesis.invalidationSignals ?? []),
    evidenceNeeded: compactStrings(hypothesis.evidenceNeeded ?? []),
    relatedWorldEventIds: compactStrings(hypothesis.relatedWorldEventIds ?? []),
  }
}

function findSpecialCandidate(data: unknown, code: string): SpecialSituationCandidate | null {
  const candidates = (data as { specialSituationWatch?: { candidates?: SpecialSituationCandidate[] } }).specialSituationWatch?.candidates
  return candidates?.find(candidate => candidate.code === code) ?? null
}

function buildOpsSignals(code: string, ops: OpsDashboardLike | null, audit: OutcomeQualityAuditLike | null): StockOpsSignal[] {
  const issues = [...(ops?.priorityIssues ?? []), ...(ops?.allIssues ?? [])]
  const matched = issues.filter(issue => `${issue.title ?? ''} ${issue.detail ?? ''}`.includes(code))
  const signals = matched.map(issue => ({
    status: statusFromSeverity(issue.severity),
    title: issue.title ?? '運用シグナル',
    detail: issue.detail ?? '詳細未記録',
  }))

  const auditIssues = Object.entries(audit?.checks ?? {})
    .filter(([, check]) => (check.items ?? []).some(item => item.code === code))
    .map(([key, check]) => ({
      status: 'attention' as const,
      title: `品質監査: ${key}`,
      detail: (check.items ?? []).filter(item => item.code === code).map(item => item.detail ?? code).join(' / ') || '確認対象',
    }))

  return [...signals, ...auditIssues]
}

function fallbackName(code: string, parts: {
  candidate?: Candidate
  universeCandidate?: UniverseCandidate
  hypothesis?: StockCandidateHypothesis
  outcome?: HypothesisOutcome
  special?: SpecialSituationCandidate | null
}): string {
  return parts.candidate?.name ?? parts.universeCandidate?.name ?? parts.hypothesis?.name ?? parts.outcome?.name ?? parts.special?.name ?? code
}

export function normalizeStockDetail(raw: {
  code: string
  data: ReturnType<typeof loadGeneratedData>
  ops?: OpsDashboardLike | null
  outcomeQuality?: OutcomeQualityAuditLike | null
}): StockDetail | null {
  const { code, data, ops = null, outcomeQuality = null } = raw
  const candidate = data.candidates.find(item => item.code === code) ?? null
  const universeCandidate = (data.universeCandidates ?? []).find(item => item.code === code) ?? null
  const hypotheses = (data.hypothesisPredictions ?? []).filter(item => item.code === code)
  const outcomes = (data.hypothesisOutcomes ?? []).filter(item => item.code === code)
  const special = findSpecialCandidate(data, code)
  const companyMemory = data.companyMemoryByCode?.[code]
  const dataQuality = data.dataQualityByCode?.[code]
  const primaryDisclosure = data.primaryDisclosureReviews?.[code]

  if (!candidate && !universeCandidate && hypotheses.length === 0 && outcomes.length === 0 && !special && !companyMemory) {
    return null
  }

  const normalizedHypotheses = hypotheses
    .map(normalizeHypothesis)
    .sort((a, b) => (b.detectedAt ?? '').localeCompare(a.detectedAt ?? ''))
  const normalizedOutcomes = outcomes
    .map(normalizeOutcome)
    .sort((a, b) => HORIZONS.indexOf(a.horizon as never) - HORIZONS.indexOf(b.horizon as never) || (b.evaluatedAt ?? '').localeCompare(a.evaluatedAt ?? ''))
  const priceDataPending = normalizedOutcomes.some(outcome => outcome.priceDataPending)
  const qualityLevel = dataQuality?.quality?.level
  const staleFallback = data.universeScan?.scanStatus === 'stale_fallback' || universeCandidate?.priceSignalQuality === 'stale'
  const sourceVerification = primaryDisclosure?.decision === 'confirmed' ? 'ok' : primaryDisclosure?.decision === 'missing' || !primaryDisclosure ? 'missing' : 'attention'
  const dataAvailability: StockDataAvailability = priceDataPending ? 'priceDataPending' : qualityLevel === 'full' ? 'ok' : qualityLevel === 'partial' ? 'partial' : qualityLevel === 'low' ? 'missing' : normalizedOutcomes.some(o => o.dataAvailability !== 'ok') ? normalizedOutcomes[0]?.dataAvailability ?? 'unknown' : 'unknown'

  const opsSignals = buildOpsSignals(code, ops, outcomeQuality)
  if (staleFallback) {
    opsSignals.push({
      status: 'attention',
      title: 'stale fallback',
      detail: ops?.staleFallbackAudit?.universeFallbackReason ?? '前回スキャン結果を暫定利用しています。',
    })
  }
  if (priceDataPending) {
    opsSignals.push({
      status: 'info',
      title: '価格データ提供待ち',
      detail: '価格データ不足のため、答え合わせは未評価として扱います。',
    })
  }

  const researchReasons = compactStrings([
    ...(candidate?.reasons ?? []),
    universeCandidate?.disclosureEvidence?.summary,
    special?.reasonSummary,
    ...(special?.whyNow ?? []),
    ...(companyMemory?.watchReason ?? []),
  ], 12)

  const riskNotes: StockRiskNote[] = [
    { label: '反証条件', items: compactStrings(normalizedHypotheses.flatMap(item => item.invalidationSignals), 8) },
    { label: '上がらない理由', items: compactStrings([...(candidate?.negativeReasons ?? []), ...(special?.whyNotNow ?? []), ...(special?.whyDangerous ?? [])], 10) },
    { label: '既知リスク', items: compactStrings([...(companyMemory?.knownRisks ?? []), ...(dataQuality?.warnings ?? [])], 10) },
  ]

  const reflection: StockReflection = {
    missedSignals: compactStrings(normalizedOutcomes.flatMap(item => item.missedSignals), 10),
    notes: compactStrings(normalizedOutcomes.flatMap(item => item.notes), 10),
    improvedRuleIdeas: compactStrings(outcomes.flatMap(item => item.improvedRuleIdeas ?? []), 10),
    memoryNotes: compactStrings([...(companyMemory?.notes ?? []), ...(companyMemory?.recurringWarnings ?? [])], 10),
  }

  const nextChecks = compactStrings([
    ...(candidate?.nextToSee ?? []),
    ...(normalizedHypotheses.flatMap(item => item.evidenceNeeded)),
    ...(special?.evidenceNeeded ?? []),
    ...(special?.waitFor ?? []),
    ...(primaryDisclosure?.evidenceNeeded ?? []),
    ...(priceDataPending ? ['価格データ提供後に再確認'] : []),
  ], 14)

  const score = candidate ? Object.values(candidate.score).reduce((sum, value) => sum + value, 0) : universeCandidate?.screeningScore ?? dataQuality?.scoreBreakdown?.totalScore ?? null
  const name = fallbackName(code, { candidate: candidate ?? undefined, universeCandidate: universeCandidate ?? undefined, hypothesis: hypotheses[0], outcome: outcomes[0], special })

  return {
    code,
    name,
    market: candidate?.market ?? (universeCandidate ? 'TSE' : null),
    generatedAt: data.generatedAt ?? null,
    lastUpdatedAt: candidate?.lastNotifiedAt ?? universeCandidate?.detectedAt ?? companyMemory?.lastReviewedAt ?? data.generatedAt ?? null,
    sourceKinds: compactStrings([
      candidate ? 'watchlist' : null,
      universeCandidate ? 'universe' : null,
      hypotheses.length > 0 ? 'hypothesis' : null,
      outcomes.length > 0 ? 'outcome' : null,
      special ? 'special situation' : null,
      companyMemory ? 'company memory' : null,
    ]),
    score,
    status: opsSignals.some(signal => signal.status === 'attention') ? 'attention' : priceDataPending ? 'info' : 'ok',
    dataAvailability,
    dataAvailabilityReason: dataAvailability === 'priceDataPending' ? '価格データ提供待ち' : qualityLevel ?? '未記録',
    candidate,
    universeCandidate,
    hypotheses: normalizedHypotheses,
    outcomes: normalizedOutcomes,
    opsSignals,
    researchReasons,
    eventNotes: compactStrings([
      special?.finalLabel ? `特殊状況: ${special.finalLabel}` : null,
      special?.watchPhase ? `確認フェーズ: ${special.watchPhase}` : null,
      universeCandidate?.detectedAt ? `検出日: ${universeCandidate.detectedAt}` : null,
      data.universeScan?.generatedAt ? `スキャン生成: ${data.universeScan.generatedAt}` : null,
      ops?.generatedAt ? `ops生成: ${ops.generatedAt}` : null,
      outcomeQuality?.generatedAt ? `品質監査: ${outcomeQuality.generatedAt}` : null,
    ]).map((value, index) => ({ label: `event-${index + 1}`, value })),
    riskNotes,
    reflection,
    nextChecks,
    staleFallback,
    sourceVerification,
    priceDataPending,
  }
}

export function getStockHypotheses(code: string): StockHypothesisHistory[] {
  return normalizeStockDetail({ code, data: loadGeneratedData() })?.hypotheses ?? []
}

export function getStockOutcomes(code: string): StockOutcomeReview[] {
  return normalizeStockDetail({ code, data: loadGeneratedData() })?.outcomes ?? []
}

export function getStockOpsSignals(code: string): StockOpsSignal[] {
  return normalizeStockDetail({ code, data: loadGeneratedData(), ops: loadOpsDashboard(), outcomeQuality: loadOutcomeQualityAudit() })?.opsSignals ?? []
}

export function getStockDetail(code: string): StockDetail | null {
  return normalizeStockDetail({
    code,
    data: loadGeneratedData(),
    ops: loadOpsDashboard(),
    outcomeQuality: loadOutcomeQualityAudit(),
  })
}
