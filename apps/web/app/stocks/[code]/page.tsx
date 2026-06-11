import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, TagChip } from '@/components/Badge'
import { Card, SectionLabel } from '@/components/Card'
import { Disclaimer } from '@/components/Disclaimer'
import { Icon } from '@/components/Icon'
import { ScoreViz } from '@/components/ScoreViz'
import { loadGeneratedData } from '@/lib/generated-data'
import { formatPercent } from '@/lib/format'
import { getStockDetail, type StockDetailStatus } from '@/lib/stock-detail'

type Props = {
  params: Promise<{ code: string }>
}

const STATUS_META: Record<StockDetailStatus, { label: string; color: string; soft: string }> = {
  ok: { label: 'ok', color: 'var(--mint-deep)', soft: 'var(--mint-soft)' },
  info: { label: 'info', color: 'var(--sky-deep)', soft: 'var(--sky-soft)' },
  attention: { label: 'attention', color: 'var(--amber)', soft: 'var(--amber-soft)' },
  missing: { label: 'missing', color: 'var(--ink-3)', soft: 'var(--surface-2)' },
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

function StatusBadge({ status, label }: { status: StockDetailStatus; label?: string }) {
  const meta = STATUS_META[status]
  return <Badge colorVar={meta.color} softVar={meta.soft}>{label ?? meta.label}</Badge>
}

function EmptyText({ children = '未記録' }: { children?: string }) {
  return <p style={{ margin: 0, fontSize: 13, fontWeight: 650, color: 'var(--ink-3)', lineHeight: 1.6 }}>{children}</p>
}

function ListBlock({ items, empty = '未記録' }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <EmptyText>{empty}</EmptyText>
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--ink-3)', marginTop: 7, flexShrink: 0 }} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value, status = 'missing' }: { label: string; value: string; status?: StockDetailStatus }) {
  const meta = STATUS_META[status]
  return (
    <div style={{ minWidth: 0, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{value}</span>
      </div>
    </div>
  )
}

function pct(value: number | null): string {
  return value == null ? '比較不能' : formatPercent(value, true)
}

export default async function StockDetailPage({ params }: Props) {
  const { code } = await params
  const detail = getStockDetail(code)
  if (!detail) notFound()

  const latestHypothesis = detail.hypotheses[0]
  const scoreForViz = detail.candidate?.score

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
        <Link href="/stocks" style={{ width: 38, height: 38, borderRadius: 12, border: '1px solid var(--card-line)', background: 'var(--surface)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <Icon name="back" size={20} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 19, color: 'var(--ink)', lineHeight: 1.1, overflowWrap: 'anywhere' }}>{detail.name}</h1>
          <div style={{ fontSize: 11.5, fontWeight: 750, color: 'var(--ink-3)', marginTop: 3 }}>
            {detail.code}{detail.market ? ` ・ ${detail.market}` : ''} ・ 更新 {detail.lastUpdatedAt ?? '未取得'}
          </div>
        </div>
        <StatusBadge status={detail.status} />
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <Card pad={16}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 5 }}>考察履歴ページ</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.45 }}>
                調査候補になった理由、仮説、反証条件、答え合わせ、次の確認ポイントをまとめて追跡します。
              </div>
            </div>
            <StatusBadge status={detail.dataAvailability === 'ok' ? 'ok' : detail.dataAvailability === 'priceDataPending' ? 'info' : detail.dataAvailability === 'partial' ? 'attention' : 'missing'} label={detail.dataAvailabilityReason} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {detail.sourceKinds.map(kind => <TagChip key={kind}>{kind}</TagChip>)}
          </div>
        </Card>

        <div style={{ margin: '14px 0 4px', padding: '10px 14px', background: 'var(--urgent-soft)', borderRadius: 12, fontSize: 12.5, fontWeight: 750, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          ※ このページは調査・検証の記録です。投資助言や注文判断の自動化ではありません。
        </div>

        <SectionLabel icon={<Icon name="arc" size={15} />}>今日の状態</SectionLabel>
        <Card pad={14}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 9 }}>
            <Metric label="スコア" value={detail.score == null ? '未記録' : `${detail.score}/100`} status={detail.score == null ? 'missing' : 'ok'} />
            <Metric label="ops signal" value={detail.opsSignals.length === 0 ? '通常' : `${detail.opsSignals.length}件`} status={detail.opsSignals.some(item => item.status === 'attention') ? 'attention' : detail.opsSignals.length > 0 ? 'info' : 'ok'} />
            <Metric label="stale fallback" value={detail.staleFallback ? '確認対象' : 'なし'} status={detail.staleFallback ? 'attention' : 'ok'} />
            <Metric label="source verification" value={detail.sourceVerification === 'ok' ? '一次情報あり' : detail.sourceVerification === 'attention' ? '確認対象' : '未確認'} status={detail.sourceVerification} />
            <Metric label="priceDataPending" value={detail.priceDataPending ? 'あり' : 'なし'} status={detail.priceDataPending ? 'info' : 'ok'} />
            <Metric label="generated data" value={detail.generatedAt ?? '未生成'} status={detail.generatedAt ? 'ok' : 'missing'} />
          </div>
          {scoreForViz && (
            <div style={{ marginTop: 14 }}>
              <ScoreViz score={scoreForViz} variant="bars" />
            </div>
          )}
          {detail.opsSignals.length > 0 && (
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {detail.opsSignals.map((signal, index) => (
                <div key={`${signal.title}-${index}`} style={{ padding: '9px 10px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <StatusBadge status={signal.status} />
                    <span style={{ fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{signal.title}</span>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink-2)', lineHeight: 1.5 }}>{signal.detail}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <SectionLabel icon={<Icon name="spark" size={15} />}>なぜ調査候補になったか</SectionLabel>
        <Card pad={14}>
          <ListBlock items={detail.researchReasons} />
          {detail.eventNotes.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detail.eventNotes.map(note => <TagChip key={note.label}>{note.value}</TagChip>)}
            </div>
          )}
        </Card>

        <SectionLabel icon={<Icon name="doc" size={15} />}>仮説履歴</SectionLabel>
        <Card pad={0}>
          {detail.hypotheses.length === 0 ? (
            <div style={{ padding: 14 }}><EmptyText /></div>
          ) : detail.hypotheses.map((hypothesis, index) => (
            <div key={`${hypothesis.detectedAt}-${index}`} style={{ padding: 14, borderBottom: index < detail.hypotheses.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 7 }}>
                <StatusBadge status={hypothesis.status === 'open' ? 'info' : 'missing'} label={hypothesis.label ?? hypothesis.status ?? '未記録'} />
                <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink-3)' }}>{hypothesis.detectedAt ?? '検出日未記録'} / {hypothesis.horizon ?? 'horizon未記録'}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--ink)', lineHeight: 1.55 }}>{hypothesis.reason ?? '未記録'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                <span>expected: {hypothesis.expectedDirection}</span>
                <span>review: {hypothesis.reviewDueAt ?? '未記録'}</span>
                <span>confidence: {hypothesis.confidence == null ? '未記録' : `${Math.round(hypothesis.confidence * 100)}%`}</span>
              </div>
            </div>
          ))}
        </Card>

        <SectionLabel icon={<Icon name="alert" size={15} />}>反証条件・上がらない理由</SectionLabel>
        <div style={{ display: 'grid', gap: 10 }}>
          {detail.riskNotes.map(note => (
            <Card key={note.label} pad={14}>
              <div style={{ fontSize: 12, fontWeight: 850, color: 'var(--ink)', marginBottom: 8 }}>{note.label}</div>
              <ListBlock items={note.items} />
            </Card>
          ))}
        </div>

        <SectionLabel icon={<Icon name="check" size={15} />}>Outcome / 答え合わせ</SectionLabel>
        <Card pad={0}>
          {detail.outcomes.length === 0 ? (
            <div style={{ padding: 14 }}><EmptyText>未評価</EmptyText></div>
          ) : detail.outcomes.map((outcome, index) => (
            <div key={`${outcome.horizon}-${outcome.evaluatedAt}-${index}`} style={{ padding: 14, borderBottom: index < detail.outcomes.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{outcome.horizon}</span>
                  <StatusBadge status={outcome.status} label={outcome.resultLabel} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink-3)' }}>期限 {outcome.dueAt ?? '未記録'} / 評価 {outcome.evaluatedAt ?? '未記録'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
                <Metric label="expected" value={outcome.expectedDirection} status={outcome.expectedDirection === 'unknown' ? 'missing' : 'ok'} />
                <Metric label="actual" value={outcome.actualDirection} status={outcome.actualDirection === 'unknown' ? 'missing' : 'ok'} />
                <Metric label="return" value={pct(outcome.returnPct)} status={outcome.returnPct == null ? 'missing' : 'ok'} />
                <Metric label="TOPIX比較" value={pct(outcome.relativeToTopixPct)} status={outcome.relativeToTopixPct == null ? 'missing' : 'ok'} />
                <Metric label="data" value={outcome.dataAvailability} status={outcome.priceDataPending ? 'info' : outcome.dataAvailability === 'ok' ? 'ok' : 'attention'} />
              </div>
              {(outcome.notes.length > 0 || outcome.missedSignals.length > 0) && (
                <div style={{ marginTop: 10 }}>
                  <ListBlock items={[...outcome.notes, ...outcome.missedSignals]} />
                </div>
              )}
            </div>
          ))}
        </Card>

        <SectionLabel icon={<Icon name="doc" size={15} />}>外れ理由・学習メモ</SectionLabel>
        <Card pad={14}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 850, color: 'var(--ink)', marginBottom: 7 }}>missedSignals / notes</div>
              <ListBlock items={[...detail.reflection.missedSignals, ...detail.reflection.notes]} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 850, color: 'var(--ink)', marginBottom: 7 }}>lesson / whyMissed</div>
              <ListBlock items={[...detail.reflection.improvedRuleIdeas, ...detail.reflection.memoryNotes]} />
            </div>
          </div>
        </Card>

        <SectionLabel icon={<Icon name="watch" size={15} />}>次の確認ポイント</SectionLabel>
        <Card pad={14}>
          {latestHypothesis?.reviewDueAt && (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status="info" label={`次回 review: ${latestHypothesis.reviewDueAt}`} />
              {detail.priceDataPending && <StatusBadge status="info" label="価格データ提供後に再確認" />}
            </div>
          )}
          <ListBlock items={detail.nextChecks} />
        </Card>

        <Disclaimer />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
