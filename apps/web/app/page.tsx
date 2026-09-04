import { loadGeneratedData } from '@/lib/generated-data'
import { loadMarketEventData } from '@/lib/market-events'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { CandidateCard } from '@/components/CandidateCard'
import { ProCommandCard } from '@/components/ProCommandCard'
import { MarketEventHomeCard } from '@/components/MarketEventHomeCard'
import { Disclaimer } from '@/components/Disclaimer'
import Link from 'next/link'
import { dateOnly, daysBetweenJst, todayJstDate } from '@/lib/format'
import { summarizeGeneratedPipelineFailure } from '@/lib/generated-pipeline-health'
import styles from './home.module.css'

export const metadata = {
  title: 'alpha-pon — ホーム',
}

type WorldThemeCandidateHypothesis = {
  sourceEventTitle: string
  sourceEventPublishedAt: string | null
  theme: string
  candidateCode: string
  candidateCompany: string
  whyThisCompany: string
  upsideHypothesis: string
  downsideRisk: string
  nextPrimaryCheck: string
  reviewAfterDays: [30, 90, 180]
  disclaimer: string
}

function tagClass(tone: 'neutral' | 'warn' | 'good') {
  if (tone === 'warn') return `${styles.tag} ${styles.tagWarn}`
  if (tone === 'good') return `${styles.tag} ${styles.tagGood}`
  return styles.tag
}

function chanceLabel(value: string) {
  if (value === 'high') return '優先確認'
  if (value === 'attention') return '要確認'
  if (value === 'none') return '監視'
  return value
}

export default function HomePage() {
  const data = loadGeneratedData()
  const marketEvents = loadMarketEventData()
  const generatedDate = dateOnly(data.generatedAt)
  const generatedAgeDays = generatedDate ? daysBetweenJst(generatedDate, todayJstDate()) : null
  const hasValidGeneratedDate = data.generatedAt === generatedDate && generatedAgeDays != null && generatedAgeDays >= 0
  const hasMockUniverse = (data.universeCandidates ?? []).some((c) => c.dataSource === 'mock')
  const pipelineFailure = summarizeGeneratedPipelineFailure(data.pipelineStatus)
  const failedSteps = pipelineFailure.failedSteps
  const pipelineFailed = pipelineFailure.failed
  const mockUniverseCount = (data.universeCandidates ?? []).filter((c) => c.dataSource === 'mock').length
  const qualityValues = Object.values(data.dataQualityByCode ?? {})
  const missingQualityCount = qualityValues.filter((q) => q.dataQuality === 'missing' || q.dataQuality === 'unknown').length
  const warningCount = qualityValues.reduce((sum, q) => sum + q.warnings.length, 0)
  const outcomeCount = data.hypothesisOutcomes?.length ?? 0
  const worldThemeCandidateHypotheses = ((data as unknown as { worldThemeCandidateHypotheses?: WorldThemeCandidateHypothesis[] }).worldThemeCandidateHypotheses ?? []).slice(0, 4)
  const cursorEntries = Object.entries(data.runCursors ?? {})
  const activeCursors = cursorEntries.filter(([, cursor]) => {
    const offset = cursor.offset ?? 0
    const total = cursor.total ?? 0
    return total > 0 && offset < total
  })
  const hypothesisReadiness = data.readiness?.items.find((item) => item.id === 'hypothesis-outcomes')
  const waitReasons = [
    outcomeCount < 10 ? `答え合わせの蓄積待ち: ${outcomeCount}/10件。1週・1か月・3か月後の実績が増えるまで強い判定は保留します。` : null,
    activeCursors.length > 0 ? `価格データの取得途中: ${activeCursors.map(([name, cursor]) => `${cursor.jobName ?? name} ${cursor.offset ?? 0}/${cursor.total ?? '?'}`).join(' / ')}。取得範囲を順番に進めています。` : null,
    hypothesisReadiness && hypothesisReadiness.status !== 'done' ? `次回レビュー待ち: ${hypothesisReadiness.nextActions[0] ?? '仮説レビューの継続待ち'}` : null,
  ].filter((reason): reason is string => Boolean(reason))
  const dataWarnings = [
    ...((data.meta?.warnings ?? []).map((w) => `生成データ: ${w}`)),
    ...(pipelineFailed ? [`生成処理に失敗またはスキップがあります: ${failedSteps.join(', ') || data.pipelineStatus?.status}`] : []),
    ...(data.generatedAt && !hasValidGeneratedDate ? ['生成日が不正または未来日です。正本データの再生成が必要です。'] : []),
    ...(generatedAgeDays != null && generatedAgeDays > 0 ? [`表示データは${generatedAgeDays}日前のものです。最新データへの更新が必要です。`] : []),
    ...(hasMockUniverse ? ['未登録銘柄スクリーニングにサンプルデータが含まれています。実データ確認前の仮説として扱ってください。'] : []),
    ...(missingQualityCount > 0 ? [`データ品質が未取得または不明な項目が ${missingQualityCount} 件あります。強い判断を避けてください。`] : []),
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

  const priorityCount = counts.urgent + counts.daily
  const statusSentence = priorityCount > 0
    ? `確認優先は ${priorityCount}件。緊急 ${counts.urgent}件、日次確認 ${counts.daily}件です。`
    : waitReasons.length > 0
      ? '急いで判断する候補はありません。いまは条件が揃うのを待ちながら研究を進める局面です。'
      : '緊急の確認対象はありません。候補と研究の更新を落ち着いて確認できます。'

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>ホーム</h1>
          <p className={styles.subtitle}>今日見るべき候補、待つ理由、次の重要イベントを先に確認できます。</p>
        </div>
        <div className={styles.snapshot}>
          表示データ<br />
          {hasValidGeneratedDate ? data.generatedAt : '未生成'}
        </div>
      </header>

      {dataWarnings.length > 0 && (
        <section className={styles.warningBlock} aria-label="データ確認メモ">
          <div className={styles.warningTitle}>⚠ データ確認が必要です</div>
          <div className={styles.warningText}>{dataWarnings[0]}</div>
          {dataWarnings.length > 1 && <div className={styles.warningText}>ほか {dataWarnings.length - 1}件。下の「データ状態」で確認できます。</div>}
        </section>
      )}

      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroLabel}>今日の確認</div>
          <p className={styles.heroSentence}>{statusSentence}</p>
        </div>
        <div className={styles.statusGrid}>
          {(['urgent', 'daily', 'log'] as const).map((lv) => {
            const meta = ALERT_META[lv]
            return (
              <div className={styles.statusItem} key={lv}>
                <div className={styles.statusName}>
                  <span className={styles.statusDot} style={{ background: meta.colorVar }} />
                  {meta.jp}
                </div>
                <div className={styles.statusValue} style={{ color: meta.colorVar }}>
                  {counts[lv]}<span className={styles.statusUnit}>件</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <MarketEventHomeCard data={marketEvents} />

      <section className={styles.priorityGrid}>
        <div className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>いま見ること</h2>
            <span className={styles.sectionMeta}>{waitReasons.length > 0 ? '待ち理由あり' : '通常'}</span>
          </div>
          {waitReasons.length > 0 ? waitReasons.slice(0, 4).map((reason) => (
            <div className={styles.notice} key={reason}><strong>待つ理由</strong><br />{reason}</div>
          )) : (
            <div className={styles.notice}><strong>急ぎの確認なし</strong><br />候補一覧と研究の更新を通常優先度で確認できます。</div>
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>すぐ見る</h2>
          </div>
          <div className={styles.quickLinks}>
            <Link href="/research" className={styles.quickLink}>
              <span><span className={styles.quickLabel}>研究</span><span className={styles.quickMeta}>分かったこと・未確定・次を確認</span></span>
              <span className={styles.arrow}>›</span>
            </Link>
            <Link href="/stocks" className={styles.quickLink}>
              <span><span className={styles.quickLabel}>銘柄</span><span className={styles.quickMeta}>{data.candidates.length}銘柄を確認</span></span>
              <span className={styles.arrow}>›</span>
            </Link>
            <Link href="/reports" className={styles.quickLink}>
              <span><span className={styles.quickLabel}>資料</span><span className={styles.quickMeta}>{data.reports.filter((r) => r.available).length}件生成済み</span></span>
              <span className={styles.arrow}>›</span>
            </Link>
          </div>
        </div>
      </section>

      <details className={styles.dataDetails}>
        <summary><span>データ状態</span><span>{pipelineFailed || missingQualityCount > 0 || mockUniverseCount > 0 ? '要確認' : '正常'}</span></summary>
        <div className={styles.dataBody}>
          <div>生成処理: {pipelineFailed ? `要確認 — ${failedSteps.join(' / ') || data.pipelineStatus?.status}` : (data.pipelineStatus?.status ?? '不明')}</div>
          <div>サンプルデータ / 未取得: {mockUniverseCount} / {missingQualityCount} · 注意 {warningCount}件</div>
          <div>最終生成: {hasValidGeneratedDate ? data.generatedAt : '未生成'}</div>
          {dataWarnings.map((warning) => <div key={warning}>• {warning}</div>)}
        </div>
      </details>

      {worldThemeCandidateHypotheses.length > 0 && (
        <section className={styles.contentSection}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>世界情勢からの調査候補</h2>
            <span className={styles.sectionMeta}>{worldThemeCandidateHypotheses.length}件</span>
          </div>
          <p className={styles.contentIntro}>買い推奨ではありません。世界情勢・テーマ変化から作った仮説を30 / 90 / 180日後に答え合わせします。</p>
          <div className={styles.list}>
            {worldThemeCandidateHypotheses.map((item, index) => (
              <article className={styles.row} key={`${item.sourceEventTitle}-${item.candidateCode}-${index}`}>
                <div className={styles.rowHead}>
                  <div>
                    <div className={styles.rowTitle}>{item.candidateCode} {item.candidateCompany}</div>
                    <div className={styles.rowMeta}>{item.theme} · 情勢イベント: {item.sourceEventTitle}</div>
                  </div>
                  <span className={styles.tag}>調査候補</span>
                </div>
                <div className={styles.rowBody}>{item.whyThisCompany}</div>
                <div className={styles.rowDetails}>
                  <div><strong>評価される可能性:</strong> {item.upsideHypothesis}</div>
                  <div><strong>上がらない / 下がる理由:</strong> {item.downsideRisk}</div>
                  <div><strong>次に確認する一次情報:</strong> {item.nextPrimaryCheck}</div>
                  <div className={styles.rowMeta}>答え合わせ予定: {item.reviewAfterDays.join(' / ')}日後</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {(data.specialSituationWatch?.topChanceList ?? []).length > 0 && (
        <section className={styles.contentSection}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>特殊状況・調査優先候補</h2>
            <span className={styles.sectionMeta}>{Math.min((data.specialSituationWatch?.topChanceList ?? []).length, 5)}件表示</span>
          </div>
          <p className={styles.contentIntro}>証拠確認前の調査候補です。「なぜ今見るか」と「なぜまだ待つか」を同じ画面で残します。</p>
          <div className={styles.list}>
            {(data.specialSituationWatch?.topChanceList ?? []).slice(0, 5).map((item) => {
              const conf = item.listingInfo?.confidence
              const tone = item.chanceLevel === 'high' ? 'good' : item.chanceLevel === 'attention' ? 'warn' : 'neutral'
              return (
                <article className={styles.row} key={item.code}>
                  <div className={styles.rowHead}>
                    <div>
                      <div className={styles.rowTitle}>{item.code} {item.name}</div>
                      <div className={styles.rowMeta}>{item.finalLabel}</div>
                    </div>
                    <span className={tagClass(tone)}>{chanceLabel(item.chanceLevel)}</span>
                  </div>
                  <div className={styles.rowBody}>{item.reasonSummary}</div>
                  <div className={styles.rowDetails}>
                    {(item.whyNow ?? []).length > 0 && <div><strong>なぜ今見る:</strong> {(item.whyNow ?? []).slice(0, 2).join(' / ')}</div>}
                    {(item.whyNotNow ?? []).length > 0 && <div><strong>まだ待つ理由:</strong> {(item.whyNotNow ?? []).slice(0, 2).join(' / ')}</div>}
                    {item.themeCompanyFitSummary && (
                      <div><strong>テーマ適合:</strong> {item.themeCompanyFitSummary.themeLabel} / {item.themeCompanyFitSummary.selectedCompanyFit}{(item.themeCompanyFitSummary.betterCompanyCodes ?? []).length > 0 ? ` · 比較候補 ${item.themeCompanyFitSummary.betterCompanyCodes.slice(0, 2).join(' / ')}` : ''}</div>
                    )}
                    {item.sellerPressureSummary && item.sellerPressureSummary.remainingOverhang !== 'low' && (
                      <div><strong>売り圧:</strong> {[item.sellerPressureSummary.sellerName ?? item.sellerPressureSummary.sellerType, item.sellerPressureSummary.remainingOverhang].filter(Boolean).join(' / ')}</div>
                    )}
                    {item.mainRisks.length > 0 && <div><strong>注意:</strong> {item.mainRisks.slice(0, 3).join(' / ')}</div>}
                    {item.nextCheck.length > 0 && <div><strong>次に確認:</strong> {item.nextCheck.slice(0, 4).join(' / ')}</div>}
                    {item.listingInfo && (
                      <div className={styles.rowMeta}>
                        {[
                          item.listingInfo.listedAt ? `上場日 ${item.listingInfo.listedAt}` : null,
                          item.listingInfo.plannedListingAt ? `上場予定 ${item.listingInfo.plannedListingAt}` : null,
                          item.listingInfo.lockupExpiryAt ? `ロックアップ解除 ${item.listingInfo.lockupExpiryAt}` : null,
                          item.listingInfo.firstEarningsAt ? `初回決算 ${item.listingInfo.firstEarningsAt}` : null,
                          conf && conf !== 'official' ? `確認度 ${conf}` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className={styles.legacySection}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>分析会議・改善状況</h2>
        </div>
        <ProCommandCard data={data} />
      </section>

      <section className={styles.contentSection}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>注目候補</h2>
          <span className={styles.sectionMeta}>スコア50以上</span>
        </div>
        {list.length === 0 ? (
          <div className={styles.notice}>表示できる候補がありません。生成データを確認してください。</div>
        ) : (
          list.map(({ c }) => <CandidateCard key={c.code} cand={c} />)
        )}
        <p className={styles.footerNote}>スコア49点以下は表示しません。重要判断は分析会議・IRイベント・決算/総会確認を優先します。</p>
      </section>

      <Disclaimer compact />
    </main>
  )
}
