import styles from './ResearchHistoryMap.module.css'
import {
  loadOwnerResearchHistoryMap,
  type OwnerHistoricalAnalogVerdict,
  type OwnerResearchComponentKind,
  type OwnerResearchLineageType,
} from '@/lib/research-history-map'

const OUTCOME_LABELS: Record<OwnerHistoricalAnalogVerdict, { label: string; tone: string }> = {
  repriced_up: { label: '上方向に再評価', tone: 'green' },
  repriced_down: { label: '下方向に再評価', tone: 'red' },
  no_move: { label: '明確な動きなし', tone: 'blue' },
  unresolved: { label: '未解決', tone: 'amber' },
}

const COMPONENT_KIND_LABELS: Record<OwnerResearchComponentKind, string> = {
  phase: 'フェーズ',
  subsignal: 'サブシグナル',
  filter: 'フィルター',
  cohort: '比較集団',
  calibration: '調整',
  guard: '安全条件',
  fixture: '検証用データ',
}

const LINEAGE_LABELS: Record<OwnerResearchLineageType, string> = {
  derived_from: '派生',
  merged_into: '統合',
  split_into: '分割',
  supersedes: '置換',
  reclassified_as: '再分類',
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="ap-history-section-title">
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  )
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ap-history-empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

export default function ResearchHistoryMap() {
  const data = loadOwnerResearchHistoryMap()

  return (
    <div className={`${styles.root} ap-history-map`}>
      {data.warning && <div className="ap-history-warning">⚠ {data.warning}</div>}

      <SectionTitle title="研究のつながり" meta={`${data.counts.families}件`} />
      <section className="ap-history-group" aria-label="研究ファミリー一覧">
        {data.families.length === 0 && <EmptyState title="研究のまとまりはまだありません">正式な研究ファミリーが登録されると、関連する研究テーマとEdgeのつながりをここに表示します。</EmptyState>}
        {data.families.map((family) => (
          <article className="ap-history-family-row" key={family.id}>
            <div className="ap-history-row-head">
              <div>
                <div className="ap-history-kicker">{family.id}</div>
                <h3>{family.title}</h3>
              </div>
              <span className={`ap-status-badge tone-${family.status === 'active' ? 'green' : 'gray'}`}>
                {family.status === 'active' ? '有効' : '統合・終了'}
              </span>
            </div>
            <p className="ap-history-description">{family.description}</p>
            <details className="ap-row-disclosure">
              <summary>このまとまりに属する研究 {family.members.length}件</summary>
              {family.members.length === 0 ? (
                <p className="ap-research-empty">まだ紐づく研究はありません。</p>
              ) : (
                <div className="ap-history-member-list">
                  {family.members.map((member) => (
                    <div className="ap-history-member-row" key={`${member.type}:${member.id}`}>
                      <span>{member.type === 'edge' ? '正式Edge' : '研究テーマ'}</span>
                      <div>
                        <strong>{member.title}</strong>
                        <small>{member.id} · {member.status}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </article>
        ))}
      </section>

      <SectionTitle title="過去類似事例" meta={`${data.counts.historicalAnalogs}件`} />
      <div className="ap-history-outcome-summary">
        <div><span>結論あり</span><strong>{data.counts.resolvedOutcomes}</strong></div>
        <div><span>未解決・未計測</span><strong>{data.counts.unresolvedOutcomes}</strong></div>
        <p>結果の方向で表示優先度を変えず、上昇・下落・無反応・未解決を同じ基準で残します。</p>
      </div>

      <section className="ap-history-group" aria-label="過去類似事例一覧">
        {data.historicalAnalogs.length === 0 && (
          <EmptyState title="正式な過去類似事例はまだ0件です">0件を隠さず表示します。将来も上がった事例だけを後付けせず、下落・無反応・未解決を同じ基準で残します。</EmptyState>
        )}
        {data.historicalAnalogs.map((analog) => {
          const outcome = analog.outcome ? OUTCOME_LABELS[analog.outcome.verdict] : null
          return (
            <article className="ap-history-analog-row" key={analog.id}>
              <div className="ap-history-analog-main">
                <div>
                  <div className="ap-history-kicker">{analog.eventDate} · {analog.eventType}</div>
                  <h3>{analog.companyName} {analog.companyCode}</h3>
                </div>
                <span className={`ap-status-badge tone-${outcome?.tone ?? 'gray'}`}>{outcome?.label ?? '未計測'}</span>
              </div>
              <p className="ap-history-description">{analog.summary}</p>
              {(analog.edgeIds.length > 0 || analog.dataGaps.length > 0) && (
                <details className="ap-row-disclosure">
                  <summary>関連Edge・不足データを見る</summary>
                  <div className="ap-history-analog-details">
                    {analog.edgeIds.length > 0 && (
                      <section>
                        <h4>関連する正式Edge</h4>
                        <div className="ap-inline-id-list">{analog.edgeIds.map((edgeId) => <span key={edgeId}>{edgeId}</span>)}</div>
                      </section>
                    )}
                    {analog.dataGaps.length > 0 && (
                      <section>
                        <h4>不足データ</h4>
                        <ul>{analog.dataGaps.map((gap, index) => <li key={`${index}-${gap}`}>{gap}</li>)}</ul>
                      </section>
                    )}
                  </div>
                </details>
              )}
            </article>
          )
        })}
      </section>

      <SectionTitle title="登録済み事例" meta={`${data.counts.cases}件`} />
      <section className="ap-history-group" aria-label="登録済み事例一覧">
        {data.cases.length === 0 && <EmptyState title="正式な個別事例はまだ0件です">個別の研究エピソードが正式登録されるとここに表示します。</EmptyState>}
        {data.cases.map((researchCase) => (
          <article className="ap-history-case-row" key={researchCase.id}>
            <div className="ap-history-row-head">
              <div>
                <div className="ap-history-kicker">{researchCase.id}</div>
                <h3>{researchCase.title}</h3>
              </div>
              <span className={`ap-status-badge tone-${researchCase.status === 'open' ? 'amber' : 'gray'}`}>
                {researchCase.status === 'open' ? '調査中' : researchCase.status === 'closed' ? '終了' : 'アーカイブ'}
              </span>
            </div>
            <p className="ap-history-description">{researchCase.summary}</p>
            {(researchCase.episodeStart || researchCase.episodeEnd) && (
              <div className="ap-history-meta">期間: {researchCase.episodeStart ?? '未記録'} → {researchCase.episodeEnd ?? '継続中'}</div>
            )}
            {researchCase.relations.length > 0 && (
              <details className="ap-row-disclosure">
                <summary>関連付け {researchCase.relations.length}件</summary>
                <div className="ap-history-relation-list">
                  {researchCase.relations.map((relation) => (
                    <div key={`${relation.relationType}:${relation.targetType}:${relation.targetId}`}>
                      <span>{relation.relationType}</span>
                      <strong>{relation.targetType}:{relation.targetId}</strong>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
      </section>

      <SectionTitle title="研究の分解パーツ" meta={`${data.counts.researchComponents}件`} />
      <section className="ap-history-group" aria-label="研究コンポーネント一覧">
        {data.researchComponents.length === 0 && <EmptyState title="研究パーツはまだありません">研究を構成するフェーズ・フィルター・比較集団などが正式登録されると表示します。</EmptyState>}
        {data.researchComponents.map((component) => (
          <article className="ap-history-component-row" key={component.id}>
            <span className="ap-history-component-kind">{COMPONENT_KIND_LABELS[component.kind]}</span>
            <div>
              <h3>{component.title}</h3>
              <p>{component.description}</p>
              {component.edgeIds.length > 0 && <small>正式Edge: {component.edgeIds.join(' / ')}</small>}
            </div>
          </article>
        ))}
      </section>

      <SectionTitle title="研究の統合・継承履歴" meta={`${data.counts.lineages}件`} />
      <section className="ap-history-lineage" aria-label="研究の統合・継承履歴">
        {data.lineages.length === 0 && <EmptyState title="統合・継承履歴はまだありません">研究の派生・統合・分割・置換が正式登録されるとここに残ります。</EmptyState>}
        {data.lineages.map((lineage) => (
          <article className="ap-history-lineage-row" key={lineage.id}>
            <div className="ap-history-lineage-meta">{LINEAGE_LABELS[lineage.lineageType]} · {lineage.decidedAt}</div>
            <div className="ap-history-lineage-flow">
              <div><strong>{lineage.sourceTitle}</strong><small>{lineage.sourceId}</small></div>
              <span aria-hidden="true">→</span>
              <div><strong>{lineage.targetTitle}</strong><small>{lineage.targetId}</small></div>
            </div>
            <p>{lineage.reason}</p>
          </article>
        ))}
      </section>

      <SectionTitle title="正式な検証設計・結果" meta={`検証設計 ${data.counts.studies}件 · 結果 ${data.counts.studyResults}件`} />
      <section className="ap-history-study-summary">
        {data.counts.studies === 0 && data.counts.studyResults === 0 ? (
          <>
            <strong>正式な検証設計はまだありません</strong>
            <p>提案文書を検証設計扱いにはしません。研究設計と結果が研究カタログへ正式登録された時だけ、この件数が増えます。</p>
          </>
        ) : (
          <>
            <strong>正式登録された検証設計・結果があります</strong>
            <p>下の検証表示で、研究設計と実測結果を分けて確認できます。</p>
          </>
        )}
      </section>
    </div>
  )
}
