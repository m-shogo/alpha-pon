import { loadGeneratedData } from '@/lib/generated-data'
import { Disclaimer } from '@/components/Disclaimer'
import styles from './outcomes.module.css'

export const metadata = { title: '答え合わせ | alpha-pon' }

const RESULT_META = {
  hit: { label: '一致', color: 'var(--mint-deep)' },
  miss: { label: '不一致', color: 'var(--urgent)' },
  too_early: { label: 'まだ判断しない', color: 'var(--amber)' },
  invalidated: { label: '反証', color: 'var(--urgent)' },
  unknown: { label: '未評価', color: 'var(--ink-3)' },
} as const

const ACTION_LABEL_DISPLAY = {
  watch: '監視候補系（watch）',
  log: '記録保存系（log）',
  ignore: '対象外系（ignore）',
} as const

const HORIZON_LABEL = {
  '1d': '1日後',
  '1w': '1週間後',
  '1m': '1か月後',
  '3m': '3か月後',
} as const

const DATA_QUALITY_LABEL = {
  ok: '十分',
  partial: '一部不足',
  missing: '不足',
} as const

type Outcome = NonNullable<ReturnType<typeof loadGeneratedData>['hypothesisOutcomes']>[number]

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '未計測'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function formatRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '未算出'
  return `${(value * 100).toFixed(0)}%`
}

function returnClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return styles.muted
  return value >= 0 ? styles.positive : styles.negative
}

function PercentValue({ value }: { value: number | null | undefined }) {
  return <span className={value == null ? styles.muted : undefined}>{formatRate(value)}</span>
}

function ReturnValue({ value }: { value: number | null | undefined }) {
  return <span className={returnClass(value)}>{formatPct(value)}</span>
}

function resultLabel(result: Outcome['result']) {
  return RESULT_META[result]?.label ?? '未評価'
}

function hitRate(items: Outcome[]) {
  const resolved = items.filter(item => item.result === 'hit' || item.result === 'miss')
  if (resolved.length === 0) return null
  return resolved.filter(item => item.result === 'hit').length / resolved.length
}

function avg(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

function returnForHorizon(outcome: Outcome, horizon: Outcome['reviewHorizon']) {
  if (horizon === '1d') return outcome.return1d
  if (horizon === '1w') return outcome.return1w
  if (horizon === '3m') return outcome.return3m
  return outcome.return1m
}

function relativeTopixForHorizon(outcome: Outcome, horizon: Outcome['reviewHorizon']) {
  if (horizon === '1d') return outcome.relativeToTopix1d
  if (horizon === '1w') return outcome.relativeToTopix1w
  if (horizon === '3m') return outcome.relativeToTopix3m
  return outcome.relativeToTopix1m
}

function relativeTopixForOwnHorizon(outcome: Outcome) {
  return relativeTopixForHorizon(outcome, outcome.reviewHorizon)
}

function isSpecialOutcome(outcome: Outcome) {
  return /\[special_situation\]|特殊状況|lockup|carve-out|spin-off|PE exit/i.test(outcome.hypothesis?.reason ?? '')
}

function groupBy<T extends string>(outcomes: Outcome[], getKey: (outcome: Outcome) => T) {
  const grouped = new Map<T, Outcome[]>()
  for (const outcome of outcomes) {
    const key = getKey(outcome)
    grouped.set(key, [...(grouped.get(key) ?? []), outcome])
  }
  return grouped
}

function OutcomeStatRow({
  label,
  items,
  topixAxis = 'ownHorizon',
}: {
  label: string
  items: Outcome[]
  topixAxis?: Outcome['reviewHorizon'] | 'ownHorizon'
}) {
  const counts = {
    hit: items.filter(item => item.result === 'hit').length,
    miss: items.filter(item => item.result === 'miss').length,
    tooEarly: items.filter(item => item.result === 'too_early').length,
    unknown: items.filter(item => item.result === 'unknown').length,
  }
  const topixValues = items.map(item => topixAxis === 'ownHorizon'
    ? relativeTopixForOwnHorizon(item)
    : relativeTopixForHorizon(item, topixAxis))

  return (
    <tr>
      <td>{label}</td>
      <td data-label="件数">{items.length}件</td>
      <td data-label="一致率"><PercentValue value={hitRate(items)} /></td>
      <td data-label="一致"><span className={styles.positive}>{counts.hit}</span></td>
      <td data-label="不一致"><span className={styles.negative}>{counts.miss}</span></td>
      <td data-label="判断待ち"><span className={styles.warning}>{counts.tooEarly}</span></td>
      <td data-label="未評価"><span className={styles.muted}>{counts.unknown}</span></td>
      <td data-label="平均TOPIX比"><ReturnValue value={avg(topixValues)} /></td>
    </tr>
  )
}

function OutcomeRow({ outcome }: { outcome: Outcome }) {
  const result = RESULT_META[outcome.result] ?? RESULT_META.unknown
  const ownReturn = returnForHorizon(outcome, outcome.reviewHorizon)
  const ownRelative = relativeTopixForOwnHorizon(outcome)
  const hasReflection = Boolean(
    outcome.whatMatched?.length
    || outcome.whatDiffered?.length
    || outcome.missedSignals?.length
    || outcome.improvedRuleIdeas?.length,
  )

  return (
    <article className={styles.outcomeRow}>
      <div className={styles.outcomeTop}>
        <div className={styles.outcomeIdentity}>
          <div className={styles.outcomeNameLine}>
            <span className={styles.outcomeName}>{outcome.name}</span>
            <span className={styles.outcomeCode}>{outcome.code}</span>
            {outcome.dataSource === 'mock' && <span className={styles.sampleLabel}>サンプルデータ</span>}
          </div>
          <div className={styles.outcomeMeta}>
            {outcome.evaluatedAt}に検証 ・ {HORIZON_LABEL[outcome.reviewHorizon]} ・ {ACTION_LABEL_DISPLAY[outcome.actionLabel]}
            {outcome.scoreAtPrediction != null ? ` ・ 予測時スコア ${outcome.scoreAtPrediction}` : ''}
          </div>
        </div>
        <div className={styles.resultState} style={{ color: result.color }}>
          {resultLabel(outcome.result)}
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>{HORIZON_LABEL[outcome.reviewHorizon]}の値動き</div>
          <div className={`${styles.metricValue} ${returnClass(ownReturn)}`}>{formatPct(ownReturn)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>同期間のTOPIX比</div>
          <div className={`${styles.metricValue} ${returnClass(ownRelative)}`}>{formatPct(ownRelative)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>1か月の値動き</div>
          <div className={`${styles.metricValue} ${returnClass(outcome.return1m)}`}>{formatPct(outcome.return1m)}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>最大下落</div>
          <div className={`${styles.metricValue} ${returnClass(outcome.maxDrawdownPct)}`}>{formatPct(outcome.maxDrawdownPct)}</div>
        </div>
      </div>

      <p className={styles.lesson}>
        仮説: {outcome.hypothesis.reason}
        {' '}・ データ品質: {DATA_QUALITY_LABEL[outcome.dataAvailability]}
        {outcome.notes ? ` ・ ${outcome.notes}` : ''}
      </p>

      {hasReflection && (
        <details className={styles.reflectionDetails}>
          <summary>反省と学びを見る</summary>
          <div className={styles.reflectionBody}>
            {outcome.whatMatched?.map((item, index) => (
              <div key={`matched-${index}`} className={styles.reflectionLine}>
                <span className={styles.reflectionLabel}>一致した点</span>{item}
              </div>
            ))}
            {outcome.whatDiffered?.map((item, index) => (
              <div key={`differed-${index}`} className={styles.reflectionLine}>
                <span className={styles.reflectionLabel}>違った点</span>{item}
              </div>
            ))}
            {outcome.missedSignals?.map((item, index) => (
              <div key={`missed-${index}`} className={styles.reflectionLine}>
                <span className={styles.reflectionLabel}>見落とし</span>{item}
              </div>
            ))}
            {outcome.improvedRuleIdeas?.map((item, index) => (
              <div key={`improved-${index}`} className={styles.reflectionLine}>
                <span className={styles.reflectionLabel}>改善案</span>{item}
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  )
}

export default function OutcomesPage() {
  const data = loadGeneratedData()
  const outcomes = data.hypothesisOutcomes ?? []
  const summary = data.accuracySummary ?? null
  const sorted = [...outcomes].sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))
  const byHorizon = groupBy(outcomes, outcome => outcome.reviewHorizon)
  const byLabel = groupBy(outcomes, outcome => outcome.actionLabel)
  const specialOutcomes = outcomes.filter(isSpecialOutcome)
  const missingEvidenceOutcomes = outcomes.filter(outcome => (outcome.hypothesis?.evidenceNeeded ?? []).length >= 3)
  const counts = {
    hit: outcomes.filter(item => item.result === 'hit').length,
    miss: outcomes.filter(item => item.result === 'miss').length,
    invalidated: outcomes.filter(item => item.result === 'invalidated').length,
    pending: outcomes.filter(item => item.result === 'too_early' || item.result === 'unknown').length,
  }
  const allScoreBandsEmpty = summary?.byScoreBand
    ? Object.values(summary.byScoreBand).every(item => (item?.total ?? 0) === 0)
    : true

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>仮説の答え合わせ</p>
        <h1 className={styles.title}>実際どうだった？</h1>
        <p className={styles.lead}>
          過去に立てた仮説が、その後の値動きやTOPIXとの比較でどうだったかを確認します。
          一致率は買い推奨の成績ではなく、研究仮説の検証結果です。
        </p>
      </header>

      <div className={styles.content}>
        <section className={styles.summarySurface} aria-label="答え合わせの概要">
          <div className={styles.summaryHeading}>
            <div>
              <div className={styles.summaryKicker}>現在の検証結果</div>
              <div className={styles.summaryPrimary}>
                {summary ? formatRate(summary.hitRate) : '未算出'}
                <span>一致率</span>
              </div>
              <p className={styles.summaryNote}>
                一致率は「一致 / 不一致」まで判定できた仮説を母数にした既存の集計値です。
                まだ判断できないものや反証は別に表示します。
              </p>
            </div>
            <div className={styles.summaryCounts}>
              <div className={styles.summaryCount}>
                <div className={styles.summaryCountLabel}>一致</div>
                <div className={`${styles.summaryCountValue} ${styles.positive}`}>{counts.hit}件</div>
              </div>
              <div className={styles.summaryCount}>
                <div className={styles.summaryCountLabel}>不一致</div>
                <div className={`${styles.summaryCountValue} ${styles.negative}`}>{counts.miss}件</div>
              </div>
              <div className={styles.summaryCount}>
                <div className={styles.summaryCountLabel}>反証</div>
                <div className={`${styles.summaryCountValue} ${styles.negative}`}>{counts.invalidated}件</div>
              </div>
              <div className={styles.summaryCount}>
                <div className={styles.summaryCountLabel}>判断待ち・未評価</div>
                <div className={`${styles.summaryCountValue} ${styles.warning}`}>{counts.pending}件</div>
              </div>
            </div>
          </div>

          <div className={styles.supportGrid}>
            <div className={styles.supportMetric}>
              <div className={styles.supportMetricLabel}>総検証数</div>
              <div className={styles.supportMetricValue}>{summary?.total ?? outcomes.length}件</div>
            </div>
            <div className={styles.supportMetric}>
              <div className={styles.supportMetricLabel}>平均1か月リターン</div>
              <div className={`${styles.supportMetricValue} ${returnClass(summary?.avgReturn1m)}`}>
                {formatPct(summary?.avgReturn1m)}
              </div>
            </div>
            <div className={styles.supportMetric}>
              <div className={styles.supportMetricLabel}>平均TOPIX比（1か月）</div>
              <div className={`${styles.supportMetricValue} ${returnClass(summary?.avgRelativeToTopix1m)}`}>
                {formatPct(summary?.avgRelativeToTopix1m)}
              </div>
            </div>
          </div>
        </section>

        <div className={styles.notice}>
          価格データ未反映やレビュー母数不足の間は「まだ判断しない / 未評価」として扱います。
          0件や未算出は失敗ではなく、答え合わせできる時点まで待っている状態です。
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>検証履歴</h2>
            <div className={styles.sectionMeta}>{outcomes.length}件 ・ 新しい順</div>
          </div>
          {outcomes.length === 0 ? (
            <div className={styles.empty}>
              まだ答え合わせできる仮説はありません。レビュー時点に到達した結果が生成されると、ここに履歴が並びます。
            </div>
          ) : (
            <div className={styles.outcomeList}>
              {sorted.map((outcome, index) => (
                <OutcomeRow key={`${outcome.code}:${outcome.hypothesis.detectedAt}:${outcome.reviewHorizon}:${index}`} outcome={outcome} />
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>詳しい集計</h2>
            <div className={styles.sectionMeta}>期間・分類・スコア帯</div>
          </div>
          <details className={styles.statsDetails}>
            <summary>研究用の統計を開く</summary>
            <div className={styles.statsBody}>
              <div>
                <h3 className={styles.statsGroupTitle}>レビュー時点別</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.statTable}>
                    <thead>
                      <tr>
                        <th>時点</th>
                        <th>件数</th>
                        <th>一致率</th>
                        <th>一致</th>
                        <th>不一致</th>
                        <th>判断待ち</th>
                        <th>未評価</th>
                        <th>平均TOPIX比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['1d', '1w', '1m', '3m'] as const).map(horizon => (
                        <OutcomeStatRow
                          key={horizon}
                          label={HORIZON_LABEL[horizon]}
                          items={byHorizon.get(horizon) ?? []}
                          topixAxis={horizon}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className={styles.statsGroupTitle}>候補の扱い別</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.statTable}>
                    <thead>
                      <tr>
                        <th>分類</th>
                        <th>件数</th>
                        <th>一致率</th>
                        <th>一致</th>
                        <th>不一致</th>
                        <th>判断待ち</th>
                        <th>未評価</th>
                        <th>平均TOPIX比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['watch', 'log', 'ignore'] as const).map(label => (
                        <OutcomeStatRow key={label} label={ACTION_LABEL_DISPLAY[label]} items={byLabel.get(label) ?? []} />
                      ))}
                      <OutcomeStatRow label="特殊状況" items={specialOutcomes} />
                      <OutcomeStatRow label="必要証拠が多い仮説" items={missingEvidenceOutcomes} />
                    </tbody>
                  </table>
                </div>
              </div>

              {summary?.byActionLabel && (
                <div>
                  <h3 className={styles.statsGroupTitle}>分類別のTOPIX超過リターン</h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.statTable}>
                      <thead>
                        <tr>
                          <th>分類</th>
                          <th>件数</th>
                          <th>1週間</th>
                          <th>1か月</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(['watch', 'log', 'ignore'] as const).map(label => {
                          const stats = summary.byActionLabel[label]
                          return (
                            <tr key={label}>
                              <td>{ACTION_LABEL_DISPLAY[label]}</td>
                              <td data-label="件数">{stats.total}件</td>
                              <td data-label="1週間"><ReturnValue value={stats.avgExcessReturn1w} /></td>
                              <td data-label="1か月"><ReturnValue value={stats.avgExcessReturn1m} /></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {summary?.byScoreBand && (
                <div>
                  <h3 className={styles.statsGroupTitle}>予測時スコア帯別</h3>
                  {allScoreBandsEmpty ? (
                    <div className={styles.empty}>まだスコア帯別に比較できるだけの検証データがありません。</div>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.statTable}>
                        <thead>
                          <tr>
                            <th>スコア帯</th>
                            <th>件数</th>
                            <th>一致率</th>
                            <th>TOPIX比 1週間</th>
                            <th>TOPIX比 1か月</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(['0-49', '50-69', '70-84', '85-100', 'unknown'] as const).map(band => {
                            const stats = summary.byScoreBand[band]
                            return (
                              <tr key={band}>
                                <td>{band === 'unknown' ? 'スコア未記録' : band}</td>
                                <td data-label="件数">{stats.total}件</td>
                                <td data-label="一致率"><PercentValue value={stats.hitRate} /></td>
                                <td data-label="TOPIX比 1週間"><ReturnValue value={stats.avgExcessReturn1w} /></td>
                                <td data-label="TOPIX比 1か月"><ReturnValue value={stats.avgExcessReturn1m} /></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        </section>

        <Disclaimer compact />
        <div className={styles.footerSpace} />
      </div>
    </main>
  )
}
