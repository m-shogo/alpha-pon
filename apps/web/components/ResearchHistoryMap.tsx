import type { CSSProperties } from 'react'
import {
  loadOwnerResearchHistoryMap,
  type OwnerHistoricalAnalogVerdict,
  type OwnerResearchComponentKind,
  type OwnerResearchLineageType,
} from '@/lib/research-history-map'

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--card-line)',
  borderRadius: 18,
  boxShadow: 'var(--shadow)',
}

const OUTCOME_LABELS: Record<OwnerHistoricalAnalogVerdict, { label: string; tone: string; background: string }> = {
  repriced_up: { label: '上方向に再評価', tone: 'var(--mint-deep)', background: 'var(--mint-soft)' },
  repriced_down: { label: '下方向に再評価', tone: 'var(--accent)', background: 'var(--rose-soft)' },
  no_move: { label: '明確な動きなし', tone: 'var(--sky-deep)', background: 'var(--sky-soft)' },
  unresolved: { label: '未解決', tone: 'var(--amber)', background: 'var(--amber-soft)' },
}

const COMPONENT_KIND_LABELS: Record<OwnerResearchComponentKind, string> = {
  phase: 'フェーズ',
  subsignal: 'サブシグナル',
  filter: 'フィルター',
  cohort: 'コホート',
  calibration: 'キャリブレーション',
  guard: 'ガード',
  fixture: 'フィクスチャ',
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '18px 2px 8px' }}>
      <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)', fontWeight: 850 }}>{title}</h2>
      {meta && <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{meta}</span>}
    </div>
  )
}

function EmptyAnalogState() {
  return (
    <div style={{ ...cardStyle, padding: '18px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 7 }}>🧪</div>
      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 850 }}>正式なHistorical Analogはまだ0件です</div>
      <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.65, color: 'var(--ink-3)', fontWeight: 600 }}>
        0件を隠さず表示します。将来も、上がった事例だけを後付けせず、下落・無反応・未解決を同じ基準で残します。
      </div>
    </div>
  )
}

export default function ResearchHistoryMap() {
  const data = loadOwnerResearchHistoryMap()

  return (
    <div style={{ padding: '0 14px 28px' }}>
      {data.warning && (
        <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 12, background: 'var(--amber-soft)', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700 }}>
          ⚠ {data.warning}
        </div>
      )}

      <SectionTitle title="研究のつながり" meta={`${data.counts.families} Family`} />
      <div style={{ display: 'grid', gap: 10 }}>
        {data.families.map((family) => (
          <article key={family.id} style={{ ...cardStyle, padding: '14px 15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 750 }}>{family.id}</div>
                <h3 style={{ margin: '3px 0 0', fontSize: 16, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{family.title}</h3>
              </div>
              <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, background: family.status === 'active' ? 'var(--mint-soft)' : 'var(--surface-2)', color: family.status === 'active' ? 'var(--mint-deep)' : 'var(--ink-3)', fontSize: 10, fontWeight: 850 }}>
                {family.status === 'active' ? 'Active' : 'Deprecated'}
              </span>
            </div>

            <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.65, color: 'var(--ink-2)', fontWeight: 600 }}>{family.description}</div>

            <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 850, marginBottom: 7 }}>このFamilyに属する研究</div>
              {family.members.length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>まだ紐づく研究はありません。</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {family.members.map((member) => (
                    <div key={`${member.type}:${member.id}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 9px', borderRadius: 10, background: member.type === 'edge' ? 'var(--lavender-soft)' : 'var(--sky-soft)' }}>
                      <span style={{ flexShrink: 0, padding: '2px 5px', borderRadius: 6, background: 'var(--surface)', fontSize: 9.5, color: member.type === 'edge' ? 'var(--lavender-deep)' : 'var(--sky-deep)', fontWeight: 850 }}>
                        {member.type === 'edge' ? 'EDGE' : 'ITEM'}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--ink)', fontWeight: 780 }}>{member.title}</div>
                        <div style={{ marginTop: 2, fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 650 }}>{member.id} · {member.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <SectionTitle title="過去事例 — Historical Analog" meta={`${data.counts.historicalAnalogs}件`} />
      <div style={{ ...cardStyle, padding: '11px 13px', marginBottom: 9, background: 'var(--surface-2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 800 }}>結論あり</div>
            <div style={{ marginTop: 2, fontSize: 18, color: 'var(--ink)', fontWeight: 850 }}>{data.counts.resolvedOutcomes}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 800 }}>未解決・未計測</div>
            <div style={{ marginTop: 2, fontSize: 18, color: 'var(--amber)', fontWeight: 850 }}>{data.counts.unresolvedOutcomes}</div>
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-3)', fontWeight: 600 }}>
          Outcomeの方向で表示優先度を変えません。勝ち事例・負け事例・無反応を同格で残します。
        </div>
      </div>

      {data.historicalAnalogs.length === 0 ? (
        <EmptyAnalogState />
      ) : (
        <div style={{ display: 'grid', gap: 9 }}>
          {data.historicalAnalogs.map((analog) => {
            const outcome = analog.outcome ? OUTCOME_LABELS[analog.outcome.verdict] : null
            return (
              <article key={analog.id} style={{ ...cardStyle, padding: '13px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700 }}>{analog.eventDate} · {analog.eventType}</div>
                    <h3 style={{ margin: '3px 0 0', fontSize: 14.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{analog.companyName} {analog.companyCode}</h3>
                  </div>
                  <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, background: outcome?.background ?? 'var(--surface-2)', color: outcome?.tone ?? 'var(--ink-3)', fontSize: 9.5, fontWeight: 850 }}>{outcome?.label ?? '未計測'}</span>
                </div>

                <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 600 }}>{analog.summary}</div>

                {analog.edgeIds.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {analog.edgeIds.map((edgeId) => (
                      <span key={edgeId} style={{ padding: '3px 6px', borderRadius: 7, background: 'var(--lavender-soft)', color: 'var(--lavender-deep)', fontSize: 9.5, fontWeight: 750 }}>{edgeId}</span>
                    ))}
                  </div>
                )}

                {analog.dataGaps.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--amber)', fontWeight: 800 }}>不足データ {analog.dataGaps.length}件</summary>
                    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                      {analog.dataGaps.map((gap) => (
                        <div key={gap} style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--ink-3)', fontWeight: 600 }}>• {gap}</div>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            )
          })}
        </div>
      )}

      <SectionTitle title="登録済みCase — 実際に見ている事例" meta={`${data.counts.cases}件`} />
      <div style={{ display: 'grid', gap: 9 }}>
        {data.cases.map((researchCase) => (
          <article key={researchCase.id} style={{ ...cardStyle, padding: '13px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700 }}>{researchCase.id}</div>
                <h3 style={{ margin: '3px 0 0', fontSize: 14.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{researchCase.title}</h3>
              </div>
              <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, background: researchCase.status === 'open' ? 'var(--amber-soft)' : 'var(--surface-2)', color: researchCase.status === 'open' ? 'var(--amber)' : 'var(--ink-3)', fontSize: 9.5, fontWeight: 850 }}>
                {researchCase.status === 'open' ? 'Open' : researchCase.status === 'closed' ? 'Closed' : 'Archived'}
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 600 }}>{researchCase.summary}</div>
            {(researchCase.episodeStart || researchCase.episodeEnd) && (
              <div style={{ marginTop: 7, fontSize: 10, color: 'var(--ink-3)', fontWeight: 650 }}>
                Episode: {researchCase.episodeStart ?? '未記録'} → {researchCase.episodeEnd ?? '継続中'}
              </div>
            )}
            {researchCase.relations.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {researchCase.relations.map((relation) => (
                  <span key={`${relation.relationType}:${relation.targetType}:${relation.targetId}`} style={{ padding: '3px 6px', borderRadius: 7, background: 'var(--sky-soft)', color: 'var(--sky-deep)', fontSize: 9.5, fontWeight: 750 }}>
                    {relation.relationType} → {relation.targetType}:{relation.targetId}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
        {data.cases.length === 0 && <div style={{ ...cardStyle, padding: '16px', color: 'var(--ink-3)', fontSize: 11.5 }}>正式Caseはまだ0件です。</div>}
      </div>

      <SectionTitle title="研究の分解パーツ" meta={`${data.counts.researchComponents}件`} />
      <div style={{ display: 'grid', gap: 7 }}>
        {data.researchComponents.map((component) => (
          <article key={component.id} style={{ ...cardStyle, padding: '11px 12px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, padding: '3px 6px', borderRadius: 7, background: 'var(--lavender-soft)', color: 'var(--lavender-deep)', fontSize: 9.5, fontWeight: 850 }}>
                {COMPONENT_KIND_LABELS[component.kind]}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 820 }}>{component.title}</div>
                <div style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 580 }}>{component.description}</div>
                {component.edgeIds.length > 0 && (
                  <div style={{ marginTop: 5, fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700 }}>Edge: {component.edgeIds.join(' / ')}</div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <SectionTitle title="研究の統合・継承履歴" meta={`${data.counts.lineages}件`} />
      <div style={{ display: 'grid', gap: 8 }}>
        {data.lineages.map((lineage) => (
          <article key={lineage.id} style={{ ...cardStyle, padding: '12px 13px' }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 850 }}>{LINEAGE_LABELS[lineage.lineageType]} · {lineage.decidedAt}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 7, alignItems: 'center', marginTop: 8 }}>
              <div style={{ padding: '8px', borderRadius: 9, background: 'var(--surface-2)', minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink)', fontWeight: 800 }}>{lineage.sourceTitle}</div>
                <div style={{ marginTop: 2, fontSize: 9, color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>{lineage.sourceId}</div>
              </div>
              <div style={{ color: 'var(--ink-3)', fontWeight: 900 }}>→</div>
              <div style={{ padding: '8px', borderRadius: 9, background: 'var(--lavender-soft)', minWidth: 0 }}>
                <div style={{ fontSize: 10.5, color: 'var(--ink)', fontWeight: 800 }}>{lineage.targetTitle}</div>
                <div style={{ marginTop: 2, fontSize: 9, color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>{lineage.targetId}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 600 }}>{lineage.reason}</div>
          </article>
        ))}
      </div>

      <SectionTitle title="正式Study / Result" meta={`${data.counts.studies} Study · ${data.counts.studyResults} Result`} />
      <div style={{ ...cardStyle, padding: '14px 15px', background: 'var(--surface-2)' }}>
        {data.counts.studies === 0 && data.counts.studyResults === 0 ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 850 }}>正式なStudy正本はまだありません</div>
            <div style={{ marginTop: 5, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-3)', fontWeight: 600 }}>
              提案文書をStudy扱いにはしません。研究設計と結果がCatalogへ正式登録された時だけ、この件数が増えます。
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 650 }}>Study / Resultの正本件数を表示しています。詳細カードは次の表示拡張で追加します。</div>
        )}
      </div>

      <div style={{ marginTop: 15, padding: '11px 13px', borderRadius: 13, border: '1px dashed var(--line)', color: 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.6 }}>
        次の仕上げ: スマホで情報量が多すぎないかをQAし、重要度順の折りたたみ・見出し導線を調整します。表示は引き続きread-onlyで、Research Gateや売買判断は変更しません。
      </div>
    </div>
  )
}
