import type { CSSProperties } from 'react'
import {
  loadOwnerResearchSummary,
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

const QUESTION_STATUS: Record<OwnerResearchQuestionStatus, string> = {
  open: '未解決',
  partially_answered: '一部判明',
  answered: '回答済み',
  blocked: 'データ待ち',
  obsolete: '対象外',
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
          Edgeになる前の調査も含めて、いま考えていることを見える化
        </div>
      </div>

      <div style={{ padding: '14px 14px 28px' }}>
        {data.warning && (
          <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700 }}>
            ⚠ {data.warning}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))', gap: 8, marginBottom: 12 }}>
          <div style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>研究中</div>
            <div style={{ marginTop: 2, fontSize: 24, lineHeight: 1, color: 'var(--ink)', fontWeight: 850 }}>{data.counts.activeResearchItems}</div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>ResearchItem</div>
          </div>
          <div style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>未解決の問い</div>
            <div style={{ marginTop: 2, fontSize: 24, lineHeight: 1, color: 'var(--ink)', fontWeight: 850 }}>{data.counts.unresolvedQuestions}</div>
            <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-3)' }}>次に確かめること</div>
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
            「調査中」は売買推奨ではありません。まだEdgeになっていないアイディアも残し、分かっていることと未解決の問いを分けて表示します。
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>
            最終研究更新: {formatDate(data.latestResearchAt)}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '0 2px 8px' }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)', fontWeight: 850 }}>いま研究していること</h2>
          <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{data.counts.researchItems}件</span>
        </div>

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

                <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink-2)', fontWeight: 570 }}>
                  {item.summary}
                </div>

                <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--ink-3)', letterSpacing: 0.2 }}>まだ分からないこと</div>
                  {item.questions.length === 0 ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>未解決のResearchQuestionはありません。</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 7, marginTop: 7 }}>
                      {item.questions.map((question) => (
                        <div key={question.id} style={{ padding: '9px 10px', borderRadius: 11, background: 'var(--surface-2)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ fontSize: 10, fontWeight: 850, color: question.status === 'open' ? 'var(--accent)' : 'var(--ink-3)' }}>
                              {QUESTION_STATUS[question.status]}
                            </span>
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9.5, color: 'var(--ink-3)' }}>
                              {question.id}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.58, color: 'var(--ink-2)', fontWeight: 600 }}>{question.question}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 650 }}>
                  更新: {formatDate(item.lastReviewedAt ?? item.createdAt)}
                </div>
              </article>
            )
          })}
        </div>

        {data.researchItems.length === 0 && (
          <div style={{ ...cardStyle, marginTop: 8, padding: '24px 16px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
            表示できるResearchItemがありません。
          </div>
        )}

        <div style={{ marginTop: 15, padding: '11px 13px', borderRadius: 13, border: '1px dashed var(--line)', color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.6 }}>
          次の実装: Formal Edgeの進捗、研究タイムライン、Checkpoint、Historical Analogをこの画面へ統合します。
        </div>
      </div>
    </>
  )
}
