import type { CSSProperties } from 'react'
import {
  loadOwnerResearchHistoryMap,
  type OwnerResearchExploitability,
  type OwnerResearchIdentificationQuality,
  type OwnerResearchNegativeFinding,
  type OwnerResearchStudyMode,
  type OwnerResearchStudyStatus,
} from '@/lib/research-history-map'

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--card-line)',
  borderRadius: 18,
  boxShadow: 'var(--shadow)',
}

const MODE_LABELS: Record<OwnerResearchStudyMode, string> = {
  exploratory: '探索',
  calibration: '調整',
  confirmatory: '確認',
  holdout: 'Holdout',
  out_of_sample: 'Out-of-sample',
  revalidation: '再検証',
}

const STATUS_LABELS: Record<OwnerResearchStudyStatus, string> = {
  draft: 'Draft',
  registered: '登録済み',
  running: '実行中',
  completed: '完了',
  cancelled: '中止',
  archived: 'Archive',
}

const IDENTIFICATION_LABELS: Record<OwnerResearchIdentificationQuality, string> = {
  unidentified: '因果未識別',
  descriptive: '記述的',
  correlational: '相関',
  suggestive_causal: '因果を示唆',
  strong_causal: '強い因果根拠',
}

const EXPLOITABILITY_LABELS: Record<OwnerResearchExploitability, string> = {
  unknown: '実用性未判定',
  observed_effect_only: '観測効果のみ',
  statistical_edge: '統計的Edge候補',
  economic_edge: '経済的Edge候補',
  executable_edge: '執行可能性あり',
  not_executable: '執行困難',
}

const NEGATIVE_LABELS: Record<OwnerResearchNegativeFinding, string> = {
  wrong_mechanism: '想定メカニズム不一致',
  already_priced_in: '織り込み済み',
  no_effect: '効果なし',
  inverse_effect: '逆方向の効果',
  confounded: '交絡あり',
  not_executable: '執行不能',
  regime_dependent: 'レジーム依存',
  data_artifact: 'データ由来の見かけ',
  false_analogy: '類似事例が不適切',
  selection_bias: '選択バイアス',
  insufficient_sample: 'サンプル不足',
}

function formatDate(value?: string): string {
  if (!value) return '未記録'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

export default function ResearchStudyMap() {
  const data = loadOwnerResearchHistoryMap()
  const knownStudyIds = new Set(data.studies.map((study) => study.id))
  const unmatchedResults = data.studyResults.filter((result) => !knownStudyIds.has(result.studyId))

  return (
    <section style={{ padding: '0 14px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '18px 2px 8px' }}>
        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)', fontWeight: 850 }}>検証Study — どう確かめる？</h2>
        <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{data.counts.studies} Study / {data.counts.studyResults} Result</span>
      </div>

      <div style={{ ...cardStyle, padding: '10px 12px', marginBottom: 9, background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--ink-3)', fontWeight: 650 }}>
          Studyは「どう確かめるか」を固定する検証単位です。結果の因果品質と実用性を分けて表示します。結果が良くても、自動でFormal Edge昇格・BUY推奨・売買判断にはなりません。
        </div>
      </div>

      {data.studies.length === 0 ? (
        <div style={{ ...cardStyle, padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 7 }}>🔬</div>
          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 850 }}>正式Studyはまだ0件です</div>
          <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.65, color: 'var(--ink-3)', fontWeight: 600 }}>
            0件を隠さず表示します。Catalogへ正式Studyが登録された時だけ、ここに目的・検証モード・結果が現れます。
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 9 }}>
          {data.studies.map((study) => {
            const results = data.studyResults.filter((result) => result.studyId === study.id)
            return (
              <article key={study.id} style={{ ...cardStyle, padding: '13px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700 }}>{study.id}</div>
                    <h3 style={{ margin: '3px 0 0', fontSize: 14.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>{study.title}</h3>
                  </div>
                  <span style={{ flexShrink: 0, padding: '4px 7px', borderRadius: 999, background: 'var(--sky-soft)', color: 'var(--sky-deep)', fontSize: 9.5, fontWeight: 850 }}>
                    {STATUS_LABELS[study.status]}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  <span style={{ padding: '3px 6px', borderRadius: 7, background: 'var(--lavender-soft)', color: 'var(--lavender-deep)', fontSize: 9.5, fontWeight: 800 }}>
                    {MODE_LABELS[study.mode]}
                  </span>
                  {study.informationCutoff && (
                    <span style={{ padding: '3px 6px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--ink-3)', fontSize: 9.5, fontWeight: 750 }}>
                      情報cutoff {formatDate(study.informationCutoff)}
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 9, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 600 }}>{study.purpose}</div>

                {(study.population || study.primaryMetric) && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                    {study.population && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.5 }}><strong>対象:</strong> {study.population}</div>}
                    {study.primaryMetric && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.5 }}><strong>主要指標:</strong> {study.primaryMetric}</div>}
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 650 }}>
                  作成 {formatDate(study.createdAt)}{study.registeredAt ? ` · 登録 ${formatDate(study.registeredAt)}` : ''}
                </div>

                {results.length === 0 ? (
                  <div style={{ marginTop: 9, padding: '8px 9px', borderRadius: 9, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 10.5, fontWeight: 750 }}>
                    StudyResultはまだ登録されていません。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                    {results.map((result) => (
                      <div key={result.id} style={{ padding: '10px 11px', borderRadius: 11, background: 'var(--mint-soft)' }}>
                        <div style={{ fontSize: 9.5, color: 'var(--mint-deep)', fontWeight: 900 }}>実測StudyResult</div>
                        <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 650 }}>{result.effectSummary}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                          <span style={{ padding: '3px 6px', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 9.5, fontWeight: 800 }}>
                            {IDENTIFICATION_LABELS[result.identificationQuality]}
                          </span>
                          <span style={{ padding: '3px 6px', borderRadius: 7, background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 9.5, fontWeight: 800 }}>
                            {EXPLOITABILITY_LABELS[result.exploitability]}
                          </span>
                        </div>
                        {(result.limitations.length > 0 || result.negativeFindings.length > 0) && (
                          <details style={{ marginTop: 7 }}>
                            <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--ink-3)', fontWeight: 800 }}>限界・ネガティブ結果</summary>
                            {result.negativeFindings.length > 0 && (
                              <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.55, color: 'var(--accent)', fontWeight: 700 }}>
                                {result.negativeFindings.map((finding) => NEGATIVE_LABELS[finding]).join(' / ')}
                              </div>
                            )}
                            {result.limitations.length > 0 && (
                              <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                                {result.limitations.map((limitation, index) => (
                                  <div key={`${index}-${limitation.slice(0, 24)}`} style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>• {limitation}</div>
                                ))}
                              </div>
                            )}
                          </details>
                        )}
                        <div style={{ marginTop: 6, fontSize: 9, color: 'var(--ink-3)' }}>結果記録 {formatDate(result.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {unmatchedResults.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 9, padding: '10px 12px', background: 'var(--amber-soft)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--amber)', fontWeight: 850 }}>Studyに紐づかないResult {unmatchedResults.length}件</div>
          <div style={{ marginTop: 4, fontSize: 10.5, lineHeight: 1.55, color: 'var(--ink-3)' }}>整合性確認が必要です。Resultを消したり別Studyへ推測で付け替えたりはしません。</div>
        </div>
      )}
    </section>
  )
}
