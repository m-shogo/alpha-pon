import type { AlphaPonGeneratedData } from '@/lib/types'
import { normalizeProCommandSummaryInput, normalizeProGeneratedDate } from '@/lib/pro-command-summary-input'
import styles from './ProCommandCard.module.css'

type Props = {
  data: AlphaPonGeneratedData
}

export function ProCommandCard({ data }: Props) {
  const { reports, headline } = data
  const generatedAt = normalizeProGeneratedDate(data.generatedAt)
  const summary = normalizeProCommandSummaryInput(data.summary)

  const items = [
    { label: '司令塔', value: summary.strategic },
    { label: 'データ信頼度', value: summary.pipeline },
    { label: 'Pro会議', value: summary.committee },
  ].filter((item) => item.value)

  const roadmap = summary.roadmap.slice(0, 3)
  const refresh = summary.refresh.slice(0, 2)

  if (items.length === 0 && roadmap.length === 0 && refresh.length === 0) return null

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>運用サマリー</h2>
        <span className={styles.generated}>生成: {generatedAt || '未生成'}</span>
      </div>

      {headline && <div className={styles.headline}>{headline}</div>}

      {items.length > 0 && (
        <div className={styles.rows}>
          {items.map((item) => (
            <div key={item.label} className={styles.row}>
              <div className={styles.label}>{item.label}</div>
              <div className={styles.value}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {roadmap.length > 0 && (
        <div className={styles.subsection}>
          <div className={styles.subheading}>次に精度を上げる所</div>
          <ul className={styles.list}>
            {roadmap.map((item, index) => (
              <li key={`${index}-${item.slice(0, 24)}`} className={styles.listItem}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {refresh.length > 0 && (
        <div className={styles.refresh}>
          {refresh.map((item, index) => (
            <span key={`${index}-${item.slice(0, 24)}`}>{item.replace(/^\|\s*/, '').slice(0, 40)}</span>
          ))}
        </div>
      )}

      {reports.length > 0 && (
        <div className={styles.reportList}>
          {reports.map((report) => (
            <div key={report.key} className={styles.report}>
              <span
                className={styles.dot}
                style={{ background: report.available ? 'var(--mint-deep)' : 'var(--ink-3)' }}
              />
              {report.label}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
