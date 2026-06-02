import { loadGeneratedData } from '@/lib/generated-data'
import { SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import { toDisplaySignal, getSignalColor, getSignalBg, getAppMode } from '@/lib/stock/display-mode'
import type { AppMode, InternalSignal } from '@/lib/stock/display-mode'
import type { GeneratedStockRule } from '@/lib/stock/rules/types'

export const metadata = { title: '行動候補 | alpha-pon' }

const SIGNAL_ORDER: InternalSignal[] = ['DANGER', 'EXIT_WATCH', 'TRIM_WATCH', 'ENTRY_WATCH', 'ADD_WATCH', 'HOLD', 'NO_ACTION']

function ActionCard({ rule, mode }: { rule: GeneratedStockRule; mode: AppMode }) {
  const signal = rule.actionSignal as InternalSignal
  const color = getSignalColor(signal)
  const bg = getSignalBg(signal)
  const label = toDisplaySignal(signal, mode)
  const decisionPrefix = mode === 'private' ? '個人判断' : '表示'

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 16, padding: '14px 15px',
      border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{rule.code}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: bg, color }}>{label}</span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>信頼度 {Math.round(rule.confidence * 100)}%</span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{rule.name}</h3>
          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color }}>
            {decisionPrefix}: {label}
          </div>
        </div>
      </div>

      {rule.reasons.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {rule.reasons.slice(0, 2).map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>✓ {r}</div>
          ))}
        </div>
      )}

      {rule.risks.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {rule.risks.slice(0, 1).map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 2 }}>⚠ {r}</div>
          ))}
        </div>
      )}

      {rule.watchPriceZones.length > 0 && (
        <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 11 }}>
          <span style={{ color: 'var(--ink-3)', fontWeight: 700 }}>監視価格帯: </span>
          <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
            {rule.watchPriceZones[0].priceFrom?.toLocaleString()}〜{rule.watchPriceZones[0].priceTo?.toLocaleString() ?? '—'} 円
          </span>
        </div>
      )}
    </div>
  )
}

export default function ActionsPage() {
  const data = loadGeneratedData()
  const mode = getAppMode()
  const rules: GeneratedStockRule[] = (data as Record<string, unknown>).generatedCompanyRules as GeneratedStockRule[] ?? []

  const bySignal = SIGNAL_ORDER.reduce<Record<string, GeneratedStockRule[]>>((acc, sig) => {
    acc[sig] = rules.filter(r => r.actionSignal === sig)
    return acc
  }, {})

  const totalActive = rules.filter(r => r.actionSignal !== 'NO_ACTION' && r.actionSignal !== 'HOLD').length

  return (
    <>
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '52px 20px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lavender-deep)', marginBottom: 2 }}>
              自動生成ルール · 行動候補
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
              行動候補
            </h1>
          </div>
          {totalActive > 0 && (
            <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 10, background: 'var(--sky-soft)', color: 'var(--sky-deep)' }}>
              {totalActive} 件
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {rules.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>行動候補なし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm generate:company-rules</code> を実行してください
            </p>
          </div>
        ) : (
          <>
            {SIGNAL_ORDER.map(sig => {
              const items = bySignal[sig]
              if (!items || items.length === 0) return null
              const label = toDisplaySignal(sig, mode)
              const color = getSignalColor(sig)
              return (
                <div key={sig} style={{ marginBottom: 16 }}>
                  <SectionLabel icon={<Icon name="spark" size={15} />}>
                    <span style={{ color }}>{label}</span>
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-3)' }}>{items.length} 件</span>
                  </SectionLabel>
                  {items.map(r => <ActionCard key={r.generatedRuleId} rule={r} mode={mode} />)}
                </div>
              )
            })}
          </>
        )}

        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
