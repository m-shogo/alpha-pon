import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { Disclaimer } from '@/components/Disclaimer'
import type { StockCandidateHypothesis } from '@/types/universe'
import { formatDueLabel, todayJstDate } from '@/lib/format'
import styles from './HypothesesV2.module.css'

export const metadata = { title: '仮説一覧 | alpha-pon' }

const LABEL_COLOR: Record<string, string> = {
  '監視候補': 'var(--sky-deep)',
  '検証候補': 'var(--lavender-deep)',
  '反証待ち': 'var(--amber)',
}

function directionLabel(value: string) {
  if (['positive', 'up', 'bullish'].includes(value)) return '上昇方向'
  if (['negative', 'down', 'bearish'].includes(value)) return '下落方向'
  if (['mixed'].includes(value)) return '方向混在'
  if (['unknown', 'unclear'].includes(value)) return '方向未確定'
  return value
}

function HypothesisRow({ hypothesis }: { hypothesis: StockCandidateHypothesis }) {
  const due = formatDueLabel(hypothesis.reviewDueAt, todayJstDate())
  const color = LABEL_COLOR[hypothesis.label] ?? 'var(--ink-3)'
  return (
    <Link href={`/stocks/${hypothesis.code}`} className={styles.row}>
      <div className={styles.identity}>
        <div className={styles.label} style={{ color }}>{hypothesis.label}</div>
        <div className={styles.name}>{hypothesis.name}<span className={styles.code}>{hypothesis.code}</span></div>
        <div className={styles.reason}>{hypothesis.reason}</div>
        <div className={styles.status}>{hypothesis.status === 'open' ? '検証中' : '検証済み'}</div>
      </div>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>想定期間</div>
          <div className={styles.metricValue}>{hypothesis.expectedTimeframe}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>想定方向</div>
          <div className={styles.metricValue}>{directionLabel(hypothesis.expectedDirection)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>確信度</div>
          <div className={styles.metricValue}>{Math.round(hypothesis.confidence * 100)}%</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>次の答え合わせ</div>
          <div className={`${styles.metricValue} ${due.overdue ? styles.overdue : ''}`}>{due.label} ・ {hypothesis.reviewDueAt}</div>
        </div>
      </div>
    </Link>
  )
}

export default function HypothesesPage() {
  const data = loadGeneratedData()
  const all = data.hypothesisPredictions ?? []
  const open = all.filter(hypothesis => hypothesis.status === 'open')
  const closed = all.filter(hypothesis => hypothesis.status === 'closed')
  const today = todayJstDate()
  const overdue = open.filter(hypothesis => formatDueLabel(hypothesis.reviewDueAt, today).overdue).length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>候補を「なぜ？」まで残す</div>
        <h1 className={styles.title}>仮説一覧</h1>
        <p className={styles.subtitle}>
          監視候補について、何が起きると考えたか・いつ答え合わせするか・どれくらい確信しているかを追跡します。仮説はBUY推奨ではありません。
        </p>
      </header>

      <section className={styles.summary} aria-label="仮説サマリー">
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>検証中</div>
          <div className={styles.summaryValue}>{open.length}件</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>期限超過</div>
          <div className={styles.summaryValue} style={{ color: overdue > 0 ? 'var(--urgent)' : 'var(--mint-deep)' }}>{overdue}件</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>検証済み</div>
          <div className={styles.summaryValue}>{closed.length}件</div>
        </div>
      </section>

      {all.length === 0 ? (
        <div className={styles.empty}>現在、記録されている仮説はありません。0件でも異常ではありません。</div>
      ) : (
        <>
          {open.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><span>検証中</span><span className={styles.sectionCount}>{open.length}件</span></h2>
              <p className={styles.sectionIntro}>確信度の高い順です。期限と反証条件は各銘柄詳細で確認できます。</p>
              <div className={styles.list}>
                {[...open].sort((a, b) => b.confidence - a.confidence).map(hypothesis => (
                  <HypothesisRow key={`${hypothesis.code}:${hypothesis.detectedAt}`} hypothesis={hypothesis} />
                ))}
              </div>
            </section>
          )}

          {closed.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}><span>検証済み</span><span className={styles.sectionCount}>{closed.length}件</span></h2>
              <p className={styles.sectionIntro}>新しいものから並べています。結果の詳細は答え合わせ画面と銘柄詳細で確認できます。</p>
              <div className={styles.list}>
                {[...closed].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).map(hypothesis => (
                  <HypothesisRow key={`${hypothesis.code}:${hypothesis.detectedAt}`} hypothesis={hypothesis} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className={styles.footer}><Disclaimer compact /></div>
    </main>
  )
}
