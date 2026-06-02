import { notFound } from 'next/navigation'
import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { PrioBadge, StatusPill, TagChip } from '@/components/Badge'
import { ScoreViz } from '@/components/ScoreViz'
import { Sparkline } from '@/components/Sparkline'
import { ChecklistCard } from '@/components/ChecklistCard'
import { Disclaimer } from '@/components/Disclaimer'
import { formatPrice, formatPercent } from '@/lib/format'
import type { UniverseCandidate, StockCandidateHypothesis } from '@/types/universe'
import type { CompanyMemoryRecord, DataQualityDetail, PrimaryDisclosureReview, ScoreBreakdownDetail } from '@/lib/types'

type Props = {
  params: Promise<{ code: string }>
}

export async function generateStaticParams() {
  try {
    const data = loadGeneratedData()
    const candidateCodes = data.candidates.map(c => ({ code: c.code }))
    const universeCodes = (data.universeCandidates ?? []).map(c => ({ code: c.code }))
    // 重複除去
    const seen = new Set<string>()
    return [...candidateCodes, ...universeCodes].filter(p => {
      if (seen.has(p.code)) return false
      seen.add(p.code)
      return true
    })
  } catch {
    return []
  }
}

function UniverseSection({ candidate }: { candidate: UniverseCandidate }) {
  const isMock = candidate.dataSource === 'mock'
  return (
    <>
      <SectionLabel icon={<Icon name="watch" size={15} />}>スクリーニング結果</SectionLabel>
      <Card pad={14}>
        {isMock && (
          <div style={{ padding: '6px 10px', marginBottom: 10, background: 'var(--amber-soft)', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'var(--amber)' }}>
            ⚠ モックデータ（実データではありません）
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { label: '現在値', value: formatPrice(candidate.currentPrice) },
            { label: '52W高値比', value: candidate.drawdownPct != null ? `-${Math.abs(candidate.drawdownPct).toFixed(1)}%` : '未取得' },
            { label: '営業利益YoY', value: candidate.operatingProfitYoY != null ? `+${candidate.operatingProfitYoY.toFixed(1)}%` : '未取得' },
            { label: 'スクリーニングスコア', value: `${candidate.screeningScore}/100` },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{value}</div>
            </div>
          ))}
        </div>
        {candidate.matchedWorldEventTags.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {candidate.matchedWorldEventTags.map(tag => (
              <span key={tag} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sky-deep)', background: 'var(--sky-soft)', borderRadius: 6, padding: '2px 8px' }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        {candidate.warnings.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
            {candidate.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </Card>
    </>
  )
}

function HypothesisSection({ hypothesis }: { hypothesis: StockCandidateHypothesis }) {
  const LABEL_COLOR: Record<string, string> = {
    '監視候補': 'var(--sky-deep)',
    '検証候補': 'var(--lavender-deep)',
    '反証待ち': 'var(--amber)',
  }
  const color = LABEL_COLOR[hypothesis.label] ?? 'var(--ink-3)'

  return (
    <>
      <SectionLabel icon={<Icon name="spark" size={15} />}>仮説</SectionLabel>
      <Card pad={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color, background: color + '20', borderRadius: 6, padding: '2px 8px' }}>
            {hypothesis.label}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>
            検証期限: {hypothesis.reviewDueAt}
          </span>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          {hypothesis.reason}
        </p>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div><span style={{ color: 'var(--ink-3)' }}>期間: </span><span style={{ fontWeight: 700 }}>{hypothesis.expectedTimeframe}</span></div>
          <div><span style={{ color: 'var(--ink-3)' }}>方向: </span><span style={{ fontWeight: 700 }}>{hypothesis.expectedDirection}</span></div>
          <div><span style={{ color: 'var(--ink-3)' }}>確信: </span><span style={{ fontWeight: 700 }}>{Math.round(hypothesis.confidence * 100)}%</span></div>
        </div>
        {hypothesis.invalidationSignals.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--urgent)', marginBottom: 4 }}>反証シグナル（これが出たら仮説を閉じる）</div>
            {hypothesis.invalidationSignals.slice(0, 4).map((s, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', gap: 7, marginBottom: 3 }}>
                <span style={{ color: 'var(--urgent)' }}>✗</span>{s}
              </div>
            ))}
          </div>
        )}
        {hypothesis.evidenceNeeded.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--sky-deep)', marginBottom: 4 }}>確認すべき証拠</div>
            {hypothesis.evidenceNeeded.slice(0, 4).map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', gap: 7, marginBottom: 3 }}>
                <span style={{ color: 'var(--sky-deep)' }}>→</span>{e}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

const QUALITY_REASON_LABEL: Record<string, string> = {
  jquants_delayed: 'J-Quants V2 Freeプランの遅延データ',
  tdnet_unavailable: 'TDnet dry-run / JPX適時開示の取得不可',
  financial_partial: '財務指標の一部が未取得',
  outcome_insufficient: 'この銘柄のoutcome検証がまだ少ない',
  price_missing: '株価データ不足',
  news_partial: 'ニュース・一次情報の確認が一部不足',
}

function DataQualitySection({ quality, warnings }: { quality: DataQualityDetail | undefined; warnings: string[] }) {
  const level = quality?.level ?? 'low'
  const label = level === 'full' ? '十分' : level === 'partial' ? '一部不足' : '不足'
  const color = level === 'full' ? 'var(--mint-deep)' : level === 'partial' ? 'var(--amber)' : 'var(--urgent)'
  const bg = level === 'full' ? 'var(--mint-soft)' : level === 'partial' ? 'var(--amber-soft)' : 'var(--urgent-soft)'
  const reasons = quality?.reasons ?? []

  return (
    <>
      <SectionLabel icon={<Icon name="check" size={15} />}>データ品質</SectionLabel>
      <Card pad={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color, background: bg, borderRadius: 6, padding: '2px 8px' }}>
            {label}
          </span>
          {quality?.updatedAt && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>更新: {quality.updatedAt}</span>
          )}
        </div>
        {reasons.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {reasons.map(reason => (
              <div key={reason} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
                • {QUALITY_REASON_LABEL[reason] ?? reason}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)' }}>大きな不足理由は検出されていません。</p>
        )}
        {warnings.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            {warnings.slice(0, 3).map((warning, i) => <div key={i}>補足: {warning}</div>)}
          </div>
        )}
      </Card>
    </>
  )
}

function ScoreBreakdownSection({ item }: { item: ScoreBreakdownDetail | undefined }) {
  if (!item) return null
  return (
    <>
      <SectionLabel icon={<Icon name="arc" size={15} />}>スコア根拠</SectionLabel>
      <Card pad={14}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{item.totalScore}点 / {item.label}</div>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--sky-deep)', background: 'var(--sky-soft)', borderRadius: 6, padding: '2px 8px' }}>
            信頼度 {item.confidence}
          </span>
        </div>
        {item.positives.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--mint-deep)', marginBottom: 4 }}>加点・観察理由</div>
            {item.positives.slice(0, 5).map((reason, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>+ {reason}</div>
            ))}
          </div>
        )}
        {item.negatives.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>減点・注意理由</div>
            {item.negatives.slice(0, 5).map((reason, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>- {reason}</div>
            ))}
          </div>
        )}
        {item.missingData.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--urgent)', marginBottom: 4 }}>未取得・要確認データ</div>
            {item.missingData.slice(0, 5).map((reason, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>• {reason}</div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

const DISCLOSURE_DECISION_META = {
  confirmed: { label: '一次情報あり', color: 'var(--mint-deep)', bg: 'var(--mint-soft)' },
  caution: { label: '注意開示あり', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  block: { label: '危険開示あり', color: 'var(--urgent)', bg: 'var(--urgent-soft)' },
  missing: { label: '一次情報未確認', color: 'var(--ink-3)', bg: 'var(--surface-2)' },
} as const

function PrimaryDisclosureSection({ review }: { review: PrimaryDisclosureReview | undefined }) {
  const decision = review?.decision ?? 'missing'
  const meta = DISCLOSURE_DECISION_META[decision]
  const blockers = review?.blockers ?? []
  const warnings = review?.warnings ?? []
  const positives = review?.positives ?? []
  const items = review?.items ?? []

  return (
    <>
      <SectionLabel icon={<Icon name="alert" size={15} />}>一次情報・危険開示</SectionLabel>
      <Card pad={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, background: meta.bg, borderRadius: 6, padding: '2px 8px' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>
            TDnet {review?.sourceCoverage.tdnetCount ?? 0} / EDINET {review?.sourceCoverage.edinetCount ?? 0}
          </span>
        </div>

        {blockers.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--urgent)', marginBottom: 4 }}>危険開示</div>
            {blockers.slice(0, 4).map((item, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>⚠ {item}</div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>注意開示・取得エラー</div>
            {warnings.slice(0, 4).map((item, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>• {item}</div>
            ))}
          </div>
        )}

        {positives.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--mint-deep)', marginBottom: 4 }}>確認済み材料</div>
            {positives.slice(0, 3).map((item, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>✓ {item}</div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            この銘柄の一次情報レビューはまだ表示できません。ニュース材料は仮説扱いにしてください。
          </p>
        )}
      </Card>
    </>
  )
}

function CompanyMemorySection({ memory }: { memory: CompanyMemoryRecord | undefined }) {
  if (!memory) {
    return (
      <>
        <SectionLabel icon={<Icon name="doc" size={15} />}>過去の外れ理由・銘柄メモ</SectionLabel>
        <Card pad={14}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            company memory はまだありません。`pnpm memory:companies` 実行後に、監視理由・弱いルール・過去の検証結果が表示されます。
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <SectionLabel icon={<Icon name="doc" size={15} />}>過去の外れ理由・銘柄メモ</SectionLabel>
      <Card pad={14}>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700, marginBottom: 8 }}>
          最終レビュー: {memory.lastReviewedAt}
        </div>
        {memory.weakRules.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>弱い/注意ルール</div>
            {memory.weakRules.slice(0, 4).map(rule => (
              <span key={rule} style={{ display: 'inline-block', margin: '0 5px 5px 0', fontSize: 11.5, fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-soft)', borderRadius: 6, padding: '2px 7px' }}>
                {rule}
              </span>
            ))}
          </div>
        )}
        {memory.knownRisks.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--urgent)', marginBottom: 4 }}>既知リスク</div>
            {memory.knownRisks.slice(0, 4).map((risk, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>• {risk}</div>
            ))}
          </div>
        )}
        {memory.recentOutcomes.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--sky-deep)', marginBottom: 4 }}>直近の答え合わせ</div>
            {memory.recentOutcomes.slice(0, 3).map((outcome, i) => (
              <div key={i} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>
                {outcome.evaluatedAt}: {outcome.direction}/{outcome.quality}
                {typeof outcome.relativeReturnPct === 'number' ? ` TOPIX比 ${outcome.relativeReturnPct.toFixed(1)}%` : ''}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

export default async function StockDetailPage({ params }: Props) {
  const { code } = await params
  const data = loadGeneratedData()

  // watchlist候補から探す
  const candidate = data.candidates.find(c => c.code === code)
  // ユニバース候補から探す
  const universeCandidate = (data.universeCandidates ?? []).find(c => c.code === code)
  // 仮説
  const hypothesis = (data.hypothesisPredictions ?? [])
    .filter(h => h.code === code && h.status === 'open')
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0]
  const primaryDisclosureReview = data.primaryDisclosureReviews?.[code]
  const companyMemory = data.companyMemoryByCode?.[code]
  const dataQuality = data.dataQualityByCode?.[code]

  if (!candidate && !universeCandidate) notFound()

  // watchlist候補があればそちらを優先表示
  if (candidate) {
    const total = calcTotal(candidate.score)
    const level = calcLevel(total)
    const a = ALERT_META[level]

    return (
      <>
        <div style={{
          position: 'sticky', top: 0, zIndex: 8,
          padding: '50px 14px 12px',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Link href="/" style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--card-line)', background: 'var(--surface)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
            <Icon name="back" size={20} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 19, color: 'var(--ink)', lineHeight: 1 }}>{candidate.name}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2 }}>{candidate.code} ・ {candidate.market}</div>
          </div>
          <PrioBadge priority={candidate.priority} />
          <StatusPill status={candidate.status} />
        </div>

        <div style={{ padding: '16px 16px 0' }}>
          <Card pad={18}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
              <ScoreViz score={candidate.score} variant="ring" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px', marginTop: 8, background: 'var(--accent-soft)', borderRadius: 14 }}>
              <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}><Icon name="spark" size={16} /></span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>発火ルール</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{candidate.triggeredRule}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>株価</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>
                    {formatPrice(candidate.price)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: typeof candidate.changePct === 'number' && candidate.changePct >= 0 ? 'var(--mint-deep)' : 'var(--ink-3)' }}>
                    {formatPercent(candidate.changePct, true)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginTop: 2 }}>
                  {typeof candidate.drawdownPct === 'number' ? `高値から ${candidate.drawdownPct}%` : '価格データ未取得'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Sparkline data={candidate.sparkline ?? [100, 100]} color="auto" w={120} h={40} />
              </div>
            </div>
          </Card>

          <div style={{ margin: '14px 0 4px', padding: '10px 14px', background: 'var(--urgent-soft)', borderRadius: 12, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            ※ 買い推奨ではありません。これは調査候補です。投資判断はご自身の責任で行ってください。
          </div>

          {universeCandidate && <UniverseSection candidate={universeCandidate} />}
          {hypothesis && <HypothesisSection hypothesis={hypothesis} />}
          <DataQualitySection quality={dataQuality?.quality} warnings={dataQuality?.warnings ?? []} />
          <ScoreBreakdownSection item={dataQuality?.scoreBreakdown} />
          <PrimaryDisclosureSection review={primaryDisclosureReview} />
          <CompanyMemorySection memory={companyMemory} />

          <SectionLabel icon={<Icon name="arc" size={15} />}>スコア内訳</SectionLabel>
          <Card pad={18}><ScoreViz score={candidate.score} variant="bars" /></Card>

          <SectionLabel icon={<Icon name="check" size={15} />}>検出理由</SectionLabel>
          <Card pad={6}>
            {candidate.reasons.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderBottom: i < candidate.reasons.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ width: 20, height: 20, borderRadius: 7, background: 'var(--mint-soft)', color: 'var(--mint-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={13} strokeWidth={2.8} /></span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>{r}</span>
              </div>
            ))}
          </Card>

          <SectionLabel icon={<Icon name="alert" size={15} />}>注意点・下がる理由</SectionLabel>
          <Card pad={6}>
            {candidate.negativeReasons.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderBottom: i < candidate.negativeReasons.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <span style={{ width: 20, height: 20, borderRadius: 7, background: 'var(--amber-soft)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="alert" size={13} strokeWidth={2.4} /></span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>{r}</span>
              </div>
            ))}
          </Card>

          <SectionLabel icon={<Icon name="doc" size={15} />}>次に見るもの</SectionLabel>
          <ChecklistCard items={candidate.nextToSee} />

          <SectionLabel>銘柄メモ</SectionLabel>
          <Card>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {candidate.tags.map(t => <TagChip key={t}>#{t}</TagChip>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>最終通知</span><span style={{ color: 'var(--ink)' }}>{candidate.lastNotifiedAt ?? '未通知'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>暫定スコア</span><span style={{ color: a.colorVar, fontWeight: 700 }}>{total}/100</span>
              </div>
            </div>
          </Card>

          <Disclaimer />
          <div style={{ height: 24 }} />
        </div>
      </>
    )
  }

  // ユニバース候補のみの場合
  const uc = universeCandidate!
  return (
    <>
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '50px 14px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Link href="/alerts" style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--card-line)', background: 'var(--surface)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <Icon name="back" size={20} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 19, color: 'var(--ink)', lineHeight: 1 }}>{uc.name}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2 }}>{uc.code} ・ TSE ・ {uc.sector}</div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--sky-deep)', background: 'var(--sky-soft)', borderRadius: 6, padding: '3px 10px' }}>
          監視候補
        </span>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ margin: '0 0 14px', padding: '10px 14px', background: 'var(--urgent-soft)', borderRadius: 12, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          ※ 買い推奨ではありません。スクリーニング通過の調査候補です。投資判断はご自身の責任で行ってください。
        </div>

        <UniverseSection candidate={uc} />
        {hypothesis && <HypothesisSection hypothesis={hypothesis} />}
        <DataQualitySection quality={dataQuality?.quality} warnings={dataQuality?.warnings ?? []} />
        <ScoreBreakdownSection item={dataQuality?.scoreBreakdown} />
        <PrimaryDisclosureSection review={primaryDisclosureReview} />
        <CompanyMemorySection memory={companyMemory} />

        <Disclaimer />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
