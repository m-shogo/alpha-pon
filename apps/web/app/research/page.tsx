import {
  loadOwnerResearchSummary,
  type OwnerFormalEdgeStatus,
  type OwnerResearchItemStatus,
  type OwnerResearchQuestionStatus,
} from '@/lib/research-summary'

const ITEM_STATUS: Record<OwnerResearchItemStatus, { label: string; tone: string }> = {
  captured: { label: '収集中', tone: 'blue' },
  triage: { label: '整理中', tone: 'amber' },
  investigating: { label: '調査中', tone: 'blue' },
  synthesized: { label: '整理済み', tone: 'green' },
  resolved: { label: '解決', tone: 'green' },
  parked: { label: '保留', tone: 'gray' },
  archived: { label: 'アーカイブ', tone: 'gray' },
}

const EDGE_STATUS: Record<OwnerFormalEdgeStatus, { label: string; tone: string }> = {
  idea: { label: 'アイデア', tone: 'gray' },
  research: { label: '研究中', tone: 'blue' },
  shadow: { label: '実運用前の観察', tone: 'blue' },
  production: { label: '実運用', tone: 'green' },
  rejected: { label: '棄却', tone: 'red' },
  deprecated: { label: '統合・終了', tone: 'gray' },
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
  holdoutPass: '未使用データで再現',
  pitSafe: '時点整合性',
  netAlphaPositive: 'コスト後の超過収益',
  executionFeasible: '執行可能性',
  liquiditySufficient: '流動性',
  borrowCostCovered: '借株・コスト',
  confoundersRemoved: '交絡除去',
  counterfactualExplained: '反実仮想比較',
  decayChecked: '効果の減衰確認',
  falseDiscoveryGuard: '過学習・多重検定防止',
}

function formatDate(value: string | null): string {
  if (!value) return '未記録'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未記録'
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function SummaryList({ items, empty = 'まだ記録なし', limit = 5 }: { items: string[]; empty?: string; limit?: number }) {
  if (items.length === 0) return <p className="ap-research-empty">{empty}</p>
  return (
    <ul className="ap-summary-list">
      {items.slice(0, limit).map((item) => <li key={item}>{item}</li>)}
      {items.length > limit && <li className="ap-summary-list-more">ほか {items.length - limit} 件</li>}
    </ul>
  )
}

function SectionHeading({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div className="ap-research-section-heading" id={id}>
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  )
}

export default function ResearchPage() {
  const data = loadOwnerResearchSummary()
  const recent = data.overview.recent7d
  const ready = data.overview.readiness
  const integrityAttention = data.integrity.status !== 'ok' || data.integrity.errorCount > 0 || data.integrity.warningCount > 0

  const recordedFindings = dedupe(data.formalEdges.flatMap((edge) => edge.knownFindings))
  const unresolvedQuestions = dedupe(data.researchItems.flatMap((item) => item.questions)
    .filter((question) => !['answered', 'obsolete'].includes(question.status))
    .map((question) => question.question))
  const verificationGaps = dedupe(data.formalEdges.flatMap((edge) => edge.verificationGaps)
    .filter((gap) => gap.state !== 'pass')
    .map((gap) => `${GATE_LABELS[gap.key] ?? gap.key}: ${gap.explanation ?? (gap.state === 'fail' ? '未通過' : '未確認')}`))
  const nextActions = dedupe([
    ...data.formalEdges.flatMap((edge) => edge.nextActions),
    ...(data.checkpoint?.nextCandidates.map((candidate) => `${candidate.edgeId}: ${candidate.why}`) ?? []),
  ])
  const unknownSummary = dedupe([...unresolvedQuestions, ...verificationGaps])

  const promotionText = ready.promotionReadyEdgeIds.length > 0
    ? `本番昇格の条件を満たしたEdgeが ${ready.promotionReadyEdgeIds.length}件あります。`
    : '本番昇格の条件を満たしたEdgeはまだありません。'

  return (
    <div className="ap-research-page">
      <header className="ap-research-header">
        <div>
          <h1>研究</h1>
          <p>いま何を調べていて、どこまで分かり、次に何を見るか。</p>
        </div>
        <div className="ap-research-header-meta">
          <span>最終研究更新</span>
          <strong>{formatDate(data.latestResearchAt)}</strong>
        </div>
      </header>

      <nav className="ap-research-section-nav" aria-label="研究ページ内ナビゲーション">
        <a href="#research-overview">概要</a>
        <a href="#research-items">研究テーマ</a>
        <a href="#formal-edges">正式Edge</a>
        <a href="#research-timeline">履歴</a>
        <a href="#knowledge-map">過去事例・検証</a>
      </nav>

      <section className="ap-research-overview" id="research-overview">
        <div className="ap-research-current-state">
          <div className="ap-research-state-topline">
            <span className={`ap-status-badge tone-${integrityAttention ? 'amber' : 'green'}`}>
              {integrityAttention ? '研究データの整合性を確認してください' : '研究データの整合性に問題なし'}
            </span>
            <span className="ap-research-recency">直近7日: Edge +{recent.edgesAdded} / 類似事例 +{recent.analogsAdded}</span>
          </div>
          <h2>{data.counts.activeResearchItems}件の研究テーマ、{data.counts.activeFormalEdges}件の正式Edgeを追跡中。</h2>
          <p>{promotionText}</p>
          <div className="ap-research-stat-row" aria-label="研究状況の主要指標">
            <div><span>正式Edge</span><strong>{data.counts.activeFormalEdges}<small> / {data.counts.formalEdges}</small></strong></div>
            <div><span>研究テーマ</span><strong>{data.counts.activeResearchItems}</strong></div>
            <div><span>未解決の問い</span><strong>{data.counts.unresolvedQuestions}</strong></div>
            <div><span>正式サンプル</span><strong>{recent.currentFormalSamples}</strong></div>
          </div>
          {(ready.promotionReadyEdgeIds.length > 0 || ready.holdoutReadyEdgeIds.length > 0) && (
            <div className="ap-ready-row">
              {ready.promotionReadyEdgeIds.length > 0 && <span>本番昇格の条件クリア: {ready.promotionReadyEdgeIds.join(' / ')}</span>}
              {ready.holdoutReadyEdgeIds.length > 0 && <span>未使用データ検証待ち: {ready.holdoutReadyEdgeIds.join(' / ')}</span>}
            </div>
          )}
        </div>

        <div className="ap-research-triad">
          <section className="ap-research-triad-section is-known">
            <div className="ap-triad-label">分かったこと</div>
            <h3>研究ログに記録された発見</h3>
            <SummaryList items={recordedFindings} />
            <p className="ap-triad-note">ここにある発見は実測結果とは限りません。実測サンプル・結果とは分けて扱います。</p>
          </section>
          <section className="ap-research-triad-section is-unknown">
            <div className="ap-triad-label">まだ分からないこと</div>
            <h3>未解決の問い・未通過条件</h3>
            <SummaryList items={unknownSummary} />
          </section>
          <section className="ap-research-triad-section is-next">
            <div className="ap-triad-label">次に調べること</div>
            <h3>研究システムに記録された次の確認</h3>
            <SummaryList items={nextActions} />
          </section>
        </div>
      </section>

      <SectionHeading id="research-items" title="研究テーマ" meta={`${data.counts.researchItems}件`} />
      <section className="ap-research-group" aria-label="研究テーマ一覧">
        {data.researchItems.length === 0 && <p className="ap-research-empty ap-research-empty-padded">研究テーマはまだありません。</p>}
        {data.researchItems.map((item) => {
          const status = ITEM_STATUS[item.status]
          return (
            <article className="ap-research-item-row" key={item.id}>
              <div className="ap-research-row-main">
                <div className="ap-research-row-kicker">{item.id}</div>
                <div className="ap-research-row-title-line">
                  <h3>{item.title}</h3>
                  <span className={`ap-status-badge tone-${status.tone}`}>{status.label}</span>
                </div>
                {item.families.length > 0 && <div className="ap-research-family-line">{item.families.map((family) => family.title).join(' / ')}</div>}
                <p>{item.summary}</p>
                <div className="ap-research-row-meta">更新 {formatDate(item.lastReviewedAt ?? item.createdAt)}</div>
              </div>
              {item.questions.length > 0 && (
                <details className="ap-row-disclosure">
                  <summary>未解決・確認中の問い {item.questions.filter((question) => !['answered', 'obsolete'].includes(question.status)).length}件</summary>
                  <div className="ap-question-list">
                    {item.questions.map((question) => (
                      <div className="ap-question-row" key={question.id}>
                        <span>{QUESTION_STATUS[question.status]}</span>
                        <p>{question.question}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </article>
          )
        })}
      </section>

      <SectionHeading id="formal-edges" title="正式Edgeの検証状況" meta={`${data.counts.formalEdges}件`} />
      <section className="ap-research-group" aria-label="正式Edge一覧">
        {data.formalEdges.length === 0 && <p className="ap-research-empty ap-research-empty-padded">正式Edgeはまだありません。</p>}
        {data.formalEdges.map((edge) => {
          const status = EDGE_STATUS[edge.status]
          return (
            <article className="ap-edge-row" key={edge.id}>
              <div className="ap-edge-row-head">
                <div className="ap-edge-identity">
                  <div className="ap-research-row-kicker">{edge.id}</div>
                  <div className="ap-research-row-title-line">
                    <h3>{edge.title}</h3>
                    <span className={`ap-status-badge tone-${status.tone}`}>{status.label}</span>
                  </div>
                  <p className="ap-edge-hypothesis-preview">{edge.hypothesisPreview}</p>
                </div>
                <div className="ap-edge-progress" aria-label={`${edge.title}の検証進捗`}>
                  <div><span>サンプル</span><strong>{edge.samples.current}<small> / {edge.samples.required}</small></strong></div>
                  <div><span>類似事例</span><strong>{edge.samples.analogCurrent}<small> / {edge.samples.analogRequired}</small></strong></div>
                  <div><span>検証条件</span><strong>{edge.gate.pass}<small> / {edge.gate.total}</small></strong></div>
                </div>
              </div>

              <div className="ap-edge-meta-line">優先度 {edge.priority} · 確信度 {Math.round(edge.confidence * 100)}% · 最終研究 {formatDate(edge.lastResearchAt)}</div>

              <details className="ap-row-disclosure ap-edge-details">
                <summary>検証内容を見る</summary>
                <div className="ap-edge-detail-grid">
                  <section>
                    <h4>分かったこと</h4>
                    <SummaryList items={edge.knownFindings} limit={6} />
                  </section>
                  <section>
                    <h4>まだ分からないこと</h4>
                    <SummaryList items={edge.verificationGaps.map((gap) => `${GATE_LABELS[gap.key] ?? gap.key}: ${gap.explanation ?? (gap.state === 'fail' ? '未通過' : '未確認')}`)} limit={6} />
                  </section>
                  <section>
                    <h4>次に調べること</h4>
                    <SummaryList items={edge.nextActions} limit={6} />
                  </section>
                  <section className="ap-edge-detail-wide">
                    <h4>仮説</h4>
                    <p>{edge.hypothesis}</p>
                  </section>
                  <section className="ap-edge-detail-wide">
                    <h4>必要データ</h4>
                    <SummaryList items={edge.requiredData} limit={8} />
                  </section>
                </div>
              </details>
            </article>
          )
        })}
      </section>

      {data.checkpoint && (
        <>
          <SectionHeading id="checkpoint" title="今の研究メモ" meta={`記録 #${data.checkpoint.sequence}`} />
          <section className="ap-research-group ap-checkpoint">
            <div className="ap-checkpoint-primary">
              <span>保存 {formatDate(data.checkpoint.savedAt)}</span>
              <p>{data.checkpoint.researchDone}</p>
            </div>
            <div className="ap-checkpoint-grid">
              <section>
                <h3>不足しているもの</h3>
                <SummaryList items={data.checkpoint.dataGaps} />
              </section>
              <section>
                <h3>次に調べる候補</h3>
                <SummaryList items={data.checkpoint.nextCandidates.map((candidate) => `${candidate.edgeId}: ${candidate.why}`)} />
              </section>
            </div>
          </section>
        </>
      )}

      <SectionHeading id="research-timeline" title="最近の研究履歴" meta={`${data.timeline.length}件`} />
      <section className="ap-timeline" aria-label="研究履歴">
        {data.timeline.length === 0 && <p className="ap-research-empty ap-research-empty-padded">研究履歴はまだありません。</p>}
        {data.timeline.map((entry) => (
          <article className="ap-timeline-row" key={entry.id}>
            <div className="ap-timeline-marker" aria-hidden="true" />
            <div className="ap-timeline-content">
              <div className="ap-timeline-meta">
                <strong>{entry.edgeId ?? entry.type}</strong>
                <time>{formatDate(entry.at)}</time>
              </div>
              <p>{entry.summary}</p>
              {(entry.findings.length > 0 || entry.dataGaps.length > 0 || entry.nextActions.length > 0 || entry.rejectionReason) && (
                <details className="ap-row-disclosure">
                  <summary>詳細</summary>
                  <div className="ap-timeline-detail-grid">
                    {entry.rejectionReason && <section><h4>反証・棄却</h4><p>{entry.rejectionReason}</p></section>}
                    {entry.findings.length > 0 && <section><h4>分かったこと</h4><SummaryList items={entry.findings} limit={4} /></section>}
                    {entry.dataGaps.length > 0 && <section><h4>まだ不足</h4><SummaryList items={entry.dataGaps} limit={4} /></section>}
                    {entry.nextActions.length > 0 && <section><h4>次にやること</h4><SummaryList items={entry.nextActions} limit={4} /></section>}
                  </div>
                </details>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="ap-research-deeper-note">
        <h2>過去事例・検証結果</h2>
        <p>この下に研究のつながり、過去類似事例、個別事例、検証設計、結果、統合・継承履歴などの深い検証情報が続きます。</p>
      </section>
    </div>
  )
}
