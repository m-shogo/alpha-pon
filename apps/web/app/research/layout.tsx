import type { ReactNode } from 'react'
import styles from './ResearchAvailability.module.css'
import HistoricalAnalogVerification from '@/components/HistoricalAnalogVerification'
import ResearchHistoryMap from '@/components/ResearchHistoryMap'
import ResearchStudyMap from '@/components/ResearchStudyMap'
import { loadOwnerResearchHistoryMap } from '@/lib/research-history-map'
import { isOwnerResearchHistoryMapTemporalSafe } from '@/lib/research-history-map-temporal'
import { isOwnerResearchSummaryGateSafe } from '@/lib/research-summary-gates'
import { isOwnerResearchSummaryHypothesisSafe } from '@/lib/research-summary-hypothesis'
import { isOwnerResearchSummaryIntegritySafe } from '@/lib/research-summary-integrity'
import { isOwnerResearchSummaryReferenceSafe } from '@/lib/research-summary-references'
import { isOwnerResearchSummarySampleSafe } from '@/lib/research-summary-samples'
import { isOwnerResearchTimestampSafe, loadOwnerResearchSummary } from '@/lib/research-summary'
import { isOwnerResearchSummaryTemporalSafe } from '@/lib/research-summary-temporal'
import { isOwnerResearchSummaryWindowSafe } from '@/lib/research-summary-window'

function formatSnapshotTime(value: string | null): string {
  if (!value) return '未記録'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '利用不能'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

export default function ResearchLayout({ children }: Readonly<{ children: ReactNode }>) {
  const summary = loadOwnerResearchSummary()
  const historyMap = loadOwnerResearchHistoryMap()
  const summaryUnavailable = summary.warning !== null
    || !isOwnerResearchSummaryTemporalSafe(summary)
    || !isOwnerResearchSummaryReferenceSafe(summary)
    || !isOwnerResearchSummaryGateSafe(summary)
    || !isOwnerResearchSummaryHypothesisSafe(summary)
    || !isOwnerResearchSummaryIntegritySafe(summary)
    || !isOwnerResearchSummarySampleSafe(summary)
    || !isOwnerResearchSummaryWindowSafe(summary)
  const historyMapTimestampSafe = historyMap.generatedAt !== null && isOwnerResearchTimestampSafe(historyMap.generatedAt)
  const historyMapUnavailable = historyMap.warning !== null
    || !historyMapTimestampSafe
    || !isOwnerResearchHistoryMapTemporalSafe(historyMap)

  return (
    <>
      {summaryUnavailable ? (
        <main className={styles.unavailablePage}>
          <div className={styles.unavailableEyebrow}>研究状況</div>
          <h1>研究</h1>
          <section className={styles.warningPanel}>
            <div className={styles.warningTitle}>研究サマリーを安全に表示できません</div>
            <div className={styles.warningReason}>
              {summary.warning ?? '研究サマリーの時刻・期間または参照整合性が不正なため、安全のため表示を停止しました。'}
            </div>
            <div className={styles.warningSafety}>
              この状態ではEdge数・サンプル数・研究テーマ数などの0表示を実データとして扱いません。下の過去事例・検証データは別の生成データから読み込むため、独立して判定します。
            </div>
          </section>
        </main>
      ) : (
        <>
          {children}
          <div className={styles.snapshotMeta}>表示データ生成: {formatSnapshotTime(summary.generatedAt)}</div>
        </>
      )}
      <div id="knowledge-map" className={styles.knowledgeRoot}>
        {historyMapUnavailable ? (
          <section className={`${styles.warningPanel} ${styles.knowledgeWarning}`}>
            <div className={styles.warningTitle}>過去事例・検証データを安全に表示できません</div>
            <div className={styles.warningReason}>
              {historyMap.warning ?? '過去事例・検証データの時刻整合性が不正なため、安全のため表示を停止しました。'}
            </div>
            <div className={styles.warningSafety}>
              研究のつながり・過去類似事例・個別事例・検証設計などの0件表示は実データとして扱いません。
            </div>
          </section>
        ) : (
          <>
            <div className={styles.knowledgeTimestamp}>過去事例・検証データ生成: {formatSnapshotTime(historyMap.generatedAt)}</div>
            <ResearchHistoryMap />
            <HistoricalAnalogVerification />
            <ResearchStudyMap />
          </>
        )}
      </div>
    </>
  )
}
