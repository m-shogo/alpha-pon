import { loadGeneratedData } from '@/lib/generated-data'
import { SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import type { GeneratedStockRule } from '@/lib/stock/rules/types'
import type { HypothesisOutcome } from '@/types/universe'

export const metadata = { title: 'ルール | alpha-pon' }

function RuleRow({ rule }: { rule: GeneratedStockRule }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
      border: '1px solid var(--card-line)', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{rule.code}</span>
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{rule.name}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{rule.generatedAt.slice(0, 10)}</span>
      </div>
      {rule.thesis.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>{rule.thesis[0]}</div>
      )}
      {rule.invalidationSignals.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)' }}>仮説崩れシグナル: </span>
          <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{rule.invalidationSignals[0]}</span>
        </div>
      )}
    </div>
  )
}

function ImprovementRow({ outcome }: { outcome: HypothesisOutcome }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
      border: '1px solid var(--card-line)', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{outcome.code}</span>
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{outcome.name}</span>
          <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 5px', borderRadius: 4, background: outcome.result === 'hit' ? 'var(--mint-soft)' : 'var(--amber-soft)', color: outcome.result === 'hit' ? 'var(--mint-deep)' : 'var(--amber)', fontWeight: 700 }}>
            {outcome.result}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{outcome.evaluatedAt?.slice(0, 10)}</span>
      </div>
      {outcome.notes && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>{outcome.notes}</div>
      )}
    </div>
  )
}

export default function RulesPage() {
  const data = loadGeneratedData()
  const rules: GeneratedStockRule[] = (data as Record<string, unknown>).generatedCompanyRules as GeneratedStockRule[] ?? []
  const outcomes: HypothesisOutcome[] = data.hypothesisOutcomes ?? []

  const hits = outcomes.filter(o => o.result === 'hit')
  const misses = outcomes.filter(o => o.result === 'miss')

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
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--lavender-deep)', marginBottom: 2 }}>
            ルール履歴 · 改善候補
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
            ルール
          </h1>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* 勝率サマリー */}
        {outcomes.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { label: '検証済み', val: outcomes.length, color: 'var(--ink-2)' },
              { label: '当たり', val: hits.length, color: 'var(--mint-deep)' },
              { label: '外れ', val: misses.length, color: 'var(--amber)' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, background: 'var(--surface)', borderRadius: 12, padding: '10px 12px', border: '1px solid var(--card-line)', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.val}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{item.label}</div>
              </div>
            ))}
          </div>
        )}

        {rules.length > 0 && (
          <>
            <SectionLabel icon={<Icon name="doc" size={15} />}>
              自動生成ルール一覧
            </SectionLabel>
            {rules.map(r => <RuleRow key={r.generatedRuleId} rule={r} />)}
          </>
        )}

        {outcomes.length > 0 && (
          <>
            <div style={{ marginTop: 16 }}>
              <SectionLabel icon={<Icon name="check" size={15} />}>
                検証済み仮説
              </SectionLabel>
              {outcomes.map((o, i) => <ImprovementRow key={i} outcome={o} />)}
            </div>
          </>
        )}

        {rules.length === 0 && outcomes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>データなし</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>pnpm generate:company-rules</code> を実行してください
            </p>
          </div>
        )}

        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
