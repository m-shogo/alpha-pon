import { loadGeneratedData } from '@/lib/generated-data'
import { normalizeGeneratedPositions } from '@/lib/generated-position-input'
import { Disclaimer } from '@/components/Disclaimer'
import type { Position } from '@/lib/stock/types'
import styles from './PositionsPage.module.css'

export const metadata = { title: '保有銘柄 | alpha-pon' }

function accountLabel(value: Position['nisaType']) {
  if (value === 'nisa_growth') return 'NISA成長投資枠'
  if (value === 'nisa_accumulation') return 'NISAつみたて投資枠'
  return value ? '特定・一般口座' : null
}

function PositionRow({ pos }: { pos: Position }) {
  const gainColor = pos.unrealizedGainPct == null ? 'var(--ink-3)'
    : pos.unrealizedGainPct > 0 ? 'var(--mint-deep)'
    : pos.unrealizedGainPct < 0 ? 'var(--urgent)'
    : 'var(--ink-2)'

  return (
    <article className={styles.row}>
      <div className={styles.rowTop}>
        <div>
          <div className={styles.code}>{pos.code}</div>
          <h2 className={styles.name}>{pos.name}</h2>
          {accountLabel(pos.nisaType) && <div className={styles.account}>{accountLabel(pos.nisaType)}</div>}
        </div>
        <div className={styles.gain}>
          <div className={styles.gainLabel}>含み損益</div>
          <div className={styles.gainValue} style={{ color: gainColor }}>
            {pos.unrealizedGainPct != null ? `${pos.unrealizedGainPct > 0 ? '+' : ''}${pos.unrealizedGainPct.toFixed(1)}%` : '未取得'}
          </div>
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>平均取得</div>
          <div className={styles.metricValue}>{pos.averageCost.toLocaleString()} 円</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>現在価格</div>
          <div className={styles.metricValue}>{pos.currentPrice?.toLocaleString() ?? '未取得'}{pos.currentPrice != null ? ' 円' : ''}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>保有株数</div>
          <div className={styles.metricValue}>{pos.shares.toLocaleString()} 株</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>保有比率</div>
          <div className={styles.metricValue}>{pos.positionWeightPct != null ? `${pos.positionWeightPct.toFixed(1)}%` : '未記録'}</div>
        </div>
      </div>

      {pos.thesis.length > 0 && (
        <div className={styles.note}><strong>保有仮説:</strong> {pos.thesis[0]}</div>
      )}
      {pos.nextEvent && <div className={styles.event}>次のイベント: {pos.nextEvent}</div>}
    </article>
  )
}

export default function PositionsPage() {
  const data = loadGeneratedData()
  const positionLoad = normalizeGeneratedPositions((data as Record<string, unknown>).positions)
  const positions = positionLoad.rows
  const totalValue = positions.reduce((sum, position) => sum + (position.marketValue ?? 0), 0)

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>現在持っている銘柄と次の確認</div>
          <h1 className={styles.title}>保有銘柄</h1>
          <p className={styles.subtitle}>取得価格・現在価格・含み損益・保有仮説・次のイベントを一列で比較します。</p>
        </div>
        <div className={styles.total}>{positions.length}銘柄{totalValue > 0 ? ` ・ 評価額 ${totalValue.toLocaleString()} 円` : ''}</div>
      </header>

      {positionLoad.warning && <div className={styles.warning}>データ確認: {positionLoad.warning}</div>}

      {positions.length === 0 ? (
        <div className={styles.empty}>現在、表示できる保有銘柄はありません。</div>
      ) : (
        <div className={styles.rows}>{positions.map(position => <PositionRow key={position.code} pos={position} />)}</div>
      )}

      <div className={styles.footer}><Disclaimer compact /></div>
    </main>
  )
}
