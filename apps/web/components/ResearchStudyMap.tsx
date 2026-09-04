import styles from './ResearchVerification.module.css'
import {
  loadOwnerResearchHistoryMap,
  type OwnerResearchExploitability,
  type OwnerResearchIdentificationQuality,
  type OwnerResearchNegativeFinding,
  type OwnerResearchStudyMode,
  type OwnerResearchStudyStatus,
} from '@/lib/research-history-map'

const MODE_LABELS: Record<OwnerResearchStudyMode, string> = {
  exploratory: '探索',
  calibration: '調整',
  confirmatory: '確認',
  holdout: '未使用データ検証',
  out_of_sample: '標本外検証',
  revalidation: '再検証',
}

const STATUS_LABELS: Record<OwnerResearchStudyStatus, { label: string; tone: string }> = {
  draft: { label: '下書き', tone: 'gray' },
  registered: { label: '登録済み', tone: 'blue' },
  running: { label: '実行中', tone: 'amber' },
  completed: { label: '完了', tone: 'green' },
  cancelled: { label: '中止', tone: 'red' },
  archived: { label: 'アーカイブ', tone: 'gray' },
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
    <section className={styles.root}>
      <div className="ap-verification-heading">
        <h2>検証設計 — どう確かめるか</h2>
        <span>検証設計 {data.counts.studies}件 / 結果 {data.counts.studyResults}件</span>
      </div>

      <div className="ap-verification-note">
        検証設計は「どう確かめるか」を固定する単位です。結果では、観測された効果・因果の識別品質・実用性を分けて表示します。良い結果でも、自動で正式Edge昇格やBUY推奨にはなりません。
      </div>

      {data.studies.length === 0 ? (
        <div className="ap-study-empty">
          <strong>正式な検証設計はまだ0件です</strong>
          <p>0件を隠さず表示します。研究カタログへ正式な検証設計が登録された時だけ、目的・検証モード・結果がここに現れます。</p>
        </div>
      ) : (
        <div className="ap-verification-group">
          {data.studies.map((study) => {
            const results = data.studyResults.filter((result) => result.studyId === study.id)
            const status = STATUS_LABELS[study.status]
            return (
              <article className="ap-verification-row" key={study.id}>
                <div className="ap-verification-row-head">
                  <div>
                    <div className="ap-verification-kicker">{study.id} · {MODE_LABELS[study.mode]}</div>
                    <h3>{study.title}</h3>
                  </div>
                  <span className={`ap-status-badge tone-${status.tone}`}>{status.label}</span>
                </div>

                <p className="ap-verification-body">{study.purpose}</p>

                {(study.population || study.primaryMetric || study.informationCutoff) && (
                  <div className="ap-study-meta-grid">
                    <div>
                      <span>対象</span>
                      <strong>{study.population ?? '未記録'}</strong>
                    </div>
                    <div>
                      <span>主要指標 / 情報の締切</span>
                      <strong>
                        {study.primaryMetric ?? '主要指標未記録'}
                        {study.informationCutoff ? ` · ${formatDate(study.informationCutoff)}` : ''}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="ap-pit-meta">
                  作成 {formatDate(study.createdAt)}{study.registeredAt ? ` · 登録 ${formatDate(study.registeredAt)}` : ''}
                </div>

                {results.length === 0 ? (
                  <div className="ap-reaction-missing">検証結果はまだ登録されていません。未登録を「効果なし」と解釈しません。</div>
                ) : (
                  results.map((result) => (
                    <section className="ap-study-result" key={result.id}>
                      <div className="ap-study-result-head">
                        <span className="ap-study-result-label">実測結果</span>
                        <time>結果記録 {formatDate(result.createdAt)}</time>
                      </div>
                      <p>{result.effectSummary}</p>
                      <div className="ap-study-result-classification">
                        <div>
                          <span>因果の識別品質</span>
                          <strong>{IDENTIFICATION_LABELS[result.identificationQuality]}</strong>
                        </div>
                        <div>
                          <span>実用性</span>
                          <strong>{EXPLOITABILITY_LABELS[result.exploitability]}</strong>
                        </div>
                      </div>

                      {(result.limitations.length > 0 || result.negativeFindings.length > 0) && (
                        <details className="ap-verification-details">
                          <summary>限界・ネガティブ結果</summary>
                          <div className="ap-detail-list">
                            {result.negativeFindings.map((finding) => (
                              <div className="ap-detail-row" key={finding}>
                                <span>ネガティブ結果</span>
                                <strong>{NEGATIVE_LABELS[finding]}</strong>
                                <small />
                              </div>
                            ))}
                            {result.limitations.map((limitation, index) => (
                              <div className="ap-detail-row" key={`${index}-${limitation.slice(0, 24)}`}>
                                <span>限界</span>
                                <strong>{limitation}</strong>
                                <small />
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </section>
                  ))
                )}
              </article>
            )
          })}
        </div>
      )}

      {unmatchedResults.length > 0 && (
        <div className="ap-study-warning">
          <strong>検証設計に紐づかない結果が {unmatchedResults.length}件あります。</strong><br />
          整合性確認が必要です。結果を消したり、別の検証設計へ推測で付け替えたりはしません。
        </div>
      )}
    </section>
  )
}
