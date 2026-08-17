import { loadGeneratedData } from '@/lib/generated-data'
import { normalizeGeneratedCompanyRules } from '@/lib/generated-company-rule-input'
import { SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import { toDisplaySignal, getSignalColor, getSignalBg, getAppMode } from '@/lib/stock/display-mode'
import type { AppMode, InternalSignal } from '@/lib/stock/display-mode'
import type { GeneratedStockRule } from '@/lib/stock/rules/types'

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
  if (typeof value !== 'number') return 'N/A'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function DetailList({ title, items, color, mark }: { title: string; items: string[]; color: string; mark: string }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 850, color, marginBottom: 3 }}>{title}</div>
      {items.slice(0, 4).map((item, i) => (
        <div key={`${title}-${i}`} style={{ display: 'flex', gap: 5, fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>
          <span style={{ color, fontWeight: 850, flexShrink: 0 }}>{mark}</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

function PriceSignalStrip({ rule }: { rule: GeneratedStockRule }) {
  const signal = rule.priceSignal
  if (!signal) return null
  const warnings = rule.priceRiskWarnings ?? []
  const strongest = warnings.some(w => w.level === 'block') ? 'block' : warnings.some(w => w.level === 'warning') ? 'warning' : 'info'
  const color = strongest === 'block' ? 'var(--urgent)' : strongest === 'warning' ? 'var(--amber)' : 'var(--ink-3)'
  return (
    <div style={{ marginTop: 8, padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 11.5, color: 'var(--ink-2)' }}>
      <span style={{ fontWeight: 850, color }}>価格シグナル: </span>
      <span>5D {fmtPct(signal.change5dPct)} / 20D {fmtPct(signal.change20dPct)} / 市場比20D {fmtPct(signal.relativeTopix20dPct)} / 出来高 {signal.volumeSpikeRatio != null ? `${signal.volumeSpikeRatio.toFixed(1)}倍` : 'N/A'}</span>
      <span style={{ marginLeft: 6, color: 'var(--ink-3)' }}>({signal.source}/{signal.quality})</span>
    </div>
  )
}

function ActionCard({ rule, mode }: { rule: GeneratedStockRule; mode: AppMode }) {
  const signal = rule.actionSignal as InternalSignal
  const color = getSignalColor(signal)
  const label = toDisplaySignal(signal, mode)
  const nextMove = nextMoveLabel(signal, mode)
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '14px 15px', border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{rule.code}</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: getSignalBg(signal), color }}>{label}</span>
        <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>信頼度 {Math.round(rule.confidence * 100)}% / {confidenceLabel(rule.confidence)}</span>
      </div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{rule.name}</h3>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color }}>{mode === 'private' ? '個人判断' : '表示'}: {label}{nextMove ? ` · ${nextMove}` : ''}</div>
      <DetailList title={signal === 'WAIT_PULLBACK' ? '良い材料として見る理由' : '調査候補として見る理由'} items={rule.reasons} color="var(--mint-deep)" mark="✓" />
      <DetailList title="過去5年から見た罠" items={rule.risks} color="var(--amber)" mark="!" />
      <DetailList title="先に確認すること" items={rule.evidenceNeeded} color="var(--sky-deep)" mark="□" />
      <DetailList title="崩れたら見送り" items={rule.invalidationSignals} color="var(--urgent)" mark="×" />
      <PriceSignalStrip rule={rule} />
    </div>
  )
}

export default function ActionsPage() {
  const data = loadGeneratedData()
  const mode = getAppMode()
  const ruleLoad = normalizeGeneratedCompanyRules((data as Record<string, unknown>).generatedCompanyRules)
  const rules = ruleLoad.rows as GeneratedStockRule[]
  const bySignal = SIGNAL_ORDER.reduce<Record<string, GeneratedStockRule[]>>((acc, sig) => {
    acc[sig] = rules.filter(r => r.actionSignal === sig)
    return acc
  }, {})
  const totalActive = rules.filter(r => r.actionSignal !== 'NO_ACTION' && r.actionSignal !== 'HOLD').length

  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 8, padding: '52px 20px 12px', background: 'var(--header-bg)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lavender-deep)', marginBottom: 2 }}>自動生成ルール · 行動候補</div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>行動候補</h1>
          </div>
          {totalActive > 0 && <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 10, background: 'var(--sky-soft)', color: 'var(--sky-deep)' }}>{totalActive} 件</span>}
        </div>
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        {ruleLoad.warning && (
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 11.5, fontWeight: 700 }}>
            一部の行動候補データを安全のため除外しました（{ruleLoad.warning}）
          </div>
        )}
        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>行動候補なし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}><code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm generate:company-rules</code> を実行してください</p>
          </div>
        ) : SIGNAL_ORDER.map(sig => {
          const items = bySignal[sig]
          if (!items || items.length === 0) return null
          const label = toDisplaySignal(sig, mode)
          return (
            <div key={sig} style={{ marginBottom: 16 }}>
              <SectionLabel icon={<Icon name="spark" size={15} />}><span style={{ color: getSignalColor(sig) }}>{label}</span><span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-3)' }}>{items.length} 件</span></SectionLabel>
              {items.map(r => <ActionCard key={r.generatedRuleId} rule={r} mode={mode} />)}
            </div>
          )
        })}
        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
