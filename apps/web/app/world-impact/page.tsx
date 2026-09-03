import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { Disclaimer } from '@/components/Disclaimer'
import type { WorldImpactReview } from '@/lib/types'
import styles from './world-impact.module.css'

export const metadata = { title: '世界ニュースの影響検証 | alpha-pon' }

const MECHANISM_LABELS: Record<string, string> = {
  demand: '需要', supply: '供給', cost: 'コスト', fx: '為替', rates: '金利',
  regulation: '規制・政策', energy: 'エネルギー', defense: '防衛', semiconductor: '半導体・AI',
  consumer: '消費', travel: '旅行・インバウンド', logistics: '物流・海運',
  ip_brand: 'IP・ブランド', geopolitical: '地政学', climate_disaster: '災害・気候', unknown: '分類未確定',
}

const MISS_REASON_LABELS: Record<string, string> = {
  already_priced_in: '織り込み済み',
  weak_linkage: '関連が弱かった',
  macro_overpowered: '地合いに負けた',
  wrong_lag: '時間軸が違った',
  wrong_direction: '方向が逆だった',
  company_specific_offset: '個別要因に打ち消された',
  data_insufficient: 'データ不足',
  unclear: '不明',
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: '未検証',
  reviewed: '検証済み',
  skipped: 'スキップ',
  insufficient_data: 'データ不足',
}

const REVIEW_STATUS_COLORS: Record<string, string> = {
  pending: 'var(--amber)',
  reviewed: 'var(--mint-deep)',
  skipped: 'var(--ink-3)',
  insufficient_data: 'var(--amber)',
}

const OUTCOME_LABELS: Record<string, string> = {
  hit: '仮説と整合',
  miss: '想定差分あり',
  inverse: '想定と逆行',
  too_early: '時期尚早',
  unclear: '判定不能',
  insufficient_data: 'データ不足',
  unknown: '未評価',
  unevaluated: '未評価',
}

const OUTCOME_COLORS: Record<string, string> = {
  hit: 'var(--mint-deep)',
  miss: 'var(--amber)',
  inverse: 'var(--urgent)',
  too_early: 'var(--amber)',
  unclear: 'var(--ink-3)',
  insufficient_data: 'var(--amber)',
  unknown: 'var(--ink-3)',
  unevaluated: 'var(--ink-3)',
}

const DIRECTION_LABELS: Record<string, string> = {
  positive: 'プラス方向',
  negative: 'マイナス方向',
  mixed: '方向混在',
  unclear: '方向未確定',
}

const SOURCE_QUALITY_LABELS: Record<string, string> = {
  official: '公式',
  tier1: '主要報道',
  tier2: '補助情報',
  unknown: '情報源品質未確定',
}

function countBy<T>(items: T[], key: (item: T) => string[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const value of key(item)) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

type OutcomeWithReview = { review: WorldImpactReview; outcome: WorldImpactReview['outcomes'][number] }

function confidenceBandLabel(confidence: number | null | undefined): string {
  if (confidence == null) return '未設定'
  if (confidence < 0.34) return '低（0.34未満）'
  if (confidence < 0.67) return '中（0.34〜0.66）'
  return '高（0.67以上）'
}

function performanceBy(items: OutcomeWithReview[], key: (item: OutcomeWithReview) => string[]) {
  const groups = new Map<string, { evaluated: number; hit: number; miss: number; inverse: number }>()
  for (const item of items) {
    const result = item.outcome.result
    if (result !== 'hit' && result !== 'miss' && result !== 'inverse') continue
    for (const groupKey of key(item)) {
      const group = groups.get(groupKey) ?? { evaluated: 0, hit: 0, miss: 0, inverse: 0 }
      group.evaluated++
      if (result === 'hit') group.hit++
      if (result === 'miss') group.miss++
      if (result === 'inverse') group.inverse++
      groups.set(groupKey, group)
    }
  }
  return [...groups.entries()].sort((a, b) => b[1].evaluated - a[1].evaluated)
}

function outcomeReturn(item: OutcomeWithReview): number | null {
  return item.outcome.priceReturnPct ?? item.outcome.returnPct ?? null
}

function relativeReturn(item: OutcomeWithReview): number | null {
  return item.outcome.relativeReturnPct ?? item.outcome.relativeToTopixPct ?? null
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '未計測'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function resultLabel(result: string | null | undefined): string {
  return OUTCOME_LABELS[result ?? 'unevaluated'] ?? result ?? '未評価'
}

function CaseRow({ item, note }: { item: OutcomeWithReview; note?: string }) {
  const result = item.outcome.result ?? 'unevaluated'
  const autoReason = item.outcome.autoMissReason
  const manualReason = item.outcome.manualMissReason

  return (
    <div className={styles.caseRow}>
      <div className={styles.rowTop}>
        <div className={styles.identity}>
          <div className={styles.topic}>{item.review.topic}</div>
          <div className={styles.meta}>
            {item.review.affectedCompanyCodes.join(', ') || '銘柄未紐付け'} ・ {item.outcome.horizon}
            {' '}・ 値動き {formatPct(outcomeReturn(item))} ・ TOPIX比 {formatPct(relativeReturn(item))}
          </div>
        </div>
        <div className={styles.state} style={{ color: OUTCOME_COLORS[result] ?? 'var(--ink-3)' }}>
          {resultLabel(result)}
        </div>
      </div>
      <div className={styles.bodyText}>
        confidence {item.review.confidence ?? '未設定'}
        {autoReason ? ` ・ 自動判定理由: ${autoReason}` : ''}
        {manualReason ? ` ・ 確認理由: ${MISS_REASON_LABELS[manualReason] ?? manualReason}` : ''}
        {note ? ` ・ ${note}` : ''}
      </div>
    </div>
  )
}

function PerformanceRows({ rows, label }: { rows: ReturnType<typeof performanceBy>; label: (key: string) => string }) {
  if (rows.length === 0) return <div className={styles.empty}>まだ比較できる評価済みデータがありません。</div>
  return (
    <div>
      {rows.map(([key, perf]) => (
        <div key={key} className={styles.performanceRow}>
          <div className={styles.performanceName}>{label(key)}</div>
          <div className={styles.performanceMetric}><span>評価済み</span>{perf.evaluated}</div>
          <div className={`${styles.performanceMetric} ${styles.positive}`}><span>整合</span>{perf.hit}</div>
          <div className={`${styles.performanceMetric} ${styles.warning}`}><span>差分</span>{perf.miss}</div>
          <div className={`${styles.performanceMetric} ${styles.negative}`}><span>逆行</span>{perf.inverse}</div>
        </div>
      ))}
    </div>
  )
}

function LatestReviewRow({ review }: { review: WorldImpactReview }) {
  const status = review.reviewStatus ?? 'pending'
  const mechanisms = review.mechanisms ?? []
  const pathThemes = review.impactPath?.themes ?? []

  return (
    <article className={styles.reviewRow}>
      <div className={styles.rowTop}>
        <div className={styles.identity}>
          <div className={styles.topic}>{review.topic}</div>
          <div className={styles.meta}>
            {review.eventDate} ・ {review.affectedCompanyCodes.join(', ') || '銘柄未紐付け'}
            {' '}・ {SOURCE_QUALITY_LABELS[review.sourceQuality] ?? review.sourceQuality}
            {review.direction ? ` ・ ${DIRECTION_LABELS[review.direction] ?? review.direction}` : ''}
          </div>
        </div>
        <div className={styles.state} style={{ color: REVIEW_STATUS_COLORS[status] ?? 'var(--ink-3)' }}>
          {REVIEW_STATUS_LABELS[status] ?? status}
        </div>
      </div>

      <div className={styles.hypothesisGrid}>
        <div className={styles.hypothesisItem}>
          <div className={styles.itemLabel}>影響経路</div>
          <div className={styles.itemText}>
            {mechanisms.length > 0 ? mechanisms.map(item => MECHANISM_LABELS[item] ?? item).join(' → ') : review.expectedMechanism || '未整理'}
            {pathThemes.length > 0 ? ` → ${pathThemes.slice(0, 4).join('・')}` : ''}
          </div>
        </div>
        <div className={styles.hypothesisItem}>
          <div className={styles.itemLabel}>検証する仮説</div>
          <div className={styles.itemText}>{review.thesis || review.expectedMechanism || '未記録'}</div>
        </div>
        <div className={styles.hypothesisItem}>
          <div className={styles.itemLabel}>外れたと判断する条件</div>
          <div className={styles.itemText}>{review.falsification || review.counterArgument || '未設定'}</div>
        </div>
      </div>

      <div className={styles.meta}>
        confidence {review.confidence ?? '未設定'} ・ 想定ラグ {review.expectedLagDays ?? '-'}日
        {review.reviewDueAt ? ` ・ レビュー期限 ${review.reviewDueAt}` : ''}
      </div>

      {review.outcomes.length > 0 && (
        <div className={styles.outcomes}>
          {review.outcomes.map(outcome => {
            const result = outcome.result ?? 'unevaluated'
            return (
              <div key={outcome.horizon} className={styles.outcome}>
                {outcome.horizon}<strong style={{ color: OUTCOME_COLORS[result] ?? 'var(--ink)' }}>{resultLabel(result)}</strong>
              </div>
            )
          })}
        </div>
      )}

      {review.lesson && <div className={styles.bodyText}>学習メモ: {review.lesson}</div>}

      {review.affectedCompanyCodes.length > 0 && (
        <div className={styles.links}>
          {review.affectedCompanyCodes.map(code => (
            <Link key={code} href={`/stocks/${code}`} className={styles.stockLink}>{code} の銘柄詳細 →</Link>
          ))}
        </div>
      )}
    </article>
  )
}

export default function WorldImpactPage() {
  const data = loadGeneratedData()
  const reviews: WorldImpactReview[] = data.worldImpactReviews ?? []
  const audit = data.worldImpactAudit ?? null

  const mechanismCounts = countBy(reviews, review => review.mechanisms ?? ['unknown'])
  const statusCounts = countBy(reviews, review => [review.reviewStatus ?? 'pending'])
  const outcomeCounts = countBy(reviews.flatMap(review => review.outcomes), outcome => [outcome.result ?? 'unevaluated'])
  const missReasonCounts = countBy(
    reviews.flatMap(review => review.outcomes).filter(outcome => outcome.missReason),
    outcome => [outcome.missReason as string],
  )
  const pendingReviews = reviews.filter(review => (review.reviewStatus ?? 'pending') === 'pending')
  const sortedReviews = [...reviews].sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))
  const allOutcomes: OutcomeWithReview[] = reviews.flatMap(review =>
    (review.outcomes ?? []).map(outcome => ({ review, outcome })),
  )
  const evaluatedOutcomes = allOutcomes
    .filter(({ outcome }) => outcome.evaluatedAt != null)
    .sort((a, b) => (b.outcome.evaluatedAt ?? '').localeCompare(a.outcome.evaluatedAt ?? ''))
  const inverseCases = allOutcomes.filter(({ outcome }) => outcome.result === 'inverse')
  const highConfMisses = allOutcomes.filter(({ review, outcome }) =>
    (review.confidence ?? 0) >= 0.5 && (outcome.result === 'miss' || outcome.result === 'inverse'))
  const lowConfHits = allOutcomes.filter(({ review, outcome }) =>
    review.confidence != null && review.confidence <= 0.4 && outcome.result === 'hit')
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const overdueUnevaluated = allOutcomes.filter(({ outcome }) =>
    outcome.dueAt && outcome.dueAt < today
    && (outcome.result == null || outcome.result === 'unknown' || outcome.result === 'too_early'))
  const confPerformance = performanceBy(allOutcomes, ({ review }) => [confidenceBandLabel(review.confidence)])
  const mechPerformance = performanceBy(allOutcomes, ({ review }) => review.mechanisms ?? ['unknown'])
  const directionPerformance = performanceBy(allOutcomes, ({ review }) => [review.direction ?? 'unclear'])
  const dataQualityIssues = (audit?.priorityIssues ?? []).slice(0, 6)
  const exceptionCount = overdueUnevaluated.length + highConfMisses.length + inverseCases.length + dataQualityIssues.length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>世界ニュース → 日本株 → 答え合わせ</p>
        <h1 className={styles.title}>世界ニュースの影響検証</h1>
        <p className={styles.lead}>
          世界の出来事が、どの経路で日本企業へ影響すると考えたか、その後の値動きと照らして検証します。
          「仮説と整合」は売買の成功を意味するものではありません。
        </p>
      </header>

      <div className={styles.content}>
        <section className={styles.summary} aria-label="世界ニュース影響仮説の概要">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>影響仮説</div>
            <div className={styles.summaryValue}>{reviews.length}件</div>
          </div>
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>未検証</div>
            <div className={`${styles.summaryValue} ${pendingReviews.length > 0 ? styles.warning : ''}`}>{pendingReviews.length}件</div>
          </div>
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>評価済みoutcome</div>
            <div className={styles.summaryValue}>{evaluatedOutcomes.length}件</div>
          </div>
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>期限切れ・未評価</div>
            <div className={`${styles.summaryValue} ${overdueUnevaluated.length > 0 ? styles.negative : ''}`}>{overdueUnevaluated.length}件</div>
          </div>
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>価格データ待ち</div>
            <div className={`${styles.summaryValue} ${(audit?.priceDataPending ?? 0) > 0 ? styles.warning : ''}`}>{audit?.priceDataPending ?? 0}件</div>
          </div>
        </section>

        <div className={styles.notice}>
          仮説・confidence・メカニズムは予測時点の記録です。結果が未評価やデータ不足のものは、無理に当たり外れへ分類しません。
        </div>

        {exceptionCount > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>今、確認したい例外</h2>
              <div className={styles.sectionMeta}>{exceptionCount}件の確認材料</div>
            </div>
            <div className={styles.issueList}>
              {overdueUnevaluated.slice(0, 6).map(item => (
                <CaseRow key={`overdue-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note={`期限 ${item.outcome.dueAt}`} />
              ))}
              {highConfMisses.slice(0, 5).map(item => (
                <CaseRow key={`high-conf-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note="高confidenceで想定差分/逆行" />
              ))}
              {lowConfHits.slice(0, 4).map(item => (
                <CaseRow key={`low-conf-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note="低confidenceで仮説と整合" />
              ))}
              {inverseCases.slice(0, 5).map(item => (
                <CaseRow key={`inverse-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note="想定と逆方向の値動き" />
              ))}
              {dataQualityIssues.map((issue, index) => (
                <div key={`quality-${index}`} className={styles.issueRow}>
                  <div className={styles.rowTop}>
                    <div className={styles.identity}>
                      <div className={styles.topic}>{issue.title ?? 'データ品質の確認'}</div>
                      <div className={styles.bodyText}>{issue.detail ?? ''}</div>
                    </div>
                    <div className={styles.state} style={{ color: issue.severity === 'urgent' ? 'var(--urgent)' : issue.severity === 'attention' ? 'var(--amber)' : 'var(--ink-3)' }}>
                      {issue.severity === 'urgent' ? '要対応' : issue.severity === 'attention' ? '確認' : '情報'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>最新の影響仮説</h2>
            <div className={styles.sectionMeta}>{reviews.length}件 ・ 新しいイベント順</div>
          </div>
          {reviews.length === 0 ? (
            <div className={styles.empty}>
              まだ世界ニュースの影響仮説はありません。生成された仮説が利用できるようになると、影響経路と検証条件がここに表示されます。
            </div>
          ) : (
            <div className={styles.reviewList}>
              {sortedReviews.slice(0, 12).map(review => <LatestReviewRow key={review.reviewKey} review={review} />)}
            </div>
          )}
        </section>

        {pendingReviews.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>まだ検証していないもの</h2>
              <div className={styles.sectionMeta}>{pendingReviews.length}件</div>
            </div>
            <div className={styles.caseList}>
              {pendingReviews.slice(0, 10).map(review => (
                <div key={review.reviewKey} className={styles.caseRow}>
                  <div className={styles.rowTop}>
                    <div className={styles.identity}>
                      <div className={styles.topic}>{review.topic}</div>
                      <div className={styles.meta}>
                        {review.affectedCompanyCodes.join(', ') || '銘柄未紐付け'} ・ レビュー期限 {review.reviewDueAt ?? '未設定'}
                      </div>
                    </div>
                    <div className={`${styles.state} ${styles.warning}`}>未検証</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>詳しい研究統計</h2>
            <div className={styles.sectionMeta}>必要なときだけ確認</div>
          </div>
          <details className={styles.details}>
            <summary>メカニズム・結果・confidence別の集計を開く</summary>
            <div className={styles.detailsBody}>
              <div>
                <h3 className={styles.statsGroupTitle}>レビュー状態</h3>
                <div className={styles.statList}>
                  {statusCounts.map(([status, count]) => (
                    <div key={status} className={styles.statRow}>
                      <div className={styles.statLabel}>{REVIEW_STATUS_LABELS[status] ?? status}</div>
                      <div className={styles.statValue}>{count}件</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>影響メカニズム</h3>
                <div className={styles.statList}>
                  {mechanismCounts.map(([mechanism, count]) => (
                    <div key={mechanism} className={styles.statRow}>
                      <div className={styles.statLabel}>{MECHANISM_LABELS[mechanism] ?? mechanism}</div>
                      <div className={styles.statValue}>{count}件</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>outcome結果</h3>
                <div className={styles.statList}>
                  {outcomeCounts.map(([result, count]) => (
                    <div key={result} className={styles.statRow}>
                      <div className={styles.statLabel}>{resultLabel(result)}</div>
                      <div className={styles.statValue}>{count}件</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>想定差分になった理由</h3>
                {missReasonCounts.length === 0 ? (
                  <div className={styles.empty}>まだ理由を比較できるだけの記録がありません。</div>
                ) : (
                  <div className={styles.statList}>
                    {missReasonCounts.map(([reason, count]) => (
                      <div key={reason} className={styles.statRow}>
                        <div className={styles.statLabel}>{MISS_REASON_LABELS[reason] ?? reason}</div>
                        <div className={styles.statValue}>{count}件</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>confidence帯別の検証成績</h3>
                <PerformanceRows rows={confPerformance} label={key => key} />
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>メカニズム別の検証成績</h3>
                <PerformanceRows rows={mechPerformance.slice(0, 10)} label={key => MECHANISM_LABELS[key] ?? key} />
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>方向別の検証成績</h3>
                <PerformanceRows rows={directionPerformance} label={key => DIRECTION_LABELS[key] ?? key} />
              </div>

              {evaluatedOutcomes.length > 0 && (
                <details className={styles.subDetails}>
                  <summary>最近の評価済みoutcomeを見る</summary>
                  <div className={styles.subDetailsBody}>
                    {evaluatedOutcomes.slice(0, 10).map(item => (
                      <CaseRow key={`evaluated-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note={`評価日 ${item.outcome.evaluatedAt}`} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          </details>
        </section>

        <Disclaimer />
        <div className={styles.footerSpace} />
      </div>
    </main>
  )
}
