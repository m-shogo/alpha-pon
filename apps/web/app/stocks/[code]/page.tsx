import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Disclaimer } from '@/components/Disclaimer'
import { Icon } from '@/components/Icon'
import { ScoreViz } from '@/components/ScoreViz'
import { loadGeneratedData } from '@/lib/generated-data'
import { formatPercent } from '@/lib/format'
import { getStockDetail, type StockDetailStatus } from '@/lib/stock-detail'
import styles from './StockDetailV2.module.css'

type Props = {
  params: Promise<{ code: string }>
}

const STATUS_META: Record<StockDetailStatus, { label: string; color: string }> = {
  ok: { label: '確認済み', color: 'var(--mint-deep)' },
  info: { label: '確認中', color: 'var(--sky-deep)' },
  attention: { label: '要確認', color: 'var(--amber)' },
  missing: { label: '未確認', color: 'var(--ink-3)' },
}

const DIRECTION_LABELS: Record<string, string> = {
  positive: 'プラス方向',
  negative: 'マイナス方向',
  mixed: '影響混在',
  unclear: '方向未確定',
  up: '上昇方向',
  down: '下落方向',
  flat: '横ばい',
  unknown: '未確定',
}

const DATA_LABELS: Record<string, string> = {
  ok: '取得済み',
  partial: '一部取得',
  priceDataPending: '価格データ待ち',
  unavailable: '利用不可',
  missing: '未取得',
  unknown: '未確認',
}

export async function generateStaticParams() {
  try {
    const data = loadGeneratedData()
    const codes = [
      ...data.candidates.map(item => item.code),
      ...(data.universeCandidates ?? []).map(item => item.code),
      ...(data.hypothesisPredictions ?? []).map(item => item.code),
      ...(data.hypothesisOutcomes ?? []).map(item => item.code),
      ...(data.specialSituationWatch?.candidates ?? []).map(item => item.code),
    ]
    return [...new Set(codes.filter(Boolean))].map(code => ({ code }))
  } catch {
    return []
  }
}

function StatusText({ status, label }: { status: StockDetailStatus; label?: string }) {
  const meta = STATUS_META[status]
  return (
    <span className={styles.status}>
      <span className={styles.dot} style={{ background: meta.color }} />
      {label ?? meta.label}
    </span>
  )
}

function EmptyText({ children = '未記録' }: { children?: string }) {
  return <p className={styles.empty}>{children}</p>
}

function ListBlock({ items, empty = '未記録' }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <EmptyText>{empty}</EmptyText>
  return (
    <div className={styles.list}>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className={styles.listRow}>
          <span className={styles.listDot} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value, status = 'missing' }: { label: string; value: string; status?: StockDetailStatus }) {
  const meta = STATUS_META[status]
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>
        <span className={styles.dot} style={{ background: meta.color }} />
        <span>{value}</span>
      </div>
    </div>
  )
}

function dataLabel(value: string | null | undefined): string {
  if (!value) return '未確認'
  return DATA_LABELS[value] ?? value
}

function directionLabel(value: string | null | undefined): string {
  if (!value) return '未確定'
  return DIRECTION_LABELS[value] ?? value
}

function pct(value: number | null): string {
  return value == null ? '比較不能' : formatPercent(value, true)
}

function worldOutcomeLabel(outcome: { result: string | null; dataAvailability: string; expectedDirection: string; actualDirection: string }): { label: string; status: StockDetailStatus } {
  if (outcome.result === 'insufficient_data') return { label: '未評価・データ不足', status: 'info' }
  if (outcome.dataAvailability !== 'ok') return { label: '未評価・価格データ不足', status: 'info' }
  if (outcome.result == null || outcome.result === 'unknown') return { label: '未評価', status: 'missing' }
  if (outcome.result === 'hit' && outcome.expectedDirection === 'unknown' && outcome.actualDirection === 'unknown') return { label: '未評価・方向未確定', status: 'missing' }
  if (outcome.result === 'too_early') return { label: '時期尚早', status: 'info' }
  if (outcome.result === 'miss') return { label: '想定との差あり', status: 'attention' }
  if (outcome.result === 'inverse') return { label: '想定と逆行', status: 'attention' }
  if (outcome.result === 'unclear') return { label: '判定不能', status: 'missing' }
  return { label: '仮説と整合', status: 'ok' }
}

const WORLD_MECHANISM_LABELS: Record<string, string> = {
  demand: '需要', supply: '供給', cost: 'コスト', fx: '為替', rates: '金利',
  regulation: '規制・政策', energy: 'エネルギー', defense: '防衛', semiconductor: '半導体・AI',
  consumer: '消費', travel: '旅行・インバウンド', logistics: '物流・海運',
  ip_brand: 'IP・ブランド', geopolitical: '地政学', climate_disaster: '災害・気候', unknown: '分類未確定',
}

const WORLD_REVIEW_STATUS_LABELS: Record<string, { label: string; status: StockDetailStatus }> = {
  pending: { label: '未検証', status: 'info' },
  reviewed: { label: '検証済み', status: 'ok' },
  skipped: { label: '検証対象外', status: 'missing' },
  insufficient_data: { label: 'データ不足', status: 'attention' },
}

export default async function StockDetailPage({ params }: Props) {
  const { code } = await params
  const detail = getStockDetail(code)
  if (!detail) notFound()

  const latestHypothesis = detail.hypotheses[0]
  const scoreForViz = detail.candidate?.score
  const availabilityStatus: StockDetailStatus = detail.dataAvailability === 'ok'
    ? 'ok'
    : detail.dataAvailability === 'priceDataPending'
      ? 'info'
      : detail.dataAvailability === 'partial'
        ? 'attention'
        : 'missing'

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/stocks" className={styles.back} aria-label="銘柄一覧へ戻る">
          <Icon name="back" size={20} />
        </Link>
        <div>
          <h1 className={styles.title}>{detail.name}</h1>
          <div className={styles.meta}>
            {detail.code}{detail.market ? ` ・ ${detail.market}` : ''} ・ 更新 {detail.lastUpdatedAt ?? '未取得'}
          </div>
        </div>
        <StatusText status={detail.status} />
      </header>

      <section className={styles.intro}>
        <div>
          <div className={styles.eyebrow}>調査・検証の記録</div>
          <p className={styles.lead}>
            調査候補になった理由、現在の仮説、反証条件、答え合わせ、次に確認することを一つの流れで追います。
          </p>
        </div>
        <div className={styles.sourceList}>
          <StatusText status={availabilityStatus} label={detail.dataAvailabilityReason} />
          {detail.sourceKinds.map(kind => (
            <div key={kind} className={styles.sourceItem}>情報源: {kind}</div>
          ))}
        </div>
      </section>

      <div className={styles.notice}>
        このページは調査・検証の記録です。投資助言や注文判断の自動化ではありません。
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>今日の状態</h2>
          <span className={styles.sectionMeta}>まず確認する6項目</span>
        </div>
        <div className={styles.metricGrid}>
          <Metric label="スコア" value={detail.score == null ? '未記録' : `${detail.score}/100`} status={detail.score == null ? 'missing' : 'ok'} />
          <Metric label="運用シグナル" value={detail.opsSignals.length === 0 ? '通常' : `${detail.opsSignals.length}件`} status={detail.opsSignals.some(item => item.status === 'attention') ? 'attention' : detail.opsSignals.length > 0 ? 'info' : 'ok'} />
          <Metric label="古いデータの代替" value={detail.staleFallback ? '確認対象' : 'なし'} status={detail.staleFallback ? 'attention' : 'ok'} />
          <Metric label="一次情報の確認" value={detail.sourceVerification === 'ok' ? '一次情報あり' : detail.sourceVerification === 'attention' ? '確認対象' : '未確認'} status={detail.sourceVerification} />
          <Metric label="価格データ" value={detail.priceDataPending ? '提供待ち' : '利用可能'} status={detail.priceDataPending ? 'info' : 'ok'} />
          <Metric label="生成データ" value={detail.generatedAt ?? '未生成'} status={detail.generatedAt ? 'ok' : 'missing'} />
        </div>
        {scoreForViz != null && (
          <div className={styles.scoreViz}>
            <ScoreViz score={scoreForViz} variant="bars" />
          </div>
        )}
        {detail.opsSignals.length > 0 && (
          <div className={styles.signalList}>
            {detail.opsSignals.map((signal, index) => (
              <div key={`${signal.title}-${index}`} className={styles.signalRow}>
                <div className={styles.rowTop}>
                  <h3 className={styles.rowTitle}>{signal.title}</h3>
                  <StatusText status={signal.status} />
                </div>
                <div className={styles.rowBody}>{signal.detail}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>なぜ調査候補になったか</h2>
        </div>
        <ListBlock items={detail.researchReasons} />
        {detail.eventNotes.length > 0 && (
          <div className={styles.inlineMeta}>
            {detail.eventNotes.map(note => <span key={note.label}>{note.label}: {note.value}</span>)}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>仮説履歴</h2>
          <span className={styles.sectionMeta}>{detail.hypotheses.length}件</span>
        </div>
        {detail.hypotheses.length === 0 ? (
          <EmptyText />
        ) : (
          <div className={styles.historyList}>
            {detail.hypotheses.map((hypothesis, index) => (
              <div key={`${hypothesis.detectedAt}-${index}`} className={styles.historyRow}>
                <div className={styles.rowTop}>
                  <h3 className={styles.rowTitle}>{hypothesis.reason ?? '仮説内容未記録'}</h3>
                  <div className={styles.rowMeta}>
                    {hypothesis.detectedAt ?? '検出日未記録'} ・ {hypothesis.horizon ?? '期間未記録'}
                  </div>
                </div>
                <div className={styles.inlineMeta}>
                  <span>状態: {hypothesis.label ?? (hypothesis.status === 'open' ? '検証中' : hypothesis.status ?? '未記録')}</span>
                  <span>想定方向: {directionLabel(hypothesis.expectedDirection)}</span>
                  <span>確認予定: {hypothesis.reviewDueAt ?? '未記録'}</span>
                  <span>確信度: {hypothesis.confidence == null ? '未記録' : `${Math.round(hypothesis.confidence * 100)}%`}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>反証条件・上がらない理由</h2>
        </div>
        {detail.riskNotes.length === 0 ? <EmptyText /> : (
          <div className={styles.historyList}>
            {detail.riskNotes.map(note => (
              <div key={note.label} className={styles.historyRow}>
                <h3 className={styles.rowTitle}>{note.label}</h3>
                <div className={styles.rowBody}><ListBlock items={note.items} /></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>世界ニュースからの影響仮説</h2>
          <span className={styles.sectionMeta}>直近最大5件</span>
        </div>
        {detail.worldImpactReviews.length === 0 ? (
          <EmptyText />
        ) : (
          <div className={styles.reviewList}>
            {detail.worldImpactReviews.slice(0, 5).map(review => {
              const reviewStatus = WORLD_REVIEW_STATUS_LABELS[review.reviewStatus ?? 'pending'] ?? WORLD_REVIEW_STATUS_LABELS.pending
              return (
                <article key={review.reviewKey} className={styles.reviewRow}>
                  <div className={styles.rowTop}>
                    <div>
                      <h3 className={styles.rowTitle}>{review.topic}</h3>
                      <div className={styles.inlineMeta}>
                        <StatusText status={reviewStatus.status} label={reviewStatus.label} />
                        <span>データ: {dataLabel(review.dataAvailability)}</span>
                        <span>イベント日: {review.eventDate}</span>
                        <span>情報源品質: {review.sourceQuality}</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.mechanisms}>
                    {(review.mechanisms ?? []).map(mechanism => (
                      <span key={mechanism}>{WORLD_MECHANISM_LABELS[mechanism] ?? mechanism}</span>
                    ))}
                    <span>{directionLabel(review.direction)}</span>
                    <span>確信度 {review.confidence ?? '未設定'}</span>
                    <span>想定ラグ {review.expectedLagDays ?? '-'}日</span>
                  </div>

                  <div className={styles.detailGrid}>
                    <div className={styles.detailBlock}>
                      <div className={styles.detailLabel}>影響仮説</div>
                      <div className={styles.detailText}>{review.thesis || review.expectedMechanism || '未記録'}</div>
                    </div>
                    {review.impactPath && (
                      <div className={styles.detailBlock}>
                        <div className={styles.detailLabel}>影響経路</div>
                        <div className={styles.detailText}>
                          ニュース → {(review.impactPath.mechanisms ?? []).map(m => WORLD_MECHANISM_LABELS[m] ?? m).join('・') || '分類未確定'} → {(review.impactPath.themes ?? []).slice(0, 5).join('・') || 'テーマ未整理'} → 当銘柄
                        </div>
                      </div>
                    )}
                    <div className={styles.detailBlock}>
                      <div className={styles.detailLabel}>二次影響 / 時間差</div>
                      <div className={styles.detailText}>{review.secondOrderEffect || '未記録'} / {review.timeLag || '未記録'}</div>
                    </div>
                    <div className={styles.detailBlock}>
                      <div className={styles.detailLabel}>反証条件</div>
                      <div className={styles.detailText}>{review.falsification || review.counterArgument || '未設定'}</div>
                    </div>
                    {(review.watchSignals ?? []).length > 0 && (
                      <div className={styles.detailBlock}>
                        <div className={styles.detailLabel}>次に見るシグナル</div>
                        <ListBlock items={review.watchSignals ?? []} />
                      </div>
                    )}
                    {(review.riskFactors ?? []).length > 0 && (
                      <div className={styles.detailBlock}>
                        <div className={styles.detailLabel}>外れる要因</div>
                        <ListBlock items={review.riskFactors ?? []} />
                      </div>
                    )}
                  </div>

                  <div className={styles.reviewMetrics}>
                    {review.outcomes.map(outcome => {
                      const meta = worldOutcomeLabel(outcome)
                      return (
                        <div key={outcome.horizon} className={styles.reviewMetric}>
                          <div className={styles.reviewMetricLabel}>{outcome.horizon}</div>
                          <div className={styles.reviewMetricValue}>
                            <StatusText status={meta.status} label={meta.label} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {review.outcomes.filter(outcome => outcome.evaluatedAt != null).map(outcome => {
                    const confidence = review.confidence ?? null
                    const judged = outcome.result === 'hit' || outcome.result === 'miss' || outcome.result === 'inverse'
                    const confNote = !judged || confidence == null
                      ? null
                      : confidence >= 0.5 && outcome.result !== 'hit'
                        ? '確信度が高すぎた可能性があります。'
                        : confidence <= 0.4 && outcome.result === 'hit'
                          ? '確信度が低すぎた可能性があります。'
                          : null
                    return (
                      <div key={`eval-${outcome.horizon}`} className={styles.evaluation}>
                        <strong>{outcome.horizon} 検証詳細:</strong>{' '}
                        収益率 {outcome.priceReturnPct?.toFixed(2) ?? outcome.returnPct?.toFixed(2) ?? '-'}%
                        {' / '}ベンチマーク {outcome.benchmarkReturnPct?.toFixed(2) ?? '-'}%
                        {' / '}相対 {outcome.relativeReturnPct?.toFixed(2) ?? '-'}%
                        {' / '}方向 {outcome.directionMatched == null ? '判定不能' : outcome.directionMatched ? '一致' : '不一致'}
                        {' / '}ラグ {outcome.lagMatched == null ? '判定不能' : outcome.lagMatched ? '一致' : '不一致'}
                        {outcome.autoMissReason ? ` / 自動推定: ${outcome.autoMissReason}` : ''}
                        {outcome.manualMissReason ? ` / 手動分類: ${outcome.manualMissReason}` : ''}
                        {outcome.evaluationNotes ? <><br />{outcome.evaluationNotes}</> : null}
                        {confNote ? <><br /><span className={styles.warningText}>{confNote}</span></> : null}
                      </div>
                    )
                  })}

                  <div className={styles.rowBody}>
                    <ListBlock items={[
                      ...(review.missedSignals ?? []),
                      ...review.outcomes.filter(outcome => outcome.missReason).map(outcome => `外れ理由（${outcome.horizon}）: ${outcome.missReason}`),
                      ...(review.lesson ? [`学習メモ: ${review.lesson}`] : []),
                    ]} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>答え合わせ</h2>
          <span className={styles.sectionMeta}>{detail.outcomes.length}件</span>
        </div>
        {detail.outcomes.length === 0 ? (
          <EmptyText>未評価</EmptyText>
        ) : (
          <div className={styles.outcomeList}>
            {detail.outcomes.map((outcome, index) => (
              <div key={`${outcome.horizon}-${outcome.evaluatedAt}-${index}`} className={styles.outcomeRow}>
                <div className={styles.rowTop}>
                  <h3 className={styles.rowTitle}>{outcome.horizon} ・ {outcome.resultLabel}</h3>
                  <div className={styles.rowMeta}>期限 {outcome.dueAt ?? '未記録'} ・ 評価 {outcome.evaluatedAt ?? '未記録'}</div>
                </div>
                <div className={styles.reviewMetrics}>
                  <div className={styles.reviewMetric}>
                    <div className={styles.reviewMetricLabel}>想定方向</div>
                    <div className={styles.reviewMetricValue}>{directionLabel(outcome.expectedDirection)}</div>
                  </div>
                  <div className={styles.reviewMetric}>
                    <div className={styles.reviewMetricLabel}>実際の方向</div>
                    <div className={styles.reviewMetricValue}>{directionLabel(outcome.actualDirection)}</div>
                  </div>
                  <div className={styles.reviewMetric}>
                    <div className={styles.reviewMetricLabel}>収益率</div>
                    <div className={styles.reviewMetricValue}>{pct(outcome.returnPct)}</div>
                  </div>
                  <div className={styles.reviewMetric}>
                    <div className={styles.reviewMetricLabel}>TOPIX比較</div>
                    <div className={styles.reviewMetricValue}>{pct(outcome.relativeToTopixPct)}</div>
                  </div>
                  <div className={styles.reviewMetric}>
                    <div className={styles.reviewMetricLabel}>データ状態</div>
                    <div className={styles.reviewMetricValue}>{dataLabel(outcome.dataAvailability)}</div>
                  </div>
                </div>
                {(outcome.notes.length > 0 || outcome.missedSignals.length > 0) && (
                  <div className={styles.rowBody}>
                    <ListBlock items={[...outcome.notes, ...outcome.missedSignals]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>外れ理由・学習メモ</h2>
        </div>
        <div className={styles.detailGrid}>
          <div className={styles.detailBlock}>
            <div className={styles.detailLabel}>見逃したシグナル / 補足</div>
            <ListBlock items={[...detail.reflection.missedSignals, ...detail.reflection.notes]} />
          </div>
          <div className={styles.detailBlock}>
            <div className={styles.detailLabel}>改善案 / 次へ残す知識</div>
            <ListBlock items={[...detail.reflection.improvedRuleIdeas, ...detail.reflection.memoryNotes]} />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>次の確認ポイント</h2>
        </div>
        {latestHypothesis?.reviewDueAt && (
          <div className={styles.nextDue}>
            次回確認: {latestHypothesis.reviewDueAt}{detail.priceDataPending ? ' ・ 価格データ提供後に再確認' : ''}
          </div>
        )}
        <ListBlock items={detail.nextChecks} />
      </section>

      <div className={styles.footer}>
        <Disclaimer />
      </div>
    </main>
  )
}
