// /ops ページ用のデータ読み込み。
// pnpm report:ops が生成する public/generated/ops-dashboard.json を読む。
// 未生成・破損でも null を返し、ページ側でフォールバック表示する。

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export type OpsSeverity = 'urgent' | 'attention' | 'info'
export type OpsHealthStatus = 'ok' | 'needs_attention' | 'action_required'

export interface OpsIssue {
  severity: OpsSeverity
  category: string
  title: string
  detail: string
  command?: string
  rank?: number
}

export interface OpsDashboardData {
  schemaVersion: number
  generatedAt: string
  healthStatus: OpsHealthStatus
  priorityIssues: OpsIssue[]
  allIssues: OpsIssue[]
  outcomeAudit: {
    available: boolean
    total: number
    resultCounts: Record<string, number>
    unevaluated: number
    judgedWithLimitedData: Array<{ code: string; horizon: string; dataAvailability: string }>
    reviewDue: {
      overdue: number
      historicalSeedOverdue: number
      priceDataPending: number
      dueToday: number
      dueThisWeek: number
    } | null
    integrity: {
      status: string
      jsonlDuplicateGroups: number
      sqliteDuplicateGroups: number
      parseErrors: number
    } | null
  }
  staleFallbackAudit: {
    universeScanStatus: string | null
    universeFallbackReason: string | null
    duplicatedWarningCodes: Array<{ code: string; duplicatedWarnings: string[] }>
  }
  dataAvailabilityAudit: {
    outcomeCounts: Record<string, number>
    qualityLevelCounts: Record<string, number>
    nonOkCodes: string[]
  }
  safeWordingAudit: {
    scannedFiles: number
    violations: Array<{ file: string; line: number; maskedPattern: string }>
  }
  pipelineAudit: {
    available: boolean
    date: string | null
    status: string | null
    isToday: boolean
    failedSteps: string[]
  }
  uiDataAudit: {
    available: boolean
    generatedAt: string | null
    isToday: boolean
    metaWarnings: string[]
  }
  specialSituationAudit: {
    available: boolean
    healthStatus: string | null
    urgentTitles: string[]
    attentionTitles: string[]
  }
  outcomeQualityAudit: {
    available: boolean
    healthStatus: string | null
    checkCounts: Record<string, number>
  }
  worldImpactAudit: {
    available: boolean
    healthStatus: string | null
    totalReviews: number
    pendingReviews: number
    overdueReviews: number
    missingCounterArguments: number
    missingMechanisms: number
    dataUnavailable: number
    priceDataPending: number
    sourceQualityUnknown: number
    unknownMatchedAsHit: number
    insufficientData: number
    confidenceMissing: number
    mechanismUnknown: number
    falsificationMissing: number
    jsonlParseErrors: number
    latestMismatch: number
    duplicateKeys: number
    priorityIssues: Array<{ severity?: string; title?: string; detail?: string }>
  }
  nextSafeCommands: Array<{ command: string; reason: string }>
  notes: string[]
}

const DATA_PATH = join(process.cwd(), 'public', 'generated', 'ops-dashboard.json')

const HEALTH_STATUSES: OpsHealthStatus[] = ['ok', 'needs_attention', 'action_required']

export function loadOpsDashboard(): OpsDashboardData | null {
  if (!existsSync(DATA_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as Partial<OpsDashboardData>
    if (!raw || typeof raw !== 'object') return null
    const healthStatus = HEALTH_STATUSES.includes(raw.healthStatus as OpsHealthStatus)
      ? (raw.healthStatus as OpsHealthStatus)
      : 'needs_attention'
    return {
      schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0,
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : '不明',
      healthStatus,
      priorityIssues: Array.isArray(raw.priorityIssues) ? raw.priorityIssues : [],
      allIssues: Array.isArray(raw.allIssues) ? raw.allIssues : [],
      outcomeAudit: {
        available: raw.outcomeAudit?.available ?? false,
        total: raw.outcomeAudit?.total ?? 0,
        resultCounts: raw.outcomeAudit?.resultCounts ?? {},
        unevaluated: raw.outcomeAudit?.unevaluated ?? 0,
        judgedWithLimitedData: Array.isArray(raw.outcomeAudit?.judgedWithLimitedData)
          ? raw.outcomeAudit.judgedWithLimitedData
          : [],
        reviewDue: raw.outcomeAudit?.reviewDue ?? null,
        integrity: raw.outcomeAudit?.integrity ?? null,
      },
      staleFallbackAudit: {
        universeScanStatus: raw.staleFallbackAudit?.universeScanStatus ?? null,
        universeFallbackReason: raw.staleFallbackAudit?.universeFallbackReason ?? null,
        duplicatedWarningCodes: Array.isArray(raw.staleFallbackAudit?.duplicatedWarningCodes)
          ? raw.staleFallbackAudit.duplicatedWarningCodes
          : [],
      },
      dataAvailabilityAudit: {
        outcomeCounts: raw.dataAvailabilityAudit?.outcomeCounts ?? {},
        qualityLevelCounts: raw.dataAvailabilityAudit?.qualityLevelCounts ?? {},
        nonOkCodes: Array.isArray(raw.dataAvailabilityAudit?.nonOkCodes)
          ? raw.dataAvailabilityAudit.nonOkCodes
          : [],
      },
      safeWordingAudit: {
        scannedFiles: raw.safeWordingAudit?.scannedFiles ?? 0,
        violations: Array.isArray(raw.safeWordingAudit?.violations) ? raw.safeWordingAudit.violations : [],
      },
      pipelineAudit: {
        available: raw.pipelineAudit?.available ?? false,
        date: raw.pipelineAudit?.date ?? null,
        status: raw.pipelineAudit?.status ?? null,
        isToday: raw.pipelineAudit?.isToday ?? false,
        failedSteps: Array.isArray(raw.pipelineAudit?.failedSteps) ? raw.pipelineAudit.failedSteps : [],
      },
      uiDataAudit: {
        available: raw.uiDataAudit?.available ?? false,
        generatedAt: raw.uiDataAudit?.generatedAt ?? null,
        isToday: raw.uiDataAudit?.isToday ?? false,
        metaWarnings: Array.isArray(raw.uiDataAudit?.metaWarnings) ? raw.uiDataAudit.metaWarnings : [],
      },
      specialSituationAudit: {
        available: raw.specialSituationAudit?.available ?? false,
        healthStatus: raw.specialSituationAudit?.healthStatus ?? null,
        urgentTitles: Array.isArray(raw.specialSituationAudit?.urgentTitles)
          ? raw.specialSituationAudit.urgentTitles
          : [],
        attentionTitles: Array.isArray(raw.specialSituationAudit?.attentionTitles)
          ? raw.specialSituationAudit.attentionTitles
          : [],
      },
      outcomeQualityAudit: {
        available: raw.outcomeQualityAudit?.available ?? false,
        healthStatus: raw.outcomeQualityAudit?.healthStatus ?? null,
        checkCounts: raw.outcomeQualityAudit?.checkCounts ?? {},
      },
      worldImpactAudit: {
        available: raw.worldImpactAudit?.available ?? false,
        healthStatus: raw.worldImpactAudit?.healthStatus ?? null,
        totalReviews: raw.worldImpactAudit?.totalReviews ?? 0,
        pendingReviews: raw.worldImpactAudit?.pendingReviews ?? 0,
        overdueReviews: raw.worldImpactAudit?.overdueReviews ?? 0,
        missingCounterArguments: raw.worldImpactAudit?.missingCounterArguments ?? 0,
        missingMechanisms: raw.worldImpactAudit?.missingMechanisms ?? 0,
        dataUnavailable: raw.worldImpactAudit?.dataUnavailable ?? 0,
        priceDataPending: raw.worldImpactAudit?.priceDataPending ?? 0,
        sourceQualityUnknown: raw.worldImpactAudit?.sourceQualityUnknown ?? 0,
        unknownMatchedAsHit: raw.worldImpactAudit?.unknownMatchedAsHit ?? 0,
        insufficientData: raw.worldImpactAudit?.insufficientData ?? 0,
        confidenceMissing: raw.worldImpactAudit?.confidenceMissing ?? 0,
        mechanismUnknown: raw.worldImpactAudit?.mechanismUnknown ?? 0,
        falsificationMissing: raw.worldImpactAudit?.falsificationMissing ?? 0,
        jsonlParseErrors: raw.worldImpactAudit?.jsonlParseErrors ?? 0,
        latestMismatch: raw.worldImpactAudit?.latestMismatch ?? 0,
        duplicateKeys: raw.worldImpactAudit?.duplicateKeys ?? 0,
        priorityIssues: Array.isArray(raw.worldImpactAudit?.priorityIssues)
          ? raw.worldImpactAudit.priorityIssues
          : [],
      },
      nextSafeCommands: Array.isArray(raw.nextSafeCommands) ? raw.nextSafeCommands : [],
      notes: Array.isArray(raw.notes) ? raw.notes : [],
    }
  } catch {
    return null
  }
}
