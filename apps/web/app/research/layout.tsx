import type { ReactNode } from 'react'
import HistoricalAnalogVerification from '@/components/HistoricalAnalogVerification'
import ResearchHistoryMap from '@/components/ResearchHistoryMap'
import ResearchStudyMap from '@/components/ResearchStudyMap'
import { loadOwnerResearchHistoryMap } from '@/lib/research-history-map'
import { isOwnerResearchHistoryMapTemporalSafe } from '@/lib/research-history-map-temporal'
import { isOwnerResearchTimestampSafe, loadOwnerResearchSummary } from '@/lib/research-summary'
import { isOwnerResearchSummaryTemporalSafe } from '@/lib/research-summary-temporal'

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
  const summaryUnavailable = summary.warning !== null || !isOwnerResearchSummaryTemporalSafe(summary)
  const historyMapTimestampSafe = historyMap.generatedAt !== null && isOwnerResearchTimestampSafe(historyMap.generatedAt)
  const historyMapUnavailable = historyMap.warning !== null
    || !historyMapTimestampSafe
    || !isOwnerResearchHistoryMapTemporalSafe(historyMap)

  return (
    <>
      {summaryUnavailable ? (
        <main style={{ padding: '48px 14px 28px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.4, marginBottom: 3 }}>RESEARCH / OWNER VIEW</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 27, color: 'var(--ink)' }}>研究ダッシュボード</h1>
          <section style={{ marginTop: 14, padding: '14px 15px', borderRadius: 14, background: 'var(--amber-soft)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 13, fontWeight: 850, color: 'var(--ink)' }}>⚠ Research Summaryを利用できません</div>
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 650 }}>
              {summary.warning ?? 'Research Summaryの時刻整合性が不正なため、安全のため表示を停止しました。'}
            </div>
            <div style={{ marginTop: 7, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-3)' }}>
              この状態ではEdge数・Sample数・研究テーマ数などの0表示を実データとして扱いません。下のKnowledge Mapは別generated sourceから読み込むため、独立して判定します。
            </div>
          </section>
        </main>
      ) : (
        <>
          {children}
          <div style={{ padding: '0 14px 12px', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>
            表示データ生成: {formatSnapshotTime(summary.generatedAt)}
          </div>
        </>
      )}
      <div id="knowledge-map" style={{ scrollMarginTop: 118 }}>
        {historyMapUnavailable ? (
          <section style={{ margin: '0 14px 28px', padding: '14px 15px', borderRadius: 14, background: 'var(--amber-soft)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 13, fontWeight: 850, color: 'var(--ink)' }}>⚠ Knowledge Mapを利用できません</div>
            <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 650 }}>
              {historyMap.warning ?? 'Knowledge Mapの時刻整合性が不正なため、安全のため表示を停止しました。'}
            </div>
            <div style={{ marginTop: 7, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-3)' }}>
              Family・Historical Analog・Case・Studyなどの0件表示は実データとして扱いません。
            </div>
          </section>
        ) : (
          <>
            <div style={{ padding: '0 14px 4px', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>
              Knowledge Map生成: {formatSnapshotTime(historyMap.generatedAt)}
            </div>
            <ResearchHistoryMap />
            <HistoricalAnalogVerification />
            <ResearchStudyMap />
          </>
        )}
      </div>
    </>
  )
}
