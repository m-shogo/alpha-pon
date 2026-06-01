import type { AlphaPonGeneratedData } from '@/lib/types'
import { Card, SectionLabel } from './Card'
import { Icon } from './Icon'
import { TagChip } from './Badge'

type Props = {
  data: AlphaPonGeneratedData
}

export function ProCommandCard({ data }: Props) {
  const { summary, reports, generatedAt, headline } = data

  const items = [
    { label: '司令塔',      value: summary.strategic },
    { label: 'データ信頼度', value: summary.pipeline },
    { label: 'Pro会議',     value: summary.committee },
  ].filter((item) => item.value)

  const roadmap = (summary.roadmap || []).slice(0, 3)
  const refresh = (summary.refresh || []).slice(0, 2)

  if (items.length === 0 && roadmap.length === 0 && refresh.length === 0) return null

  return (
    <>
      <SectionLabel icon={<Icon name="spark" size={15} />}>Pro司令塔</SectionLabel>
      <Card
        pad={15}
        style={{ marginBottom: 12, background: 'linear-gradient(135deg, var(--surface), var(--surface-2))' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
              {headline || 'alpha-pon Pro Dashboard'}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2 }}>
              generated: {generatedAt || '未生成'}
            </div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 13,
            background: 'var(--accent-soft)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="doc" size={18} />
          </div>
        </div>

        {items.map((item, i) => (
          <div
            key={item.label}
            style={{
              padding: '9px 0',
              borderTop: i === 0 ? '1px solid var(--line)' : 'none',
              borderBottom: '1px solid var(--line)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', marginBottom: 3 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              {item.value}
            </div>
          </div>
        ))}

        {roadmap.length > 0 && (
          <div style={{ marginTop: 11 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 6 }}>
              次に精度を上げる所
            </div>
            {roadmap.map((r, i) => (
              <div key={i} style={{ fontSize: 12.2, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 4 }}>
                {r}
              </div>
            ))}
          </div>
        )}

        {refresh.length > 0 && (
          <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {refresh.map((r, i) => (
              <TagChip key={i}>{String(r).replace(/^\|\s*/, '').slice(0, 28)}</TagChip>
            ))}
          </div>
        )}

        {reports.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {reports.map((r) => (
              <span
                key={r.key}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 700,
                  color: r.available ? 'var(--mint-deep)' : 'var(--ink-3)',
                  background: r.available ? 'var(--mint-soft)' : 'var(--surface-2)',
                  borderRadius: 6, padding: '2px 7px',
                }}
              >
                {r.label}
              </span>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
