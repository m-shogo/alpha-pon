import { loadGeneratedData } from '@/lib/generated-data'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { CandidateCard } from '@/components/CandidateCard'
import { ProCommandCard } from '@/components/ProCommandCard'
import { SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import Link from 'next/link'
import { dateOnly, daysBetweenJst, todayJstDate } from '@/lib/format'

export const metadata = {
  title: 'alpha-pon — ホーム',
}

export default function HomePage() {
  const data = loadGeneratedData()
  const generatedDate = dateOnly(data.generatedAt)
  const generatedAgeDays = generatedDate ? daysBetweenJst(generatedDate, todayJstDate()) : null
  const hasMockUniverse = (data.universeCandidates ?? []).some((c) => c.dataSource === 'mock')
  const failedSteps = data.pipelineStatus?.completeWrapperFailedSteps ?? []
  const pipelineFailed = failedSteps.length > 0 || data.pipelineStatus?.status === 'failed'
  const mockUniverseCount = (data.universeCandidates ?? []).filter((c) => c.dataSource === 'mock').length
  const qualityValues = Object.values(data.dataQualityByCode ?? {})
  const missingQualityCount = qualityValues.filter((q) => q.dataQuality === 'missing' || q.dataQuality === 'unknown').length
  const warningCount = qualityValues.reduce((sum, q) => sum + q.warnings.length, 0)
  const outcomeCount = data.hypothesisOutcomes?.length ?? 0
  const cursorEntries = Object.entries(data.runCursors ?? {})
  const activeCursors = cursorEntries.filter(([, cursor]) => {
    const offset = cursor.offset ?? 0
    const total = cursor.total ?? 0
    return total > 0 && offset < total
  })
  const hypothesisReadiness = data.readiness?.items.find((item) => item.id === 'hypothesis-outcomes')
  const waitReasons = [
    outcomeCount < 10 ? `outcome蓄積待ち: ${outcomeCount}/10件。1w/1m/3m の実績が増えるまで強い判定は保留。` : null,
    activeCursors.length > 0 ? `J-Quants cursor進行中: ${activeCursors.map(([name, cursor]) => `${cursor.jobName ?? name} ${cursor.offset ?? 0}/${cursor.total ?? '?'}`).join(' / ')}。無理な連打より次回範囲を進める。` : null,
    hypothesisReadiness && hypothesisReadiness.status !== 'done' ? `次回レビュー待ち: ${hypothesisReadiness.nextActions[0] ?? 'review:hypotheses の継続実行待ち'}` : null,
  ].filter((reason): reason is string => Boolean(reason))
  const dataWarnings = [
    ...((data.meta?.warnings ?? []).map((w) => `生成データ: ${w}`)),
    ...(pipelineFailed ? [`pipeline に失敗/スキップがあります: ${failedSteps.join(', ') || data.pipelineStatus?.status}`] : []),
    ...(generatedAgeDays != null && generatedAgeDays > 0 ? [`生成日が${generatedAgeDays}日前です。pnpm ui:data で最新化してください。`] : []),
    ...(hasMockUniverse ? ['未登録銘柄スクリーニングにモックデータが含まれています。実データ確認前の仮説として扱ってください。'] : []),
    ...(missingQualityCount > 0 ? [`データ品質 missing/unknown が ${missingQualityCount} 件あります。強い判断を避けてください。`] : []),
  ]

  const list = data.candidates
    .map((c) => ({ c, total: calcTotal(c.score) }))
    .filter((x) => x.total >= 50)
    .sort((a, b) => b.total - a.total)

  const counts = { urgent: 0, daily: 0, log: 0 }
  list.forEach(({ total }) => {
    const lv = calcLevel(total)
    if (lv === 'urgent' || lv === 'daily' || lv === 'log') counts[lv]++
  })

  return (
    <>
      {/* sticky header */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 8,
          padding: '52px 20px 12px',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.3, marginBottom: 2 }}>
              Pro会議・改善ロードマップ連携
            </div>
            <h1
              style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--accent)', letterSpacing: 0.2 }}
            >
              alpha-pon
            </h1>
          </div>
          <div
            style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}
          >
            <Icon name="spark" size={20} />
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* pipeline warnings */}
        {dataWarnings.length > 0 && (
          <div style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--amber-soft)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>⚠ データ確認メモ</div>
            {dataWarnings.map((w, i) => (
              <div key={i} style={{ marginTop: 2 }}>• {w}</div>
            ))}
          </div>
        )}
        {/* data meta row */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: 12,
            background: 'var(--surface)', borderRadius: 12,
            border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>最終生成: </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>
              {data.generatedAt ?? '未生成'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>銘柄数: </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{data.candidates.length}</span>
            </div>
          </div>
        </div>

        {waitReasons.length > 0 && (
          <div style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--sky-soft)', borderRadius: 10, fontSize: 12, fontWeight: 650, color: 'var(--ink-2)' }}>
            <div style={{ fontWeight: 850, color: 'var(--sky-deep)', marginBottom: 4 }}>今は待ちの理由</div>
            {waitReasons.map((reason, i) => (
              <div key={i} style={{ marginTop: 2 }}>• {reason}</div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 9, marginBottom: 12 }}>
          {[
            {
              label: 'Pipeline',
              value: pipelineFailed ? '要確認' : (data.pipelineStatus?.status ?? '不明'),
              sub: failedSteps.length > 0 ? failedSteps.slice(0, 2).join(' / ') : (data.pipelineStatus?.endedAt ?? 'status未生成'),
              color: pipelineFailed ? 'var(--urgent)' : 'var(--mint-deep)',
              bg: pipelineFailed ? 'var(--urgent-soft)' : 'var(--mint-soft)',
            },
            {
              label: 'Mock / Missing',
              value: `${mockUniverseCount} / ${missingQualityCount}`,
              sub: `warnings ${warningCount}件`,
              color: mockUniverseCount > 0 || missingQualityCount > 0 ? 'var(--amber)' : 'var(--mint-deep)',
              bg: mockUniverseCount > 0 || missingQualityCount > 0 ? 'var(--amber-soft)' : 'var(--mint-soft)',
            },
          ].map((item) => (
            <div key={item.label} style={{
              background: 'var(--surface)', borderRadius: 14, padding: '10px 12px',
              border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: item.color }} />
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)' }}>{item.label}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</div>
              <div style={{ marginTop: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.sub}
              </div>
            </div>
          ))}
        </div>

        {/* alert counts */}
        <div style={{ display: 'flex', gap: 9 }}>
          {(['urgent', 'daily', 'log'] as const).map((lv) => {
            const a = ALERT_META[lv]
            return (
              <div
                key={lv}
                style={{
                  flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '12px 10px',
                  border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: a.colorVar }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>{a.jp}</span>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, color: a.colorVar, marginTop: 2 }}>
                  {counts[lv]}<span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}> 件</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* quick links */}
        <div style={{ display: 'flex', gap: 9, marginTop: 9 }}>
          <Link
            href="/stocks"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 9,
              padding: '12px 13px', borderRadius: 16,
              border: '1px solid var(--card-line)', background: 'var(--surface)',
              boxShadow: 'var(--shadow)', textDecoration: 'none',
            }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--mint-soft)', color: 'var(--mint-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="watch" size={17} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>銘柄一覧</span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--mint-deep)' }}>
                {data.candidates.length} 銘柄 / スコア順
              </span>
            </span>
          </Link>
          <Link
            href="/reports"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 9,
              padding: '12px 13px', borderRadius: 16,
              border: '1px solid var(--card-line)', background: 'var(--surface)',
              boxShadow: 'var(--shadow)', textDecoration: 'none',
            }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--sky-soft)', color: 'var(--sky-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="doc" size={17} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Pro レポート</span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sky-deep)' }}>
                {data.reports.filter((r) => r.available).length} 件 生成済み
              </span>
            </span>
          </Link>
        </div>

        {/* 特殊状況・チャンス候補 */}
        {(data.specialSituationWatch?.topChanceList ?? []).length > 0 && (
          <section style={{ marginBottom: 12 }}>
            <SectionLabel icon={<Icon name="spark" size={15} />}>
              特殊状況・調査優先候補
            </SectionLabel>
            <div
              style={{
                padding: '8px 12px 6px',
                background: 'var(--amber-soft)',
                borderRadius: 10,
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--amber)',
                marginBottom: 8,
              }}
            >
              ※買い推奨ではありません。調査候補です。証拠確認が必要です。
            </div>
            {(data.specialSituationWatch?.topChanceList ?? []).slice(0, 5).map((item) => {
              const chanceBg =
                item.chanceLevel === 'high'
                  ? 'var(--rose-soft, #fff0f0)'
                  : item.chanceLevel === 'attention'
                    ? 'var(--amber-soft)'
                    : 'var(--surface-2)'
              const chanceFg =
                item.chanceLevel === 'high'
                  ? 'var(--rose, #e53e3e)'
                  : item.chanceLevel === 'attention'
                    ? 'var(--amber)'
                    : 'var(--ink-3)'
              const conf = item.listingInfo?.confidence
              return (
                <div
                  key={item.code}
                  style={{
                    padding: '12px 14px',
                    marginBottom: 8,
                    background: 'var(--surface)',
                    border: '1px solid var(--card-line)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  {/* header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: 6,
                        background: chanceBg,
                        color: chanceFg,
                      }}
                    >
                      {item.finalLabel}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
                      {item.code} {item.name}
                    </span>
                    {item.chanceLevel !== 'none' && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: chanceFg,
                          background: chanceBg,
                          padding: '1px 6px',
                          borderRadius: 5,
                        }}
                      >
                        {item.chanceLevel}
                      </span>
                    )}
                  </div>
                  {/* 理由 */}
                  <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '0 0 6px', lineHeight: 1.55 }}>
                    {item.reasonSummary}
                  </p>
                  {/* なぜ今見るのか */}
                  {(item.whyNow ?? []).length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>なぜ今見る: </span>
                      {(item.whyNow ?? []).slice(0, 2).join(' / ')}
                    </div>
                  )}
                  {/* なぜまだ待つのか */}
                  {(item.whyNotNow ?? []).length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--amber)' }}>まだ待つ理由: </span>
                      {(item.whyNotNow ?? []).slice(0, 2).join(' / ')}
                    </div>
                  )}
                  {/* テーマ適合要約 */}
                  {item.themeCompanyFitSummary && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>テーマ適合: </span>
                      {item.themeCompanyFitSummary.themeLabel} / {item.themeCompanyFitSummary.selectedCompanyFit}
                      {(item.themeCompanyFitSummary.betterCompanyCodes ?? []).length > 0 && (
                        <span style={{ marginLeft: 6 }}>
                          比較候補: {item.themeCompanyFitSummary.betterCompanyCodes.slice(0, 2).join(' / ')}
                        </span>
                      )}
                    </div>
                  )}
                  {/* 売り圧要約 */}
                  {item.sellerPressureSummary && item.sellerPressureSummary.remainingOverhang !== 'low' && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700 }}>売り圧: </span>
                      {[
                        item.sellerPressureSummary.sellerName ?? item.sellerPressureSummary.sellerType,
                        item.sellerPressureSummary.remainingOverhang,
                      ].filter(Boolean).join(' / ')}
                    </div>
                  )}
                  {/* リスク */}
                  {item.mainRisks.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700 }}>⚠ 注意: </span>
                      {item.mainRisks.slice(0, 3).join(' / ')}
                    </div>
                  )}
                  {/* 次に確認 */}
                  {item.nextCheck.length > 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700 }}>次に確認: </span>
                      {item.nextCheck.slice(0, 4).join(' / ')}
                    </div>
                  )}
                  {/* 日程情報 */}
                  {item.listingInfo && (
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {item.listingInfo.listedAt && (
                        <span>上場日: {item.listingInfo.listedAt}</span>
                      )}
                      {item.listingInfo.plannedListingAt && (
                        <span>上場予定: {item.listingInfo.plannedListingAt}</span>
                      )}
                      {item.listingInfo.lockupExpiryAt && (
                        <span>ロックアップ解除: {item.listingInfo.lockupExpiryAt}</span>
                      )}
                      {item.listingInfo.firstEarningsAt && (
                        <span>初回決算: {item.listingInfo.firstEarningsAt}</span>
                      )}
                      {conf && conf !== 'official' && (
                        <span style={{ color: 'var(--amber)', fontWeight: 700 }}>
                          [{conf}]
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}

        {/* Pro dashboard card */}
        <ProCommandCard data={data} />

        {/* candidate list */}
        <SectionLabel icon={<Icon name="spark" size={15} />}>注目候補（スコア順）</SectionLabel>

        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>データがありません</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              ルートで{' '}
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                pnpm ui:data
              </code>{' '}
              を実行してください
            </p>
          </div>
        ) : (
          list.map(({ c }) => <CandidateCard key={c.code} cand={c} />)
        )}

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, margin: '14px 0 4px', lineHeight: 1.6 }}>
          スコア49点以下は表示されません。<br />
          重要判断はPro会議・IRイベント・決算/総会確認を優先します。
        </p>

        {/* 免責表示 */}
        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
