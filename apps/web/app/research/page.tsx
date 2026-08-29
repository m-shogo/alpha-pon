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
  research: { label: '検証中', tone: 'var(--accent)', background: 'var(--rose-soft)' },
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

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '18px 2px 8px' }}>
      <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)', fontWeight: 850 }}>{title}</h2>
      {meta && <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{meta}</span>}
    </div>
  )
}

function MiniList({ items, limit = 4 }: { items: string[]; limit?: number }) {
  if (items.length === 0) return <div style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>該当なし</div>
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

export default function ResearchPage() {
  const data = loadOwnerResearchSummary()

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
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.4, marginBottom: 3 }}>
          RESEARCH / OWNER VIEW
        </div>
        <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 27, color: 'var(--ink)', letterSpacing: 0.1 }}>
          研究ダッシュボード
        </h1>
        <div style={{ marginTop: 5, fontSize: 12, color: 'var(--ink-3)', fontWeight: 650 }}>
          アイディア → 調査 → Edge検証まで、途中経過を含めて見る
        </div>
      </div>

      <div style={{ padding: '14px 14px 28px' }}>
        {data.warning && (
          <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700 }}>
            ⚠ {data.warning}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 8, marginBottom: 12 }}>
          <div style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>研究テーマ</div>
            <div style={{ marginTop: 2, fontSize: 24, lineHeight: 1, color: 'var(--ink)', fontWeight: 850 }}>{data.counts.activeResearchItems}</div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>進行中</div>
          </div>
          <div style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>Formal Edge</div>
            <div style={{ marginTop: 2, fontSize: 24, lineHeight: 1, color: 'var(--ink)', fontWeight: 850 }}>{data.counts.activeFormalEdges}</div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>検証対象</div>
          </div>
          <div style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>未解決の問い</div>
            <div style={{ marginTop: 2, fontSize: 24, lineHeight: 1, color: 'var(--ink)', fontWeight: 850 }}>{data.counts.unresolvedQuestions}</div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>次に確認</div>
          </div>
          <div style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>整合性</div>
            <div style={{ marginTop: 3, fontSize: 16, lineHeight: 1.2, color: data.integrity.status === 'ok' ? 'var(--mint-deep)' : 'var(--amber)', fontWeight: 850 }}>
              {data.integrity.status === 'ok' ? '正常' : '要確認'}
            </div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>issue {data.integrity.issueCount}</div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: '12px 14px', marginBottom: 15, background: 'var(--lavender-soft)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--lavender-deep)' }}>この画面の読み方</div>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 600 }}>
            ResearchItemは「調べる価値がある問い」、Formal Edgeは「再現性を検証する段階」です。どちらも売買推奨ではありません。Gate 0/11は0点ではなく、検証がまだ通っていないことを意味します。
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>
            最終研究更新: {formatDate(data.latestResearchAt)}
          </div>
        </div>

        <SectionTitle title="いま研究していること" meta={`${data.counts.researchItems}件`} />
        <div style={{ display: 'grid', gap: 10 }}>
          {data.researchItems.map((item) => {
            const status = ITEM_STATUS[item.status]
            return (
              <article key={item.id} style={{ ...cardStyle, padding: '14px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 750, marginBottom: 3 }}>{item.id}</div>
                    <h3 style={{ margin: 0, fontSize: 16.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{item.title}</h3>
                  </div>
                  <span style={{ flexShrink: 0, padding: '5px 8px', borderRadius: 999, background: status.background, color: status.tone, fontSize: 10.5, fontWeight: 850 }}>
                    {status.label}
                  </span>
                </div>

                {item.families.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
                    {item.families.map((family) => (
                      <span key={family.id} style={{ padding: '4px 7px', borderRadius: 8, background: 'var(--sky-soft)', color: 'var(--sky-deep)', fontSize: 10.5, fontWeight: 750 }}>
                        {family.title}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink-2)', fontWeight: 570 }}>{item.summary}</div>

                <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--ink-3)', letterSpacing: 0.2 }}>まだ分からないこと</div>
                  {item.questions.length === 0 ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>未解決のResearchQuestionはありません。</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 7, marginTop: 7 }}>
                      {item.questions.map((question) => (
                        <div key={question.id} style={{ padding: '9px 10px', borderRadius: 11, background: 'var(--surface-2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 850, color: question.status === 'open' ? 'var(--accent)' : 'var(--ink-3)' }}>{QUESTION_STATUS[question.status]}</span>
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9.5, color: 'var(--ink-3)' }}>{question.id}</span>
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.58, color: 'var(--ink-2)', fontWeight: 600 }}>{question.question}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>更新: {formatDate(item.lastReviewedAt ?? item.createdAt)}</div>
              </article>
            )
          })}
        </div>

        <SectionTitle title="Formal Edge — 検証はどこまで進んだ？" meta={`${data.counts.formalEdges}件`} />
        <div style={{ display: 'grid', gap: 10 }}>
          {data.formalEdges.map((edge) => {
            const status = EDGE_STATUS[edge.status]
            return (
              <article key={edge.id} style={{ ...cardStyle, padding: '14px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 750 }}>{edge.id}</div>
                    <h3 style={{ margin: '3px 0 0', fontSize: 16, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{edge.title}</h3>
                  </div>
                  <span style={{ flexShrink: 0, padding: '5px 8px', borderRadius: 999, background: status.background, color: status.tone, fontSize: 10.5, fontWeight: 850 }}>{status.label}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 11 }}>
                  <div style={{ padding: '8px 9px', borderRadius: 10, background: 'var(--surface-2)' }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 750 }}>Sample</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--ink)', fontWeight: 850 }}>{edge.samples.current}/{edge.samples.required}</div>
                  </div>
                  <div style={{ padding: '8px 9px', borderRadius: 10, background: 'var(--surface-2)' }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 750 }}>Analog</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--ink)', fontWeight: 850 }}>{edge.samples.analogCurrent}/{edge.samples.analogRequired}</div>
                  </div>
                  <div style={{ padding: '8px 9px', borderRadius: 10, background: 'var(--surface-2)' }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 750 }}>Gate</div>
                    <div style={{ marginTop: 2, fontSize: 12.5, color: edge.gate.pass === edge.gate.total ? 'var(--mint-deep)' : 'var(--amber)', fontWeight: 850 }}>{edge.gate.pass}/{edge.gate.total}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 600 }}>{edge.hypothesis}</div>

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--accent)', fontWeight: 850 }}>未検証ポイントを見る</summary>
                  <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                    {edge.verificationGaps.slice(0, 6).map((gap) => (
                      <div key={gap.key} style={{ padding: '8px 9px', borderRadius: 10, background: 'var(--surface-2)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 850, color: gap.state === 'fail' ? 'var(--accent)' : 'var(--amber)' }}>
                          {GATE_LABELS[gap.key] ?? gap.key} · {gap.state === 'fail' ? '未通過' : '未確認'}
                        </div>
                        {gap.explanation && <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 580 }}>{gap.explanation}</div>}
                      </div>
                    ))}
                  </div>
                </details>

                <div style={{ marginTop: 9, fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>
                  Priority {edge.priority} · Confidence {Math.round(edge.confidence * 100)}% · 更新 {edge.lastUpdate}
                </div>
              </article>
            )
          })}
        </div>

        {data.checkpoint && (
          <>
            <SectionTitle title="今の研究メモ" meta={`Checkpoint #${data.checkpoint.sequence}`} />
            <section style={{ ...cardStyle, padding: '14px 15px' }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 750 }}>保存 {formatDate(data.checkpoint.savedAt)}</div>
              <div style={{ marginTop: 7, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink-2)', fontWeight: 600 }}>{data.checkpoint.researchDone}</div>

              <div style={{ marginTop: 12, fontSize: 11, fontWeight: 850, color: 'var(--accent)' }}>不足しているもの</div>
              <div style={{ marginTop: 6 }}><MiniList items={data.checkpoint.dataGaps} /></div>

              <div style={{ marginTop: 12, fontSize: 11, fontWeight: 850, color: 'var(--sky-deep)' }}>次に調べる候補</div>
              <div style={{ display: 'grid', gap: 7, marginTop: 6 }}>
                {data.checkpoint.nextCandidates.map((candidate) => (
                  <div key={candidate.edgeId} style={{ padding: '9px 10px', borderRadius: 10, background: 'var(--sky-soft)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--sky-deep)' }}>{candidate.edgeId}</div>
                    <div style={{ marginTop: 3, fontSize: 11.5, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 600 }}>{candidate.why}</div>
                  </div>
                ))}
              </div>

              {data.checkpoint.openQuestions.length > 0 && (
                <details style={{ marginTop: 11 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 800 }}>残っている判断・問い</summary>
                  <div style={{ marginTop: 7 }}><MiniList items={data.checkpoint.openQuestions} limit={6} /></div>
                </details>
              )}
            </section>
          </>
        )}

        <SectionTitle title="最近の研究履歴" meta={`${data.timeline.length}件表示`} />
        <div style={{ display: 'grid', gap: 8 }}>
          {data.timeline.map((entry) => (
            <article key={entry.id} style={{ ...cardStyle, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ minWidth: 0, fontSize: 10.5, color: 'var(--accent)', fontWeight: 850 }}>{entry.edgeId ?? entry.type}</div>
                <div style={{ flexShrink: 0, fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 650 }}>{formatDate(entry.at)}</div>
              </div>
              <div style={{ marginTop: 5, fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink)', fontWeight: 700 }}>{entry.summary}</div>
              {(entry.findings.length > 0 || entry.dataGaps.length > 0 || entry.nextActions.length > 0) && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)', fontWeight: 800 }}>詳しく見る</summary>
                  <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                    {entry.findings.length > 0 && <div><div style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--mint-deep)', marginBottom: 4 }}>分かったこと</div><MiniList items={entry.findings} limit={3} /></div>}
                    {entry.dataGaps.length > 0 && <div><div style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--amber)', marginBottom: 4 }}>まだ不足</div><MiniList items={entry.dataGaps} limit={3} /></div>}
                    {entry.nextActions.length > 0 && <div><div style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--sky-deep)', marginBottom: 4 }}>次にやること</div><MiniList items={entry.nextActions} limit={3} /></div>}
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>

        <div style={{ marginTop: 15, padding: '11px 13px', borderRadius: 13, border: '1px dashed var(--line)', color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.6 }}>
          次の実装: Historical Analogを成功・非回復・悪化・Controlまで同格で表示し、ResearchFamilyから研究のつながりを辿れるようにします。
        </div>
      </div>
    </>
  )
}
