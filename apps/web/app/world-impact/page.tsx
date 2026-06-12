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
