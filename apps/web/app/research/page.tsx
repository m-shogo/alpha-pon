import type { CSSProperties } from 'react'
import {
  loadOwnerResearchSummary,
  type OwnerFormalEdgeStatus,
  type OwnerResearchItemStatus,
  type OwnerResearchQuestionStatus,
} from '@/lib/research-summary'

const ITEM_STATUS: Record<OwnerResearchItemStatus, { label: string; tone: string; background: string }> = {
  captured: { label: '収集中', tone: 'var(--sky-deep)', background: 'var(--sky-soft)' },
  triage: { label: '整理中', tone: 'var(--amber)', background: 'var(--amber-soft)' },
  investigating: { label: '調査中', tone: 'var(--accent)', background: 'var(--rose-soft)' },
  synthesized: { label: '整理済み', tone: 'var(--mint-deep)', background: 'var(--mint-soft)' },
  resolved: { label: '解決', tone: 'var(--mint-deep)', background: 'var(--mint-soft)' },
  parked: { label: '保留', tone: 'var(--ink-3)', background: 'var(--surface-2)' },
  archived: { label: 'アーカイブ', tone: 'var(--ink-3)', background: 'var(--surface-2)' },
}

const EDGE_STATUS: Record<OwnerFormalEdgeStatus, { label: string; tone: string; background: string }> = {
  idea: { label: 'Idea', tone: 'var(--sky-deep)', background: 'var(--sky-soft)' },
  research: { label: 'Research', tone: 'var(--accent)', background: 'var(--rose-soft)' },
  shadow: { label: 'Shadow', tone: 'var(--lavender-deep)', background: 'var(--lavender-soft)' },
  production: { label: 'Production', tone: 'var(--mint-deep)', background: 'var(--mint-soft)' },
  rejected: { label: '棄却', tone: 'var(--ink-3)', background: 'var(--surface-2)' },
  deprecated: { label: '統合・終了', tone: 'var(--ink-3)', background: 'var(--surface-2)' },
}

const QUESTION_STATUS: Record<OwnerResearchQuestionStatus, string> = {
  open: '未解決',
  partially_answered: '一部判明',
  answered: '回答済み',
  blocked: 'データ待ち',
  obsolete: '対象外',
}

const GATE_LABELS: Record<string, string> = {
  sufficientSamples: '十分なサンプル',
  holdoutPass: 'Holdout再現',
  pitSafe: 'PIT安全性',
  netAlphaPositive: '実測Net Alpha',
  executionFeasible: '執行可能性',
  liquiditySufficient: '流動性',
  borrowCostCovered: '借株・コスト',
  confoundersRemoved: '交絡除去',
  counterfactualExplained: '反実仮想比較',
  decayChecked: 'Edge Decay',
  falseDiscoveryGuard: '過学習・多重検定防止',
}

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--card-line)',
  borderRadius: 18,
  boxShadow: 'var(--shadow)',
}

function formatDate(value: string | null): string {
  if (!value) return '未記録'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

function SectionTitle({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 118, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '20px 2px 8px' }}>
      <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)', fontWeight: 850 }}>{title}</h2>
      {meta && <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{meta}</span>}
    </div>
  )
}

function MiniList({ items, limit = 4 }: { items: string[]; limit?: number }) {
  if (items.length === 0) return <div style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>まだ記録なし</div>
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {items.slice(0, limit).map((item, index) => (
        <div key={`${index}-${item.slice(0, 24)}`} style={{ display: 'flex', gap: 7, fontSize: 11.5, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 600 }}>
          <span style={{ color: 'var(--ink-3)', flexShrink: 0 }}>•</span>
          <span>{item}</span>
        </div>
      ))}
      {items.length > limit && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>ほか {items.length - limit} 件</div>}
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '11px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: 18, lineHeight: 1.15, color: 'var(--ink)', fontWeight: 900 }}>{value}</div>
      {note && <div style={{ marginTop: 4, fontSize: 9.5, lineHeight: 1.4, color: 'var(--ink-3)', fontWeight: 600 }}>{note}</div>}
    </div>
  )
}

export default function ResearchPage() {
  const data = loadOwnerResearchSummary()
  const status = data.overview.edgeStatus
  const recent = data.overview.recent7d
  const ready = data.overview.readiness

  return (
    <>
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '48px 18px 13px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.4, marginBottom: 3 }}>RESEARCH / OWNER VIEW</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 27, color: 'var(--ink)', letterSpacing: 0.1 }}>研究ダッシュボード</h1>
        <div style={{ marginTop: 5, fontSize: 12, color: 'var(--ink-3)', fontWeight: 650 }}>何を研究中か・どこまで分かったか・次に何を見るか</div>
      </div>

      <div id="research-overview" style={{ padding: '14px 14px 28px', scrollMarginTop: 118 }}>
        {data.warning && (
          <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700 }}>⚠ {data.warning}</div>
        )}

        <nav aria-label="研究ダッシュボード内ナビ" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 0 10px', scrollbarWidth: 'none' }}>
          {[
            ['#research-overview', '概要'],
            ['#research-items', '研究テーマ'],
            ['#formal-edges', 'Formal Edge'],
            ...(data.checkpoint ? [['#checkpoint', '現在地']] : []),
            ['#research-timeline', '履歴'],
            ['#knowledge-map', '知識マップ'],
          ].map(([href, label]) => (
            <a key={href} href={href} style={{ flexShrink: 0, textDecoration: 'none', padding: '6px 9px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 10.5, fontWeight: 800 }}>{label}</a>
          ))}
        </nav>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Metric label="Edge status" value={`R ${status.research} / S ${status.shadow} / P ${status.production}`} note={`Idea ${status.idea} · 終了/棄却 ${status.deprecated + status.rejected}`} />
          <Metric label="直近7日" value={`+Edge ${recent.edgesAdded} / +Analog ${recent.analogsAdded}`} note={`${recent.from}〜${recent.to}`} />
          <Metric label="正式Sample" value={recent.currentFormalSamples} note="現在値。7日増分は履歴未保持" />
          <Metric label="Promotion / Holdout Ready" value={`${ready.promotionReadyEdgeIds.length} / ${ready.holdoutReadyEdgeIds.length}`} note="Gateを裏取りした候補数" />
          <Metric label="研究テーマ" value={data.counts.activeResearchItems} note={`未解決の問い ${data.counts.unresolvedQuestions}`} />
          <Metric label="Research OS整合性" value={`${data.integrity.errorCount} error / ${data.integrity.warningCount} warn`} note={`Knowledge issue ${data.integrity.knowledgeIssueCount}`} />
        </div>

        <div style={{ ...cardStyle, padding: '12px 14px', marginTop: 10, background: 'var(--lavender-soft)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--lavender-deep)' }}>読み方</div>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 600 }}>
            ResearchItemは調べる価値がある問い、Formal Edgeは再現性を検証する段階です。どちらもBUY推奨ではありません。Gate 0/11は0点ではなく「まだ検証が通っていない」の意味です。
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>最終研究更新: {formatDate(data.latestResearchAt)}</div>
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>Sample増分を出さない理由</summary>
            <div style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-3)' }}>{recent.sampleDeltaReason}</div>
          </details>
        </div>

        {(ready.promotionReadyEdgeIds.length > 0 || ready.holdoutReadyEdgeIds.length > 0) && (
          <div style={{ ...cardStyle, padding: '11px 13px', marginTop: 9 }}>
            {ready.promotionReadyEdgeIds.length > 0 && <div style={{ fontSize: 10.5, color: 'var(--mint-deep)', fontWeight: 800 }}>Promotion Ready: {ready.promotionReadyEdgeIds.join(' / ')}</div>}
            {ready.holdoutReadyEdgeIds.length > 0 && <div style={{ marginTop: ready.promotionReadyEdgeIds.length > 0 ? 5 : 0, fontSize: 10.5, color: 'var(--lavender-deep)', fontWeight: 800 }}>Holdout Ready: {ready.holdoutReadyEdgeIds.join(' / ')}</div>}
          </div>
        )}

        <SectionTitle id="research-items" title="いま研究していること" meta={`${data.counts.researchItems}件`} />
        <div style={{ display: 'grid', gap: 9 }}>
          {data.researchItems.map((item) => {
            const itemStatus = ITEM_STATUS[item.status]
            return (
              <article key={item.id} style={{ ...cardStyle, padding: '13px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 750 }}>{item.id}</div>
                    <h3 style={{ margin: '3px 0 0', fontSize: 15.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{item.title}</h3>
                  </div>
                  <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, background: itemStatus.background, color: itemStatus.tone, fontSize: 10, fontWeight: 850 }}>{itemStatus.label}</span>
                </div>
                {item.families.length > 0 && <div style={{ marginTop: 7, fontSize: 9.5, color: 'var(--sky-deep)', fontWeight: 750 }}>{item.families.map((family) => family.title).join(' / ')}</div>}
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 580 }}>{item.summary}</div>
                {item.questions.length > 0 && (
                  <details style={{ marginTop: 9 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontWeight: 820 }}>まだ分からないこと {item.questions.length}件</summary>
                    <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>
                      {item.questions.map((question) => (
                        <div key={question.id} style={{ padding: '8px 9px', borderRadius: 10, background: 'var(--surface-2)' }}>
                          <div style={{ fontSize: 9.5, fontWeight: 850, color: question.status === 'open' ? 'var(--accent)' : 'var(--ink-3)' }}>{QUESTION_STATUS[question.status]}</div>
                          <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 600 }}>{question.question}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <div style={{ marginTop: 8, fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 650 }}>更新: {formatDate(item.lastReviewedAt ?? item.createdAt)}</div>
              </article>
            )
          })}
        </div>

        <SectionTitle id="formal-edges" title="Formal Edge — 検証はどこまで？" meta={`${data.counts.formalEdges}件`} />
        <div style={{ display: 'grid', gap: 10 }}>
          {data.formalEdges.map((edge) => {
            const edgeStatus = EDGE_STATUS[edge.status]
            return (
              <article key={edge.id} style={{ ...cardStyle, padding: '14px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 750 }}>{edge.id}</div>
                    <h3 style={{ margin: '3px 0 0', fontSize: 15.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{edge.title}</h3>
                  </div>
                  <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, background: edgeStatus.background, color: edgeStatus.tone, fontSize: 10, fontWeight: 850 }}>{edgeStatus.label}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 10 }}>
                  <div style={{ padding: '7px 8px', borderRadius: 9, background: 'var(--surface-2)' }}><div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 750 }}>Sample</div><div style={{ marginTop: 2, fontSize: 12, fontWeight: 850 }}>{edge.samples.current}/{edge.samples.required}</div></div>
                  <div style={{ padding: '7px 8px', borderRadius: 9, background: 'var(--surface-2)' }}><div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 750 }}>Analog</div><div style={{ marginTop: 2, fontSize: 12, fontWeight: 850 }}>{edge.samples.analogCurrent}/{edge.samples.analogRequired}</div></div>
                  <div style={{ padding: '7px 8px', borderRadius: 9, background: 'var(--surface-2)' }}><div style={{ fontSize: 9, color: 'var(--ink-3)', fontWeight: 750 }}>Gate</div><div style={{ marginTop: 2, fontSize: 12, color: edge.gate.pass === edge.gate.total ? 'var(--mint-deep)' : 'var(--amber)', fontWeight: 850 }}>{edge.gate.pass}/{edge.gate.total}</div></div>
                </div>

                <div style={{ marginTop: 10, padding: '9px 10px', borderRadius: 10, background: 'var(--lavender-soft)' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--lavender-deep)', fontWeight: 900 }}>仮説 — まだ検証中</div>
                  <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 600 }}>{edge.hypothesisPreview}</div>
                </div>

                <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--mint-deep)', fontWeight: 850 }}>研究ログに記録されたFinding</div>
                    <div style={{ marginTop: 5 }}><MiniList items={edge.knownFindings} limit={3} /></div>
                    <div style={{ marginTop: 3, fontSize: 9, color: 'var(--ink-3)' }}>※ Findingは実測結果とは限りません。実測sample / outcomeは別表示です。</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--amber)', fontWeight: 850 }}>まだ分からないこと</div>
                    <div style={{ marginTop: 5 }}><MiniList items={edge.verificationGaps.map((gap) => `${GATE_LABELS[gap.key] ?? gap.key}: ${gap.explanation ?? (gap.state === 'fail' ? '未通過' : '未確認')}`)} limit={3} /></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: 'var(--sky-deep)', fontWeight: 850 }}>次に調べること</div>
                    <div style={{ marginTop: 5 }}><MiniList items={edge.nextActions} limit={3} /></div>
                  </div>
                </div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)', fontWeight: 800 }}>Edge詳細を開く</summary>
                  <div style={{ marginTop: 8, display: 'grid', gap: 9 }}>
                    <div><div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 850, marginBottom: 4 }}>仮説全文</div><div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{edge.hypothesis}</div></div>
                    <div><div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 850, marginBottom: 4 }}>必要データ</div><MiniList items={edge.requiredData} limit={6} /></div>
                  </div>
                </details>
                <div style={{ marginTop: 8, fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 650 }}>Priority {edge.priority} · Confidence {Math.round(edge.confidence * 100)}% · 最終研究 {formatDate(edge.lastResearchAt)} · Registry更新 {edge.lastUpdate}</div>
              </article>
            )
          })}
        </div>

        {data.checkpoint && (
          <>
            <SectionTitle id="checkpoint" title="今の研究メモ" meta={`Checkpoint #${data.checkpoint.sequence}`} />
            <section style={{ ...cardStyle, padding: '14px 15px' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 750 }}>保存 {formatDate(data.checkpoint.savedAt)}</div>
              <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 600 }}>{data.checkpoint.researchDone}</div>
              <details style={{ marginTop: 10 }} open>
                <summary style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 850, color: 'var(--amber)' }}>不足しているもの</summary>
                <div style={{ marginTop: 6 }}><MiniList items={data.checkpoint.dataGaps} /></div>
              </details>
              <details style={{ marginTop: 9 }} open>
                <summary style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 850, color: 'var(--sky-deep)' }}>次に調べる候補</summary>
                <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                  {data.checkpoint.nextCandidates.map((candidate) => <div key={candidate.edgeId} style={{ padding: '8px 9px', borderRadius: 9, background: 'var(--sky-soft)', fontSize: 11, lineHeight: 1.5, color: 'var(--ink-2)' }}><strong>{candidate.edgeId}</strong><br />{candidate.why}</div>)}
                </div>
              </details>
            </section>
          </>
        )}

        <SectionTitle id="research-timeline" title="最近の研究履歴" meta={`${data.timeline.length}件表示`} />
        <div style={{ display: 'grid', gap: 8 }}>
          {data.timeline.map((entry) => (
            <article key={entry.id} style={{ ...cardStyle, padding: '11px 13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0, fontSize: 10, color: 'var(--accent)', fontWeight: 850 }}>{entry.edgeId ?? entry.type}</div>
                <div style={{ flexShrink: 0, fontSize: 9, color: 'var(--ink-3)', fontWeight: 650 }}>{formatDate(entry.at)}</div>
              </div>
              <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.6, color: 'var(--ink)', fontWeight: 700 }}>{entry.summary}</div>
              {(entry.findings.length > 0 || entry.dataGaps.length > 0 || entry.nextActions.length > 0 || entry.rejectionReason) && (
                <details style={{ marginTop: 7 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>詳細</summary>
                  <div style={{ marginTop: 7, display: 'grid', gap: 9 }}>
                    {entry.rejectionReason && <div><div style={{ fontSize: 10, fontWeight: 850, color: 'var(--accent)', marginBottom: 3 }}>反証・棄却</div><div style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--ink-2)' }}>{entry.rejectionReason}</div></div>}
                    {entry.findings.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 850, color: 'var(--mint-deep)', marginBottom: 3 }}>分かったこと</div><MiniList items={entry.findings} limit={3} /></div>}
                    {entry.dataGaps.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 850, color: 'var(--amber)', marginBottom: 3 }}>まだ不足</div><MiniList items={entry.dataGaps} limit={3} /></div>}
                    {entry.nextActions.length > 0 && <div><div style={{ fontSize: 10, fontWeight: 850, color: 'var(--sky-deep)', marginBottom: 3 }}>次にやること</div><MiniList items={entry.nextActions} limit={3} /></div>}
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>

        <div style={{ marginTop: 15, padding: '11px 13px', borderRadius: 13, border: '1px dashed var(--line)', color: 'var(--ink-3)', fontSize: 11, lineHeight: 1.6 }}>
          この下にResearchFamily / Historical Analog / Case / ResearchComponent / Lineage / StudyのKnowledge Mapが続きます。
        </div>
      </div>
    </>
  )
}
