import styles from './ResearchVerification.module.css'
import { loadOwnerResearchHistoryMap } from '@/lib/research-history-map'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

function formatBps(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${Math.round(value)} bps (${sign}${(value / 100).toFixed(2)}%)`
}

export default function HistoricalAnalogVerification() {
  const data = loadOwnerResearchHistoryMap()
  if (data.historicalAnalogs.length === 0) return null

  return (
    <section className={styles.root}>
      <div className="ap-verification-heading">
        <h2>過去類似事例の検証詳細</h2>
        <span>{data.historicalAnalogs.length}件</span>
      </div>

      <div className="ap-verification-note">
        正本にある値だけを表示します。1事例につき登録された市場反応だけを扱い、D+5 / D+20 / D+60 / D+120を後から補完・推定しません。「明確な動きなし」を自動で比較対象にせず、明示された比較対象だけを表示します。
      </div>

      <div className="ap-verification-group">
        {data.historicalAnalogs.map((analog) => (
          <article className="ap-verification-row" key={analog.id}>
            <div className="ap-verification-row-head">
              <div>
                <div className="ap-verification-kicker">{analog.eventDate} · {analog.eventType}</div>
                <h3>{analog.companyName} {analog.companyCode}</h3>
              </div>
              <span className="ap-status-badge tone-gray">時点確認 {formatDate(analog.observedAt)}</span>
            </div>

            <div className="ap-pit-block">
              <div className="ap-pit-label">その時点で知り得た情報</div>
              <div className="ap-pit-meta">公開確認 {formatDate(analog.observedAt)} · 情報源種別 {analog.sourceType}</div>
              <p className="ap-verification-body">{analog.summary}</p>
            </div>

            {analog.marketReaction ? (
              <div className="ap-reaction-grid" aria-label={`${analog.companyName}の市場反応`}>
                <div>
                  <span>登録済み反応 D+{analog.marketReaction.horizonDays}</span>
                  <strong>{formatBps(analog.marketReaction.rawReturnBps)}</strong>
                  <small>計測 {formatDate(analog.marketReaction.measuredAt)}</small>
                </div>
                <div>
                  <span>ベンチマーク差</span>
                  <strong>{analog.marketReaction.excessReturnBps !== undefined ? formatBps(analog.marketReaction.excessReturnBps) : '未記録'}</strong>
                  <small>{analog.marketReaction.benchmark ?? 'ベンチマーク未記録'}</small>
                </div>
                <div>
                  <span>結果の収益率</span>
                  <strong>{analog.outcome?.roiBps !== undefined ? formatBps(analog.outcome.roiBps) : '未記録'}</strong>
                  <small>{analog.outcome ? `計測 ${formatDate(analog.outcome.measuredAt)}` : '結果未記録'}</small>
                </div>
              </div>
            ) : (
              <div className="ap-reaction-missing">市場反応はまだ未計測です。0として扱いません。</div>
            )}

            {analog.counterfactuals.length > 0 && (
              <details className="ap-verification-details">
                <summary>明示された比較対象 {analog.counterfactuals.length}件</summary>
                <div className="ap-detail-list">
                  {analog.counterfactuals.map((counterfactual) => (
                    <div className="ap-detail-row" key={counterfactual.id}>
                      <span>{counterfactual.method}</span>
                      <strong>{counterfactual.comparator}</strong>
                      <small>{counterfactual.differenceBps !== undefined ? `差分 ${formatBps(counterfactual.differenceBps)}` : '差分未記録'}</small>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {analog.keyEvents.length > 0 && (
              <details className="ap-verification-details">
                <summary>イベント経過 {analog.keyEvents.length}件</summary>
                <div className="ap-detail-list">
                  {analog.keyEvents.map((event, index) => (
                    <div className="ap-detail-row" key={`${event.date}:${index}`}>
                      <span>{event.date}</span>
                      <strong>{event.label}</strong>
                      <small />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
