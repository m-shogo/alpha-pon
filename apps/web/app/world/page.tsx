import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { loadGeneratedData } from '@/lib/generated-data'
import { normalizeWorldThemeReviewInput } from '@/lib/world-theme-review-input'
import type { GeneratedWorldThemeCandidateHypothesisInput } from '@/lib/generated-array-input'
import styles from './world.module.css'

export const metadata = { title: '世界情勢 | alpha-pon' }

const LEVEL_META: Record<string, { label: string; color: string }> = {
  high_watch: { label: '強く監視', color: 'var(--urgent)' },
  watch: { label: '監視', color: 'var(--amber)' },
  low: { label: '低め', color: 'var(--sky-deep)' },
}

function loadWorldThemeReview() {
  const candidates = [
    join(process.cwd(), '..', '..', 'reports', 'world_theme_candidate_review_latest.json'),
    join(process.cwd(), 'reports', 'world_theme_candidate_review_latest.json'),
  ]
  const path = candidates.find(candidate => existsSync(candidate))
  if (!path) return null
  try {
    return normalizeWorldThemeReviewInput(JSON.parse(readFileSync(path, 'utf-8')))
  } catch {
    return null
  }
}

function CandidateRow({ item }: { item: GeneratedWorldThemeCandidateHypothesisInput }) {
  return (
    <article className={styles.candidateRow}>
      <div className={styles.rowTop}>
        <div className={styles.identity}>
          <div className={styles.nameLine}>
            <span className={styles.company}>{item.candidateCompany}</span>
            <span className={styles.code}>{item.candidateCode}</span>
          </div>
          <div className={styles.meta}>
            テーマ: {item.theme} ・ 情勢: {item.sourceEventTitle}
            {item.sourceEventPublishedAt ? ` ・ ${item.sourceEventPublishedAt}` : ''}
          </div>
        </div>
        <div className={styles.state} style={{ color: 'var(--sky-deep)' }}>調査候補</div>
      </div>

      <p className={styles.bodyText}>{item.whyThisCompany}</p>

      <div className={styles.thesisGrid}>
        <div className={styles.thesisItem}>
          <div className={styles.thesisLabel}>評価される可能性</div>
          <div className={styles.thesisText}>{item.upsideHypothesis}</div>
        </div>
        <div className={styles.thesisItem}>
          <div className={styles.thesisLabel}>外れる理由</div>
          <div className={styles.thesisText}>{item.downsideRisk}</div>
        </div>
        <div className={styles.thesisItem}>
          <div className={styles.thesisLabel}>次に確認する一次情報</div>
          <div className={styles.thesisText}>{item.nextPrimaryCheck}</div>
        </div>
      </div>

      <div className={styles.deadline}>答え合わせ: {item.reviewAfterDays.join(' / ')}日後</div>
    </article>
  )
}

export default function WorldPage() {
  const data = loadGeneratedData()
  const world = data.worldContext
  const ipoThemeWatch = data.ipoThemeWatch
  const generated = data as typeof data & { worldThemeCandidateHypotheses?: GeneratedWorldThemeCandidateHypothesisInput[] }
  const worldThemeCandidateHypotheses = generated.worldThemeCandidateHypotheses ?? []
  const worldThemeReview = loadWorldThemeReview()
  const dueReviews = worldThemeReview?.dueReviews ?? []

  if (!world) {
    return (
      <main className={styles.page}>
        <div className={styles.empty}>
          <h1>世界情勢データはまだありません</h1>
          <p>世界情勢の生成結果が利用できるようになると、現在の情勢・調査候補・次に確認する一次情報がここに表示されます。</p>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{world.asOf} 時点 ・ {world.mode}</p>
        <h1 className={styles.title}>世界情勢</h1>
        <p className={styles.lead}>
          世界で起きている変化から、これから評価が変わる可能性のある日本企業を調べる入口です。
          ここに出る会社は買い推奨ではなく、一次情報で確認するための調査候補です。
        </p>
      </header>

      <div className={styles.content}>
        <section className={styles.overview} aria-label="現在の世界情勢概要">
          <p className={styles.overviewText}>{world.summary}</p>
          <div className={styles.overviewMetrics}>
            <div className={styles.overviewMetric}>
              <div className={styles.metricLabel}>監視中の情勢</div>
              <div className={styles.metricValue}>{world.activeRegimes.length}件</div>
            </div>
            <div className={styles.overviewMetric}>
              <div className={styles.metricLabel}>世界情勢からの調査候補</div>
              <div className={styles.metricValue}>{worldThemeCandidateHypotheses.length}件</div>
            </div>
            <div className={styles.overviewMetric}>
              <div className={styles.metricLabel}>答え合わせ期限到来</div>
              <div className={styles.metricValue} style={{ color: dueReviews.length > 0 ? 'var(--amber)' : 'var(--ink)' }}>
                {dueReviews.length}件
              </div>
            </div>
          </div>
        </section>

        {dueReviews.length > 0 && (
          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>答え合わせの期限が来たもの</h2>
              <div className={styles.sectionMeta}>{dueReviews.length}件</div>
            </div>
            <div className={styles.list}>
              {dueReviews.slice(0, 5).map(item => (
                <article key={`${item.hypothesisId}-${item.afterDays}`} className={styles.dueRow}>
                  <div className={styles.rowTop}>
                    <div className={styles.identity}>
                      <div className={styles.nameLine}>
                        <span className={styles.company}>{item.candidateCompany}</span>
                        <span className={styles.code}>{item.candidateCode}</span>
                      </div>
                      <div className={styles.meta}>テーマ: {item.theme} ・ 情勢: {item.sourceEventTitle}</div>
                    </div>
                    <div className={`${styles.state} ${styles.reviewDue}`}>{item.dueAt}</div>
                  </div>
                  <p className={styles.bodyText}>
                    {item.afterDays}日後の答え合わせ。次に確認する一次情報: {item.nextPrimaryCheck}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>世界情勢からの調査候補</h2>
            <div className={styles.sectionMeta}>{worldThemeCandidateHypotheses.length}件</div>
          </div>
          <div className={styles.notice}>
            世界情勢 → テーマ → 企業候補 → 仮説 → 次に確認する一次情報、の順で読みます。候補が0件でも異常ではありません。
          </div>
          {worldThemeCandidateHypotheses.length > 0 && (
            <div className={styles.list}>
              {worldThemeCandidateHypotheses.slice(0, 8).map((item, index) => (
                <CandidateRow key={`${item.sourceEventTitle}-${item.candidateCode}-${index}`} item={item} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>いま監視している情勢</h2>
            <div className={styles.sectionMeta}>{world.activeRegimes.length}件</div>
          </div>
          {world.activeRegimes.length === 0 ? (
            <div className={styles.notice}>現在、強く監視する情勢は登録されていません。</div>
          ) : (
            <div className={styles.list}>
              {world.activeRegimes.map(regime => {
                const meta = LEVEL_META[regime.level] ?? { label: regime.level, color: 'var(--ink-3)' }
                return (
                  <article key={regime.id} className={styles.regimeRow}>
                    <div className={styles.rowTop}>
                      <div className={styles.identity}>
                        <div className={styles.company}>{regime.id.replace(/_/g, ' ')}</div>
                        <p className={styles.bodyText}>{regime.why}</p>
                      </div>
                      <div className={styles.regimeLevel} style={{ color: meta.color }}>{meta.label}</div>
                    </div>
                    {regime.watchCategories.length > 0 && (
                      <ul className={styles.watchList}>
                        {regime.watchCategories.map(category => <li key={category}>見る分野: {category}</li>)}
                      </ul>
                    )}
                    {regime.caution.length > 0 && (
                      <ul className={styles.cautionList}>
                        {regime.caution.map((caution, index) => <li key={`${regime.id}-${index}`}>{caution}</li>)}
                      </ul>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {(world.operatingRules.length > 0 || (ipoThemeWatch?.rules ?? []).length > 0) && (
          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>深い監視ルール</h2>
              <div className={styles.sectionMeta}>必要なときだけ確認</div>
            </div>
            <details className={styles.details}>
              <summary>運用ルールとIPO / AI / 宇宙テーマ監視を開く</summary>
              <div className={styles.detailsBody}>
                {world.operatingRules.length > 0 && (
                  <div>
                    <div className={styles.sectionMeta}>世界情勢の運用ルール</div>
                    <ul className={styles.simpleList}>
                      {world.operatingRules.map((rule, index) => <li key={`world-rule-${index}`}>{rule}</li>)}
                    </ul>
                  </div>
                )}

                {ipoThemeWatch && (ipoThemeWatch.rules ?? []).length > 0 && (
                  <div>
                    <div className={styles.sectionMeta}>IPO / AI / 宇宙テーマ</div>
                    <p className={styles.bodyText}>
                      基本方針: {ipoThemeWatch.defaultAction ?? '監視・証拠確認・待つ理由の記録'}
                    </p>
                    {(ipoThemeWatch.neverTreatAs ?? []).length > 0 && (
                      <ul className={styles.cautionList}>
                        {(ipoThemeWatch.neverTreatAs ?? []).map(item => <li key={item}>{item}</li>)}
                      </ul>
                    )}

                    <div className={styles.ruleGroup}>
                      {(ipoThemeWatch.rules ?? []).map(rule => (
                        <details key={rule.id} className={styles.ruleDetails}>
                          <summary>
                            <span className={styles.ruleSummaryMain}>{rule.label}</span>
                            <span className={styles.ruleId}>{rule.id}</span>
                          </summary>
                          <div className={styles.ruleBody}>
                            <div className={styles.ruleAction}>{rule.defaultAction}</div>
                            {(rule.names ?? []).length > 0 && (
                              <div>
                                <div className={styles.ruleLabel}>関連テーマ・名称</div>
                                <ul className={styles.simpleList}>
                                  {(rule.names ?? []).map(name => <li key={name}>{name}</li>)}
                                </ul>
                              </div>
                            )}
                            <div className={styles.ruleColumns}>
                              {(rule.evidenceNeeded ?? []).length > 0 && (
                                <div>
                                  <div className={styles.ruleLabel}>確認する証拠</div>
                                  <ul className={styles.simpleList}>
                                    {(rule.evidenceNeeded ?? []).map(item => <li key={item}>{item}</li>)}
                                  </ul>
                                </div>
                              )}
                              {(rule.touchAvoidReasons ?? []).length > 0 && (
                                <div>
                                  <div className={styles.ruleLabel}>待つ理由</div>
                                  <ul className={styles.cautionList}>
                                    {(rule.touchAvoidReasons ?? []).map(item => <li key={item}>{item}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>
                            {(rule.japaneseSpilloverThemes ?? []).length > 0 && (
                              <div>
                                <div className={styles.ruleLabel}>日本株への波及テーマ</div>
                                <ul className={styles.simpleList}>
                                  {(rule.japaneseSpilloverThemes ?? []).map(theme => <li key={theme}>{theme}</li>)}
                                </ul>
                              </div>
                            )}
                            {(rule.relatedCompanies ?? []).length > 0 && (
                              <div>
                                <div className={styles.ruleLabel}>関連企業</div>
                                <div className={styles.companyList}>
                                  {(rule.relatedCompanies ?? []).map(company => (
                                    <div key={`${rule.id}-${company.code}`} className={styles.companyLine}>
                                      <strong>{company.code}</strong>
                                      <span>{company.name} / {company.relation}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          </section>
        )}

        <div className={styles.footerSpace} />
      </div>
    </main>
  )
}
