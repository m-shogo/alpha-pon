// /world-impact — World Impact Intelligence
// 世界ニュース → 影響メカニズム → 銘柄 → 検証可能仮説 → レビュー → 学習メモ の一覧。
// 買い推奨ではなく、影響仮説の検証と学習のための画面。

import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import type { WorldImpactReview } from '@/lib/types'

export const metadata = { title: '世界ニュース影響仮説 | alpha-pon' }

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

function CountRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 800 }}>{value}</span>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-2)', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>
      {children}
    </span>
  )
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
  if (confidence < 0.34) return '低 (<0.34)'
  if (confidence < 0.67) return '中 (0.34-0.66)'
  return '高 (>=0.67)'
}

// グループ別の検証成績（整合/差分/逆行のみを評価済みとして数える）
function performanceBy(items: OutcomeWithReview[], key: (item: OutcomeWithReview) => string[]): Array<[string, { evaluated: number; hit: number; miss: number; inverse: number }]> {
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

function OutcomeCaseRow({ item, note }: { item: OutcomeWithReview; note?: string }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4 }}>
        {item.review.affectedCompanyCodes.join(', ')} {item.outcome.horizon}: {item.review.topic.slice(0, 50)}
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        result {OUTCOME_LABELS[item.outcome.result ?? 'unevaluated'] ?? item.outcome.result}
        {' / '}return {item.outcome.priceReturnPct?.toFixed(2) ?? item.outcome.returnPct?.toFixed(2) ?? '-'}%
        {' / '}相対 {item.outcome.relativeReturnPct?.toFixed(2) ?? '-'}%
        {' / '}confidence {item.review.confidence ?? '未設定'}
        {item.outcome.autoMissReason ? ` / auto: ${item.outcome.autoMissReason}` : ''}
        {item.outcome.manualMissReason ? ` / manual: ${MISS_REASON_LABELS[item.outcome.manualMissReason] ?? item.outcome.manualMissReason}` : ''}
        {note ? ` / ${note}` : ''}
      </div>
    </div>
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
    outcome => [outcome.missReason as string]
  )
  const pendingReviews = reviews.filter(review => (review.reviewStatus ?? 'pending') === 'pending')
  const sortedReviews = [...reviews].sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))

  // v3 評価セクション用データ（全て null 安全）
  const allOutcomes: OutcomeWithReview[] = reviews.flatMap(review =>
    (review.outcomes ?? []).map(outcome => ({ review, outcome }))
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
    outcome.dueAt && outcome.dueAt < today &&
    (outcome.result == null || outcome.result === 'unknown' || outcome.result === 'too_early'))
  const confPerformance = performanceBy(allOutcomes, ({ review }) => [confidenceBandLabel(review.confidence)])
  const mechPerformance = performanceBy(allOutcomes, ({ review }) => review.mechanisms ?? ['unknown'])
  const directionPerformance = performanceBy(allOutcomes, ({ review }) => [review.direction ?? 'unclear'])
  const dataQualityIssues = (audit?.priorityIssues ?? []).slice(0, 6)

  return (
    <div style={{ padding: '20px 16px 80px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)', margin: '0 0 4px' }}>世界ニュース影響仮説</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 650, color: 'var(--ink-3)' }}>
        ニュース → 影響メカニズム → 銘柄 → 検証可能仮説 → 検証結果。売買の推奨は行いません。
      </p>

      {reviews.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
            影響仮説レビューが未生成です。<code>pnpm review:world-impact</code> → <code>pnpm ui:data</code> を実行してください。
          </p>
        </Card>
      ) : (
        <>
          <SectionLabel icon={<Icon name="arc" size={15} color="currentColor" />}>サマリー</SectionLabel>
          <Card>
            <CountRow label="影響仮説レビュー総数" value={`${reviews.length}件`} />
            {statusCounts.map(([status, count]) => (
              <CountRow key={status} label={REVIEW_STATUS_LABELS[status] ?? status} value={`${count}件`} />
            ))}
            {audit && (
              <>
                <CountRow label="期限超過の未評価 outcome" value={`${audit.overdueReviews}件`} />
                <CountRow label="価格データ提供待ち outcome" value={`${audit.priceDataPending}件`} />
              </>
            )}
          </Card>

          <SectionLabel icon={<Icon name="filter" size={15} color="currentColor" />}>影響メカニズム別</SectionLabel>
          <Card>
            {mechanismCounts.map(([mechanism, count]) => (
              <CountRow key={mechanism} label={MECHANISM_LABELS[mechanism] ?? mechanism} value={`${count}件`} />
            ))}
          </Card>

          <SectionLabel icon={<Icon name="check" size={15} color="currentColor" />}>検証結果（outcome 別）</SectionLabel>
          <Card>
            {outcomeCounts.map(([result, count]) => (
              <CountRow key={result} label={OUTCOME_LABELS[result] ?? result} value={`${count}件`} />
            ))}
          </Card>

          <SectionLabel icon={<Icon name="doc" size={15} color="currentColor" />}>外れ理由ランキング</SectionLabel>
          <Card>
            {missReasonCounts.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>
                まだ外れ理由の記録なし。検証済み仮説が増えると蓄積されます。
              </p>
            ) : missReasonCounts.map(([reason, count]) => (
              <CountRow key={reason} label={MISS_REASON_LABELS[reason] ?? reason} value={`${count}件`} />
            ))}
          </Card>

          <SectionLabel icon={<Icon name="check" size={15} color="currentColor" />}>検証成績（評価済みのみ・参考値）</SectionLabel>
          <Card>
            {confPerformance.length === 0 && mechPerformance.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>
                評価済み outcome がまだありません。レビュー期限到来後に <code>pnpm evaluate:world-impact</code> を実行すると蓄積されます。
              </p>
            ) : (
              <>
                {confPerformance.map(([band, perf]) => (
                  <CountRow key={`conf-${band}`} label={`confidence ${band}`} value={`整合${perf.hit} / 差分${perf.miss} / 逆行${perf.inverse}（${perf.evaluated}件）`} />
                ))}
                {mechPerformance.slice(0, 6).map(([mechanism, perf]) => (
                  <CountRow key={`mech-${mechanism}`} label={`mechanism ${MECHANISM_LABELS[mechanism] ?? mechanism}`} value={`整合${perf.hit} / 差分${perf.miss} / 逆行${perf.inverse}`} />
                ))}
                {directionPerformance.map(([direction, perf]) => (
                  <CountRow key={`dir-${direction}`} label={`direction ${direction}`} value={`整合${perf.hit} / 差分${perf.miss} / 逆行${perf.inverse}`} />
                ))}
              </>
            )}
          </Card>

          {overdueUnevaluated.length > 0 && (
            <>
              <SectionLabel icon={<Icon name="bell" size={15} color="currentColor" />}>期限切れ・未評価 outcome</SectionLabel>
              <Card pad={0}>
                <div style={{ padding: '4px 14px' }}>
                  {overdueUnevaluated.slice(0, 10).map(item => (
                    <OutcomeCaseRow key={`${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note={`期限 ${item.outcome.dueAt}`} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {highConfMisses.length > 0 && (
            <>
              <SectionLabel icon={<Icon name="bell" size={15} color="currentColor" />}>confidence 過大の候補（高 confidence で差分/逆行）</SectionLabel>
              <Card pad={0}>
                <div style={{ padding: '4px 14px' }}>
                  {highConfMisses.slice(0, 8).map(item => (
                    <OutcomeCaseRow key={`hcm-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {lowConfHits.length > 0 && (
            <>
              <SectionLabel icon={<Icon name="spark" size={15} color="currentColor" />}>confidence 過小の候補（低 confidence で整合）</SectionLabel>
              <Card pad={0}>
                <div style={{ padding: '4px 14px' }}>
                  {lowConfHits.slice(0, 8).map(item => (
                    <OutcomeCaseRow key={`lch-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {inverseCases.length > 0 && (
            <>
              <SectionLabel icon={<Icon name="filter" size={15} color="currentColor" />}>想定と逆行した観察（inverse）</SectionLabel>
              <Card pad={0}>
                <div style={{ padding: '4px 14px' }}>
                  {inverseCases.slice(0, 8).map(item => (
                    <OutcomeCaseRow key={`inv-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {evaluatedOutcomes.length > 0 && (
            <>
              <SectionLabel icon={<Icon name="doc" size={15} color="currentColor" />}>最近の評価済み outcome</SectionLabel>
              <Card pad={0}>
                <div style={{ padding: '4px 14px' }}>
                  {evaluatedOutcomes.slice(0, 10).map(item => (
                    <OutcomeCaseRow key={`ev-${item.review.reviewKey}-${item.outcome.horizon}`} item={item} note={`評価日 ${item.outcome.evaluatedAt}`} />
                  ))}
                </div>
              </Card>
            </>
          )}

          {dataQualityIssues.length > 0 && (
            <>
              <SectionLabel icon={<Icon name="bell" size={15} color="currentColor" />}>データ品質の確認対象</SectionLabel>
              <Card>
                {dataQualityIssues.map((issue, index) => (
                  <p key={index} style={{ margin: '4px 0', fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    [{issue.severity}] {issue.title ?? ''} — {issue.detail ?? ''}
                  </p>
                ))}
              </Card>
            </>
          )}

          <SectionLabel icon={<Icon name="bell" size={15} color="currentColor" />}>未検証レビュー（pending）</SectionLabel>
          <Card pad={0}>
            {pendingReviews.length === 0 ? (
              <p style={{ margin: 0, padding: 14, fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>未検証なし</p>
            ) : pendingReviews.slice(0, 10).map((review, index) => (
              <div key={review.reviewKey} style={{ padding: 12, borderBottom: index < Math.min(pendingReviews.length, 10) - 1 ? '1px solid var(--line)' : 'none', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{review.topic}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-3)' }}>
                    {review.affectedCompanyCodes.join(', ')} / 期限 {review.reviewDueAt ?? '未設定'}
                  </div>
                </div>
                <Chip>{REVIEW_STATUS_LABELS[review.reviewStatus ?? 'pending']}</Chip>
              </div>
            ))}
          </Card>

          <SectionLabel icon={<Icon name="spark" size={15} color="currentColor" />}>最新イベント・影響仮説</SectionLabel>
          <div style={{ display: 'grid', gap: 10 }}>
            {sortedReviews.slice(0, 12).map(review => (
              <Card key={review.reviewKey} pad={14}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <Chip>{REVIEW_STATUS_LABELS[review.reviewStatus ?? 'pending']}</Chip>
                  {(review.mechanisms ?? []).slice(0, 4).map(mechanism => (
                    <Chip key={mechanism}>{MECHANISM_LABELS[mechanism] ?? mechanism}</Chip>
                  ))}
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{review.eventDate}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 850, color: 'var(--ink)', lineHeight: 1.45, marginBottom: 6 }}>{review.topic}</div>
                {review.impactPath && (
                  <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 6 }}>
                    経路: ニュース → {(review.impactPath.mechanisms ?? []).map(m => MECHANISM_LABELS[m] ?? m).join('・') || '分類未確定'} → {(review.impactPath.themes ?? []).slice(0, 4).join('・') || 'テーマ未整理'} → {review.affectedCompanyCodes.join(', ')}
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.55, marginBottom: 6 }}>
                  仮説: {review.thesis || review.expectedMechanism || '未記録'}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 8 }}>
                  反証条件: {review.falsification || review.counterArgument || '未設定'} / confidence {review.confidence ?? '未設定'} / 想定ラグ {review.expectedLagDays ?? '-'}日
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {review.outcomes.map(outcome => (
                    <Chip key={outcome.horizon}>{outcome.horizon}: {OUTCOME_LABELS[outcome.result ?? 'unevaluated'] ?? outcome.result}</Chip>
                  ))}
                </div>
                {review.lesson && (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 650, color: 'var(--ink-2)' }}>学習メモ: {review.lesson}</div>
                )}
                <div style={{ marginTop: 8 }}>
                  {review.affectedCompanyCodes.map(code => (
                    <Link key={code} href={`/stocks/${code}`} style={{ fontSize: 12, fontWeight: 800, color: 'var(--mint-deep)', marginRight: 10 }}>
                      {code} の考察履歴 →
                    </Link>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Disclaimer />
    </div>
  )
}
