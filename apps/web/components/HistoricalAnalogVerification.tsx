import type { CSSProperties } from 'react'
import { loadOwnerResearchHistoryMap } from '@/lib/research-history-map'

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--card-line)',
  borderRadius: 18,
  boxShadow: 'var(--shadow)',
}

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
    <section style={{ padding: '0 14px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, margin: '18px 2px 8px' }}>
        <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)', fontWeight: 850 }}>Analog検証詳細 — 当時情報と反応</h2>
        <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{data.historicalAnalogs.length}件</span>
      </div>

      <div style={{ ...cardStyle, padding: '10px 12px', marginBottom: 9, background: 'var(--surface-2)' }}>
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: 'var(--ink-3)', fontWeight: 650 }}>
          正本にある値だけを表示します。HistoricalAnalog v1は1件につき marketReaction を1つだけ保持するため、D+5 / D+20 / D+60 / D+120を後から補完・推定しません。また「no_move」を自動でControl扱いせず、明示されたCounterfactualだけを比較対象として表示します。
        </div>
      </div>

      <div style={{ display: 'grid', gap: 9 }}>
        {data.historicalAnalogs.map((analog) => (
          <article key={analog.id} style={{ ...cardStyle, padding: '13px 14px' }}>
            <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 700 }}>{analog.eventDate} · {analog.eventType}</div>
            <h3 style={{ margin: '3px 0 0', fontSize: 14.5, lineHeight: 1.35, color: 'var(--ink)', fontWeight: 850 }}>
              {analog.companyName} {analog.companyCode}
            </h3>

            <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 10, background: 'var(--sky-soft)' }}>
              <div style={{ fontSize: 9.5, color: 'var(--sky-deep)', fontWeight: 850 }}>その時点で知り得た情報 — PIT</div>
              <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.55, color: 'var(--ink-2)', fontWeight: 600 }}>
                公開確認: {formatDate(analog.observedAt)} · source種別: {analog.sourceType}
              </div>
              <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 600 }}>{analog.summary}</div>
            </div>

            {analog.marketReaction ? (
              <div style={{ marginTop: 9, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
                <div style={{ padding: '9px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 850 }}>Canonical reaction · D+{analog.marketReaction.horizonDays}</div>
                  <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--ink)', fontWeight: 850 }}>{formatBps(analog.marketReaction.rawReturnBps)}</div>
                  <div style={{ marginTop: 3, fontSize: 9.5, color: 'var(--ink-3)' }}>計測 {formatDate(analog.marketReaction.measuredAt)}</div>
                </div>
                <div style={{ padding: '9px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 9.5, color: 'var(--ink-3)', fontWeight: 850 }}>Benchmark差</div>
                  <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--ink)', fontWeight: 850 }}>
                    {analog.marketReaction.excessReturnBps !== undefined ? formatBps(analog.marketReaction.excessReturnBps) : '未記録'}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 9.5, color: 'var(--ink-3)' }}>
                    {analog.marketReaction.benchmark ?? 'benchmark未記録'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 10, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 10.5, fontWeight: 750 }}>
                marketReactionはまだ未計測です。
              </div>
            )}

            {analog.outcome?.roiBps !== undefined && (
              <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--ink-2)', fontWeight: 700 }}>
                Outcome ROI: {formatBps(analog.outcome.roiBps)} · 計測 {formatDate(analog.outcome.measuredAt)}
              </div>
            )}

            {analog.counterfactuals.length > 0 && (
              <details style={{ marginTop: 9 }}>
                <summary style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--lavender-deep)', fontWeight: 850 }}>
                  Counterfactual / 比較対象 {analog.counterfactuals.length}件
                </summary>
                <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>
                  {analog.counterfactuals.map((counterfactual) => (
                    <div key={counterfactual.id} style={{ padding: '8px 9px', borderRadius: 9, background: 'var(--lavender-soft)' }}>
                      <div style={{ fontSize: 10, color: 'var(--lavender-deep)', fontWeight: 850 }}>{counterfactual.method}</div>
                      <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.5, color: 'var(--ink-2)', fontWeight: 600 }}>{counterfactual.comparator}</div>
                      {counterfactual.differenceBps !== undefined && <div style={{ marginTop: 3, fontSize: 10, color: 'var(--ink-3)', fontWeight: 700 }}>差分 {formatBps(counterfactual.differenceBps)}</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {analog.keyEvents.length > 0 && (
              <details style={{ marginTop: 9 }}>
                <summary style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 800 }}>イベント経過 {analog.keyEvents.length}件</summary>
                <div style={{ display: 'grid', gap: 5, marginTop: 6 }}>
                  {analog.keyEvents.map((event, index) => (
                    <div key={`${event.date}:${index}`} style={{ display: 'flex', gap: 7, fontSize: 10.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                      <span style={{ flexShrink: 0, color: 'var(--ink-3)', fontWeight: 750 }}>{event.date}</span>
                      <span>{event.label}</span>
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
