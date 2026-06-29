import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { loadGeneratedData } from '@/lib/generated-data'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'

export const metadata = { title: '世界情勢 | alpha-pon' }

const LEVEL_COLOR: Record<string, string> = {
  high_watch: 'var(--urgent)',
  watch: 'var(--amber)',
  low: 'var(--sky-deep)',
}

const LEVEL_LABEL: Record<string, string> = {
  high_watch: '高監視',
  watch: '監視',
  low: '低',
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
}

type WorldThemeReview = {
  generatedAt?: string
  totalHypotheses?: number
  reviewedResults?: number
  dueReviews?: Array<{
    hypothesisId: string
    dueAt: string
    afterDays: 30 | 90 | 180
    sourceEventTitle: string
    theme: string
    candidateCode: string
    candidateCompany: string
    nextPrimaryCheck: string
  }>
}

function loadWorldThemeReview(): WorldThemeReview | null {
  const candidates = [
    join(process.cwd(), '..', '..', 'reports', 'world_theme_candidate_review_latest.json'),
    join(process.cwd(), 'reports', 'world_theme_candidate_review_latest.json'),
  ]
  const path = candidates.find(p => existsSync(p))
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as WorldThemeReview
  } catch {
    return null
  }
}

export default function WorldPage() {
  const data = loadGeneratedData()
  const world = data.worldContext
  const ipoThemeWatch = data.ipoThemeWatch
  const generated = data as unknown as { worldThemeCandidateHypotheses?: WorldThemeCandidateHypothesis[] }
  const worldThemeCandidateHypotheses = generated.worldThemeCandidateHypotheses ?? []
  const worldThemeReview = loadWorldThemeReview()
  const dueReviews = worldThemeReview?.dueReviews ?? []

  if (!world) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🌐</div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
          世界情勢データなし
        </h2>
        <p style={{ fontSize: 13, fontWeight: 600 }}>
          <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
            pnpm ui:data
          </code>{' '}
          を実行してください
        </p>
      </div>
    )
  }

  return (
    <>
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '52px 20px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lavender-deep)', marginBottom: 2 }}>
            {world.asOf} 更新 ・ {world.mode}
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
            世界情勢
          </h1>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* 総括 */}
        <Card pad={14} style={{ marginBottom: 16, background: 'linear-gradient(135deg, var(--surface), var(--surface-2))' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--lavender-deep)', marginBottom: 6 }}>現在の総括</div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.6 }}>
            {world.summary}
          </p>
        </Card>

        {/* 世界情勢候補仮説 */}
        <SectionLabel icon={<Icon name="spark" size={15} />}>世界情勢からの調査候補仮説</SectionLabel>
        <Card pad={12} style={{ marginBottom: 10, background: 'var(--sky-soft)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--sky-deep)', lineHeight: 1.55 }}>
            買い推奨ではありません。世界情勢・テーマ変化から作った仮説を、一次情報で確認し、30/90/180日後に答え合わせします。
          </div>
        </Card>

        {dueReviews.length > 0 && (
          <>
            <SectionLabel icon={<Icon name="alert" size={15} />}>レビュー期限到来</SectionLabel>
            {dueReviews.slice(0, 5).map(item => (
              <Card key={`${item.hypothesisId}-${item.afterDays}`} pad={14} style={{ marginBottom: 10, border: '1px solid var(--amber)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)', marginBottom: 4 }}>
                  {item.candidateCode} {item.candidateCompany} / {item.theme}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--amber)', marginBottom: 6 }}>
                  {item.dueAt}（{item.afterDays}日後レビュー）
                </div>
                <div style={{ fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  情勢: {item.sourceEventTitle}<br />
                  次に確認: {item.nextPrimaryCheck}<br />
                  hypothesisId: {item.hypothesisId}
                </div>
              </Card>
            ))}
          </>
        )}

        {worldThemeCandidateHypotheses.slice(0, 8).map((item, index) => (
          <Card key={`${item.sourceEventTitle}-${item.candidateCode}-${index}`} pad={14} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--sky-deep)', background: 'var(--sky-soft)', borderRadius: 6, padding: '2px 7px' }}>
                {item.theme}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)' }}>
                {item.candidateCode} {item.candidateCompany}
              </span>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', lineHeight: 1.45, marginBottom: 6 }}>
              情勢イベント: {item.sourceEventTitle}
            </div>
            <p style={{ margin: '0 0 7px', fontSize: 12.5, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {item.whyThisCompany}
            </p>
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.45, marginBottom: 4 }}>
              <span style={{ fontWeight: 850, color: 'var(--accent)' }}>評価される可能性: </span>
              {item.upsideHypothesis}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-3)', lineHeight: 1.45, marginBottom: 4 }}>
              <span style={{ fontWeight: 850, color: 'var(--amber)' }}>外れる理由: </span>
              {item.downsideRisk}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-3)', lineHeight: 1.45 }}>
              <span style={{ fontWeight: 850 }}>次に確認する一次情報: </span>
              {item.nextPrimaryCheck}
            </div>
            <div style={{ marginTop: 7, fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)' }}>
              答え合わせ予定: {item.reviewAfterDays.join(' / ')}日後
            </div>
          </Card>
        ))}

        {/* アクティブ情勢 */}
        <SectionLabel icon={<Icon name="alert" size={15} />}>監視中の情勢</SectionLabel>

        {world.activeRegimes.map(regime => {
          const color = LEVEL_COLOR[regime.level] ?? 'var(--ink-3)'
          const label = LEVEL_LABEL[regime.level] ?? regime.level
          return (
            <Card key={regime.id} pad={14} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 4, borderRadius: 99, background: color, flexShrink: 0, alignSelf: 'stretch',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, color, background: color + '20',
                      borderRadius: 5, padding: '2px 7px',
                    }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                      {regime.id.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {regime.why}
                  </p>

                  {regime.watchCategories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {regime.watchCategories.map(cat => (
                        <span key={cat} style={{
                          fontSize: 11.5, fontWeight: 700, color: 'var(--sky-deep)',
                          background: 'var(--sky-soft)', borderRadius: 6, padding: '2px 8px',
                        }}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {regime.caution.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 4 }}>注意点</div>
                      {regime.caution.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>
                          <span style={{ color: 'var(--amber)', flexShrink: 0 }}>⚠</span>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}

        {/* 運用ルール */}
        {world.operatingRules.length > 0 && (
          <>
            <SectionLabel icon={<Icon name="doc" size={15} />}>運用ルール</SectionLabel>
            <Card pad={12}>
              {world.operatingRules.map((rule, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
                  padding: '7px 0',
                  borderBottom: i < world.operatingRules.length - 1 ? '1px solid var(--line)' : 'none',
                  lineHeight: 1.5,
                }}>
                  <span style={{ color: 'var(--lavender-deep)', flexShrink: 0 }}>•</span>
                  {rule}
                </div>
              ))}
            </Card>
          </>
        )}

        {ipoThemeWatch && (ipoThemeWatch.rules ?? []).length > 0 && (
          <>
            <SectionLabel icon={<Icon name="spark" size={15} />}>IPO / AI / 宇宙テーマ監視</SectionLabel>
            <Card pad={14} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--lavender-deep)', marginBottom: 6 }}>
                default action
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55 }}>
                {ipoThemeWatch.defaultAction ?? '監視・証拠確認・待つ理由の記録'}
              </p>
              {(ipoThemeWatch.neverTreatAs ?? []).length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(ipoThemeWatch.neverTreatAs ?? []).map(item => (
                    <span key={item} style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--amber)', background: 'var(--amber-soft)', borderRadius: 7, padding: '3px 8px' }}>
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {(ipoThemeWatch.rules ?? []).map(rule => (
              <Card key={rule.id} pad={14} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--ink)' }}>{rule.label}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2 }}>{rule.id}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--sky-deep)', background: 'var(--sky-soft)', borderRadius: 7, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                    監視
                  </span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 8 }}>
                  {rule.defaultAction}
                </div>
                {(rule.names ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {(rule.names ?? []).map(name => (
                      <span key={name} style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--lavender-deep)', background: 'var(--lavender-soft)', borderRadius: 6, padding: '2px 7px' }}>{name}</span>
                    ))}
                  </div>
                )}
                {(rule.evidenceNeeded ?? []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--ink-3)', marginBottom: 4 }}>確認する証拠</div>
                    {(rule.evidenceNeeded ?? []).slice(0, 5).map(item => (
                      <div key={item} style={{ display: 'flex', gap: 7, fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>
                        <span style={{ color: 'var(--sky-deep)' }}>□</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(rule.touchAvoidReasons ?? []).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--amber)', marginBottom: 4 }}>待つ理由</div>
                    {(rule.touchAvoidReasons ?? []).slice(0, 4).map(item => (
                      <div key={item} style={{ display: 'flex', gap: 7, fontSize: 12, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>
                        <span style={{ color: 'var(--amber)' }}>!</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(rule.japaneseSpilloverThemes ?? []).length > 0 && (
                  <div style={{ marginTop: 9, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(rule.japaneseSpilloverThemes ?? []).map(theme => (
                      <span key={theme} style={{ fontSize: 11, fontWeight: 750, color: 'var(--mint-deep)', background: 'var(--mint-soft)', borderRadius: 6, padding: '2px 7px' }}>{theme}</span>
                    ))}
                  </div>
                )}
                {(rule.relatedCompanies ?? []).length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    {(rule.relatedCompanies ?? []).map(company => (
                      <div key={`${rule.id}-${company.code}`} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 8, fontSize: 11.5, marginTop: 4 }}>
                        <span style={{ color: 'var(--ink-3)', fontWeight: 850 }}>{company.code}</span>
                        <span style={{ color: 'var(--ink-2)', fontWeight: 650 }}>{company.name} / {company.relation}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </>
        )}

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
