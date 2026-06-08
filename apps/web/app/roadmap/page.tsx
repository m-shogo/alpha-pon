import { loadGeneratedData } from '@/lib/generated-data'
import { SectionLabel, Card } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'

export const metadata = { title: '完成ロードマップ | alpha-pon' }

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  done: { label: '完了', color: 'var(--mint-deep)', bg: 'var(--mint-soft)' },
  partial: { label: '進行中', color: 'var(--sky-deep)', bg: 'var(--sky-soft)' },
  blocked: { label: '要対応', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  not_started: { label: '未着手', color: 'var(--ink-3)', bg: 'var(--surface-2)' },
}

const ROADMAP = [
  { phase: '1', itemId: 'real-data', title: '実データ運用', goal: 'J-Quants 実データで daily:full を数日連続で通す' },
  { phase: '2', itemId: 'hypothesis-outcomes', title: '検証履歴の蓄積', goal: '1w/1m/3m・TOPIX比・最大下落を outcome に貯める' },
  { phase: '3', itemId: 'primary-disclosures', title: '一次情報強化', goal: 'TDnet / EDINET の危険開示を個別銘柄判断へ強く接続する' },
  { phase: '4', itemId: 'company-memory', title: '銘柄メモ運用', goal: 'company memory の weakRules / recentOutcomes を毎朝確認する' },
  { phase: '5', itemId: 'portfolio-mode', title: 'ポートフォリオ仕上げ', goal: 'README・スクショ・デモデータ・portfolio mode の見せ方を整える' },
]

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.not_started
  return (
    <span style={{ fontSize: 10.5, fontWeight: 800, color: meta.color, background: meta.bg, borderRadius: 6, padding: '2px 7px' }}>
      {meta.label}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 85 ? 'var(--mint-deep)' : score >= 45 ? 'var(--sky-deep)' : 'var(--amber)'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <div style={{ marginTop: 3, fontSize: 10.5, fontWeight: 800, color }}>{Math.round(score)}%</div>
    </div>
  )
}

function cursorRange(cursor: { offset?: number; maxPerRun?: number; total?: number }) {
  const offset = cursor.offset ?? 0
  const max = cursor.maxPerRun ?? 0
  const total = cursor.total ?? 0
  if (total <= 0) return '範囲未確定'
  const nextEnd = Math.min(total, offset + Math.max(1, max))
  return `${offset + 1}-${nextEnd} / ${total}`
}

function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' | 'alert' }) {
  const color = tone === 'ok' ? 'var(--mint-deep)' : tone === 'alert' ? 'var(--urgent)' : tone === 'warn' ? 'var(--amber)' : 'var(--ink)'
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '10px 12px', border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 850, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

export default function RoadmapPage() {
  const data = loadGeneratedData()
  const readiness = data.readiness
  const readinessById = new Map((readiness?.items ?? []).map(item => [item.id, item]))
  const runCursors = Object.entries(data.runCursors ?? {})
  const specialOps = data.specialSituationOps
  const integrity = data.hypothesisOutcomeIntegrity
  const proDecisions = data.legendProCommittee?.decisions ?? []
  const outcomes = data.hypothesisOutcomes ?? []
  const disagreementsCount = proDecisions.filter(decision => (decision.disagreements ?? []).length > 0).length
  const missingEvidenceCount = proDecisions.reduce((sum, decision) => sum + (decision.missingEvidence ?? []).length, 0)
  const finalLabelCounts = proDecisions.reduce<Record<string, number>>((acc, decision) => {
    const label = decision.finalLabel ?? '未分類'
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})
  const duplicateWarnings = (integrity?.jsonl.duplicateGroups.length ?? 0) + (integrity?.sqlite.duplicateGroups.length ?? 0)
  const actionRequiredCount = specialOps?.actionItems.filter(item => item.priority === 'urgent').length ?? 0
  const nextCommands = [
    specialOps?.actionItems.find(item => item.priority === 'urgent' && item.command)?.command,
    duplicateWarnings > 0 ? 'pnpm outcomes:integrity' : null,
    !data.legendProCommittee ? 'pnpm ui:data' : null,
  ].filter((command): command is string => Boolean(command))

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
            100%完成までの現在地
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
            完成ロードマップ
          </h1>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <SectionLabel icon={<Icon name="filter" size={15} />}>毎朝の運用状態</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 9, marginBottom: 12 }}>
          <MetricCard
            label="health status"
            value={specialOps?.healthStatus ?? readiness?.overallStatus ?? '未生成'}
            tone={specialOps?.healthStatus === 'action_required' ? 'alert' : specialOps?.healthStatus === 'needs_attention' ? 'warn' : 'ok'}
          />
          <MetricCard label="action_required" value={`${actionRequiredCount}件`} tone={actionRequiredCount > 0 ? 'alert' : 'ok'} />
          <MetricCard label="special overdue" value={`${specialOps?.reviewDue.overdue ?? 0}件`} tone={(specialOps?.reviewDue.overdue ?? 0) > 0 ? 'warn' : 'ok'} />
          <MetricCard label="missingEvidence" value={`${missingEvidenceCount}件`} tone={missingEvidenceCount > 0 ? 'warn' : 'ok'} />
          <MetricCard label="generated data" value={data.generatedAt ?? '未生成'} tone={data.generatedAt ? 'ok' : 'alert'} />
          <MetricCard label="UNIQUE index" value={integrity?.sqlite.uniqueIndexExists ? '有効' : '未確認'} tone={integrity?.sqlite.uniqueIndexExists ? 'ok' : 'warn'} />
          <MetricCard label="Pro decisions" value={`${proDecisions.length}件`} tone={proDecisions.length > 0 ? 'ok' : 'alert'} />
          <MetricCard label="disagreements" value={`${disagreementsCount}件`} tone={disagreementsCount > 0 ? 'warn' : 'ok'} />
          <MetricCard label="outcomes" value={`${outcomes.length}件`} tone={outcomes.length > 0 ? 'ok' : 'warn'} />
          <MetricCard label="duplicate warning" value={`${duplicateWarnings}件`} tone={duplicateWarnings > 0 ? 'alert' : 'ok'} />
        </div>

        <Card pad={13} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 850, color: 'var(--ink)', marginBottom: 6 }}>次に実行すべきコマンド</div>
          {nextCommands.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {nextCommands.slice(0, 3).map(command => (
                <code key={command} style={{ display: 'block', background: 'var(--surface-2)', borderRadius: 6, padding: '7px 8px', color: 'var(--ink)', fontSize: 12, fontWeight: 750, overflowX: 'auto' }}>
                  {command}
                </code>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint-deep)' }}>
              追加対応なし。通常の `pnpm health` と `pnpm ui:data` で継続確認。
            </div>
          )}
          {Object.keys(finalLabelCounts).length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              finalLabel分布: {Object.entries(finalLabelCounts).map(([label, count]) => `${label} ${count}`).join(' / ')}
            </div>
          )}
        </Card>

        <SectionLabel icon={<Icon name="arc" size={15} />}>Readiness</SectionLabel>
        <Card pad={15}>
          {readiness ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)' }}>総合完成度</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700, color: 'var(--ink)' }}>
                    {Math.round(readiness.overallScore)}%
                  </div>
                </div>
                <StatusBadge status={readiness.overallStatus} />
              </div>
              <ScoreBar score={readiness.overallScore} />
              {readiness.blockers.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--amber)', lineHeight: 1.5 }}>
                  {readiness.blockers.slice(0, 3).map((blocker, i) => <div key={i}>• {blocker}</div>)}
                </div>
              )}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)' }}>
              readiness 未生成です。`pnpm readiness:audit` を実行してください。
            </p>
          )}
        </Card>

        {readiness && (
          <>
            <SectionLabel icon={<Icon name="check" size={15} />}>自動監査項目</SectionLabel>
            {readiness.items.map(item => (
              <Card key={item.id} pad={13} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{item.label}</div>
                    <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>
                      {item.evidence.slice(0, 2).join(' / ')}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <ScoreBar score={item.score} />
                {item.nextActions.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    次: {item.nextActions[0]}
                  </div>
                )}
              </Card>
            ))}
          </>
        )}

        {runCursors.length > 0 && (
          <>
            <SectionLabel icon={<Icon name="filter" size={15} />}>Run cursors / 次回処理範囲</SectionLabel>
            {runCursors.map(([key, cursor]) => (
              <Card key={key} pad={13} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 850, color: 'var(--ink)' }}>{cursor.jobName ?? key}</div>
                    <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>
                      offset {cursor.offset ?? 0} / max {cursor.maxPerRun ?? '-'} / updated {cursor.updatedAt ?? '-'}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 850, color: 'var(--sky-deep)', background: 'var(--sky-soft)', borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                    次 {cursorRange(cursor)}
                  </span>
                </div>
              </Card>
            ))}
          </>
        )}

        <SectionLabel icon={<Icon name="doc" size={15} />}>残りロードマップ</SectionLabel>
        {ROADMAP.map(item => {
          const audit = readinessById.get(item.itemId)
          const status = audit?.status ?? 'not_started'
          return (
          <Card key={item.phase} pad={13} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.phase}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{item.title}</div>
                <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>{item.goal}</div>
              </div>
              <StatusBadge status={status} />
            </div>
            {audit && (
              <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                現在: {Math.round(audit.score)}% / 次: {audit.nextActions[0] ?? '継続監視'}
              </div>
            )}
          </Card>
        )})}

        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
