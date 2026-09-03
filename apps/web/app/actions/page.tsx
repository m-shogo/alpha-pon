import { loadGeneratedData } from '@/lib/generated-data'
import { normalizeGeneratedCompanyRules } from '@/lib/generated-company-rule-input'
import { Disclaimer } from '@/components/Disclaimer'
import { toDisplaySignal, getSignalColor, getAppMode } from '@/lib/stock/display-mode'
import type { AppMode, InternalSignal } from '@/lib/stock/display-mode'
import type { GeneratedStockRule } from '@/lib/stock/rules/types'
import styles from './ActionsPage.module.css'

export const metadata = { title: '行動候補 | alpha-pon' }

const SIGNAL_ORDER: InternalSignal[] = ['DANGER', 'EXIT_WATCH', 'TRIM_WATCH', 'WAIT_PULLBACK', 'ENTRY_WATCH', 'ADD_WATCH', 'HOLD', 'NO_ACTION']

function confidenceLabel(confidence: number) {
  if (confidence >= 0.8) return '強め'
  if (confidence >= 0.6) return '条件付き'
  if (confidence >= 0.35) return '弱め'
  return '材料不足'
}

function nextMoveLabel(signal: InternalSignal, mode: AppMode) {
  if (mode === 'portfolio') return null
  const map: Record<InternalSignal, string> = {
    ENTRY_WATCH: '調査条件を今日確認',
    ADD_WATCH: '追加調査条件を確認',
    HOLD: '継続監視',
    TRIM_WATCH: '一部整理条件を確認',
    WAIT_PULLBACK: '追いかけず押し目待ち',
    EXIT_WATCH: '撤退条件を確認',
    NO_ACTION: '触らない',
    DANGER: '避ける',
  }
  return map[signal]
}

function fmtPct(value: number | null | undefined) {
  if (typeof value !== 'number') return '未取得'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function DetailList({ title, items, color, mark }: { title: string; items: string[]; color: string; mark: string }) {
  if (items.length === 0) return null
  return (
    <div className={styles.detailBlock}>
      <div className={styles.detailTitle}>{title}</div>
      <div className={styles.detailList}>
        {items.slice(0, 4).map((item, index) => (
          <div key={`${title}-${index}`} className={styles.detailItem}>
            <span className={styles.mark} style={{ color }}>{mark}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PriceSignalStrip({ rule }: { rule: GeneratedStockRule }) {
  const signal = rule.priceSignal
  if (!signal) return null
  const warnings = rule.priceRiskWarnings ?? []
  const strongest = warnings.some(warning => warning.level === 'block')
    ? 'block'
    : warnings.some(warning => warning.level === 'warning')
      ? 'warning'
      : 'info'
  const color = strongest === 'block' ? 'var(--urgent)' : strongest === 'warning' ? 'var(--amber)' : 'var(--ink-3)'

  return (
    <div className={styles.priceStrip}>
      <span className={styles.priceLabel} style={{ color }}>価格の動き</span>
      <span>5日 {fmtPct(signal.change5dPct)}</span>
      <span>20日 {fmtPct(signal.change20dPct)}</span>
      <span>市場比20日 {fmtPct(signal.relativeTopix20dPct)}</span>
      <span>出来高 {signal.volumeSpikeRatio != null ? `${signal.volumeSpikeRatio.toFixed(1)}倍` : '未取得'}</span>
      <span className={styles.priceSource}>情報源 {signal.source} / 品質 {signal.quality}</span>
    </div>
  )
}

function ActionRow({ rule, mode }: { rule: GeneratedStockRule; mode: AppMode }) {
  const signal = rule.actionSignal as InternalSignal
  const color = getSignalColor(signal)
  const label = toDisplaySignal(signal, mode)
  const nextMove = nextMoveLabel(signal, mode)

  return (
    <article className={styles.row}>
      <div className={styles.rowTop}>
        <div>
          <div className={styles.code}>{rule.code}</div>
          <h3 className={styles.name}>{rule.name}</h3>
          <div className={styles.confidence}>信頼度 {Math.round(rule.confidence * 100)}% ・ {confidenceLabel(rule.confidence)}</div>
          {nextMove && <div className={styles.nextMove}>{nextMove}</div>}
        </div>
        <div className={styles.signal}>
          <span className={styles.dot} style={{ background: color }} />
          <span>{mode === 'private' ? '個人判断' : '表示'}: {label}</span>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <DetailList title={signal === 'WAIT_PULLBACK' ? '良い材料として見る理由' : '調査候補として見る理由'} items={rule.reasons} color="var(--mint-deep)" mark="✓" />
        <DetailList title="過去5年から見た罠" items={rule.risks} color="var(--amber)" mark="!" />
        <DetailList title="先に確認すること" items={rule.evidenceNeeded} color="var(--sky-deep)" mark="□" />
        <DetailList title="崩れたら見送り" items={rule.invalidationSignals} color="var(--urgent)" mark="×" />
      </div>

      <PriceSignalStrip rule={rule} />
    </article>
  )
}

export default function ActionsPage() {
  const data = loadGeneratedData()
  const mode = getAppMode()
  const ruleLoad = normalizeGeneratedCompanyRules((data as Record<string, unknown>).generatedCompanyRules)
  const rules = ruleLoad.rows as GeneratedStockRule[]
  const bySignal = SIGNAL_ORDER.reduce<Record<string, GeneratedStockRule[]>>((acc, signal) => {
    acc[signal] = rules.filter(rule => rule.actionSignal === signal)
    return acc
  }, {})
  const totalActive = rules.filter(rule => rule.actionSignal !== 'NO_ACTION' && rule.actionSignal !== 'HOLD').length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>調査した結果、今日どう扱うか</div>
          <h1 className={styles.title}>行動候補</h1>
          <p className={styles.subtitle}>
            自動生成ルールの結論を、理由・リスク・先に確認する証拠と一緒に読みます。買い推奨ではありません。
          </p>
        </div>
        <div className={styles.activeCount}>要確認 {totalActive}件 / 全{rules.length}件</div>
      </header>

      {ruleLoad.warning && (
        <div className={styles.warning}>
          一部の行動候補データを安全のため除外しました（{ruleLoad.warning}）
        </div>
      )}

      {rules.length === 0 ? (
        <div className={styles.empty}>現在、表示できる行動候補はありません。</div>
      ) : SIGNAL_ORDER.map(signal => {
        const items = bySignal[signal]
        if (!items || items.length === 0) return null
        const label = toDisplaySignal(signal, mode)
        return (
          <section key={signal} className={styles.group}>
            <div className={styles.groupHead}>
              <h2 className={styles.groupTitle} style={{ color: getSignalColor(signal) }}>{label}</h2>
              <span className={styles.groupCount}>{items.length}件</span>
            </div>
            <div className={styles.rows}>
              {items.map(rule => <ActionRow key={rule.generatedRuleId} rule={rule} mode={mode} />)}
            </div>
          </section>
        )
      })}

      <div className={styles.footer}>
        <Disclaimer compact />
      </div>
    </main>
  )
}
