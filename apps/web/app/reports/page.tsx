import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { isPipelineStatusHealthy } from '@/lib/pipeline-status-view'
import { ReportViewer } from '@/components/ReportViewer'
import styles from './ReportsPage.module.css'

function cursorRange(cursor: { offset?: number; maxPerRun?: number; total?: number }) {
  const offset = cursor.offset ?? 0
  const max = cursor.maxPerRun ?? 0
  const total = cursor.total ?? 0
  if (total <= 0) return '範囲未確定'
  return `${offset + 1}-${Math.min(total, offset + Math.max(1, max))} / ${total}`
}

export default function ReportsPage() {
  const data = loadGeneratedData()
  const runCursors = Object.entries(data.runCursors ?? {})
  const pipelineHealthy = data.pipelineStatus ? isPipelineStatusHealthy(data.pipelineStatus) : false
  const availableReports = data.reports.filter(report => report.available).length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>調査結果と運用レポート</div>
        <h1 className={styles.title}>レポート</h1>
        <p className={styles.subtitle}>
          生成済みレポートを読み、必要なときだけ生成状況やパイプラインの詳細を確認します。
        </p>
      </header>

      <section className={styles.summary}>
        <div>
          <div className={styles.summaryLabel}>読めるレポート</div>
          <div className={styles.summaryValue}>{availableReports} / {data.reports.length} 件</div>
          <div className={styles.summaryMeta}>利用できないレポートは一覧で「未生成」と表示します。</div>
        </div>
        {data.readiness && (
          <Link href="/roadmap" className={styles.roadmap}>
            <div className={styles.summaryLabel}>完成ロードマップ</div>
            <div className={styles.summaryValue}>総合完成度 {Math.round(data.readiness.overallScore)}%</div>
            <div className={styles.summaryMeta}>改善状況を見る →</div>
          </Link>
        )}
      </section>

      {runCursors.length > 0 && (
        <section className={styles.summary}>
          <div>
            <div className={styles.summaryLabel}>次回のデータ取得範囲</div>
            <div className={styles.summaryMeta}>大量取得を一度に行わず、続きを安全に進めるための位置です。</div>
          </div>
          <div className={styles.cursorList}>
            {runCursors.map(([key, cursor]) => (
              <div key={key} className={styles.cursorRow}>
                <span className={styles.cursorName}>{cursor.jobName ?? key}</span>
                <span className={styles.cursorRange}>次 {cursorRange(cursor)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(data.meta?.warnings ?? []).length > 0 && (
        <div className={styles.warning}>
          <div className={styles.warningTitle}>⚠ データ更新に確認事項があります</div>
          {(data.meta?.warnings ?? []).map((warning: string, index: number) => (
            <div key={index}>• {warning}</div>
          ))}
        </div>
      )}

      {data.reports.length === 0 ? (
        <div className={styles.empty}>まだ表示できるレポートがありません。</div>
      ) : (
        <ReportViewer reports={data.reports} />
      )}

      {data.pipelineStatus && (
        <details className={styles.pipeline}>
          <summary>
            <span>生成パイプラインの技術状態</span>
            <span className={styles.pipelineState}>{pipelineHealthy ? '正常' : '要確認'}</span>
          </summary>
          <div className={styles.pipelineBody}>
            <div className={styles.pipelineGrid}>
              {data.pipelineStatus.date && <><span className={styles.pipelineKey}>日付</span><span>{data.pipelineStatus.date}</span></>}
              {data.pipelineStatus.status && <><span className={styles.pipelineKey}>状態</span><span>{data.pipelineStatus.status}</span></>}
              {data.pipelineStatus.startedAt && <><span className={styles.pipelineKey}>開始</span><span>{data.pipelineStatus.startedAt}</span></>}
              {data.pipelineStatus.endedAt && <><span className={styles.pipelineKey}>終了</span><span>{data.pipelineStatus.endedAt}</span></>}
            </div>

            {(data.pipelineStatus.completeWrapperFailedSteps ?? []).length > 0 && (
              <div className={styles.warning}>
                <div className={styles.warningTitle}>失敗したステップ</div>
                {(data.pipelineStatus.completeWrapperFailedSteps ?? []).map((step: string, index: number) => (
                  <div key={index}>• {step}</div>
                ))}
              </div>
            )}

            {(data.pipelineStatus.steps ?? []).length > 0 && (
              <div className={styles.stepList}>
                {(data.pipelineStatus.steps ?? []).map((step, index) => (
                  <div key={index} className={styles.stepRow}>
                    <span
                      className={styles.stepDot}
                      style={{ background: step.status === 'ok' ? 'var(--mint-deep)' : step.status === 'skipped' ? 'var(--ink-3)' : 'var(--amber)' }}
                    />
                    <span className={styles.stepName}>{step.name}</span>
                    <span>{step.status === 'ok' ? '正常' : step.status === 'skipped' ? '省略' : '要確認'}</span>
                    <span>{step.durationSec > 0 ? `${step.durationSec}s` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      <div className={styles.footerSpace} />
    </main>
  )
}
