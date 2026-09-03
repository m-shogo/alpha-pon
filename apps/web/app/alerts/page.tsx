import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { normalizeGeneratedAlertCandidates, type GeneratedAlertCandidateInput } from '@/lib/generated-alert-candidate-input'
import { Disclaimer } from '@/components/Disclaimer'
import styles from './AlertsV2.module.css'

export const metadata = { title: '監視候補 | alpha-pon' }

function drawdownText(pct: number | null) {
  if (pct == null) return '未取得'
  return `-${Math.abs(pct).toFixed(1)}%`
}

function drawdownColor(pct: number | null) {
  if (pct == null) return 'var(--ink-3)'
  return Math.abs(pct) >= 25 ? 'var(--amber)' : 'var(--sky-deep)'
}

function CandidateRow({ candidate }: { candidate: GeneratedAlertCandidateInput }) {
  const isMock = candidate.dataSource === 'mock'
  return (
    <Link href={`/stocks/${candidate.code}`} className={styles.row}>
      <div className={styles.identity}>
        <div className={styles.code}>
          {candidate.code}
          {isMock && <span className={styles.mock}>サンプル（MOCK）</span>}
        </div>
        <div className={styles.name}>{candidate.name}</div>
        <div className={styles.tags}>
          {candidate.matchedWorldEventTags.length > 0
            ? `関連テーマ: ${candidate.matchedWorldEventTags.slice(0, 3).join(' / ')}`
            : '関連テーマは未記録'}
        </div>
      </div>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>直近高値から</div>
          <div className={styles.metricValue} style={{ color: drawdownColor(candidate.drawdownPct) }}>{drawdownText(candidate.drawdownPct)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>スクリーニング点</div>
          <div className={styles.metricValue}>{candidate.screeningScore}</div>
        </div>
      </div>
      {candidate.warnings.length > 0 && <div className={styles.warning}>⚠ {candidate.warnings[0]}</div>}
    </Link>
  )
}

export default function AlertsPage() {
  const data = loadGeneratedData()
  const candidateLoad = normalizeGeneratedAlertCandidates(data.universeCandidates)
  const candidates = candidateLoad.rows
  const isMock = candidates.length > 0 && candidates.every(candidate => candidate.dataSource === 'mock')
  const scanDate = data.generatedAt ?? null
  const openHypotheses = (data.hypothesisPredictions ?? []).filter(hypothesis => hypothesis.status === 'open').length
  const outcomes = (data.hypothesisOutcomes ?? []).length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>自動スクリーニング</div>
        <h1 className={styles.title}>監視候補</h1>
        <p className={styles.subtitle}>
          まだ登録銘柄ではない会社から、追加調査する価値がありそうな候補を理由付きで確認します。候補表示はBUY推奨ではありません。
        </p>
        <div className={styles.meta}>
          {scanDate && <span>最終スキャン {scanDate}</span>}
          <span>{candidates.length}候補</span>
          {candidates.length > 0 && <span>{isMock ? 'サンプルデータ（MOCK）' : '本番データ'}</span>}
        </div>
      </header>

      {candidateLoad.warning && <div className={styles.errorNotice}>データ警告: {candidateLoad.warning}</div>}
      {isMock && (
        <div className={styles.notice}>
          現在はサンプルデータ（MOCK）です。実際の投資調査候補として扱わず、画面と判定フローの確認用として表示しています。
        </div>
      )}

      <section className={styles.summary} aria-label="監視候補サマリー">
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>監視候補</div>
          <div className={styles.summaryValue}>{candidates.length}件</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>検証中の仮説</div>
          <div className={styles.summaryValue}>{openHypotheses}件</div>
        </div>
        <div className={styles.summaryItem}>
          <div className={styles.summaryLabel}>答え合わせ記録</div>
          <div className={styles.summaryValue}>{outcomes}件</div>
        </div>
      </section>

      <nav className={styles.links} aria-label="候補の検証導線">
        <Link href="/hypotheses" className={styles.link}>
          <div className={styles.linkLabel}>仮説一覧を見る →</div>
          <div className={styles.linkMeta}>なぜ上がる・下がると考えたか、反証条件と期限を確認</div>
        </Link>
        <Link href="/outcomes" className={styles.link}>
          <div className={styles.linkLabel}>答え合わせを見る →</div>
          <div className={styles.linkMeta}>過去の仮説が実際にどうなったかを確認</div>
        </Link>
      </nav>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>今日のスクリーニング結果</h2>
        <p className={styles.sectionIntro}>スクリーニング点が高い順です。点数は買い推奨度ではなく、次に調査する順番を整理するための値です。</p>
        {candidates.length === 0 ? (
          <div className={styles.empty}>現在、条件に合う監視候補はありません。0件でも異常ではありません。</div>
        ) : (
          <div className={styles.list}>
            {[...candidates]
              .sort((a, b) => b.screeningScore - a.screeningScore)
              .map(candidate => <CandidateRow key={candidate.code} candidate={candidate} />)}
          </div>
        )}
      </section>

      <div className={styles.footer}><Disclaimer compact /></div>
    </main>
  )
}
