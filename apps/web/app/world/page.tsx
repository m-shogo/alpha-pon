import { loadGeneratedData } from '@/lib/generated-data'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'

export const metadata = { title: '世界情勢 | alpha-pon' }

const LEVEL_COLOR: Record<string, string> = {
  high_watch: 'var(--urgent)',
  watch: 'var(--amber)',
  low: 'var(--sky-deep)',
}

const LEVEL_LABEL: Record<string, string> = {
  high_watch: '高監視',
  watch: '監視',
  low: '低',
}

export default function WorldPage() {
  const data = loadGeneratedData()
  const world = data.worldContext

  if (!world) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--ink-3)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🌐</div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>
          世界情勢データなし
        </h2>
        <p style={{ fontSize: 13, fontWeight: 600 }}>
          <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
            pnpm ui:data
          </code>{' '}
          を実行してください
        </p>
      </div>
    )
  }

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
            {world.asOf} 更新 ・ {world.mode}
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)' }}>
            世界情勢
          </h1>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* 総括 */}
        <Card pad={14} style={{ marginBottom: 16, background: 'linear-gradient(135deg, var(--surface), var(--surface-2))' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--lavender-deep)', marginBottom: 6 }}>現在の総括</div>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.6 }}>
            {world.summary}
          </p>
        </Card>

        {/* アクティブ情勢 */}
        <SectionLabel icon={<Icon name="alert" size={15} />}>監視中の情勢</SectionLabel>

        {world.activeRegimes.map(regime => {
          const color = LEVEL_COLOR[regime.level] ?? 'var(--ink-3)'
          const label = LEVEL_LABEL[regime.level] ?? regime.level
          return (
            <Card key={regime.id} pad={14} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 4, borderRadius: 99, background: color, flexShrink: 0, alignSelf: 'stretch',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, color, background: color + '20',
                      borderRadius: 5, padding: '2px 7px',
                    }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                      {regime.id.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {regime.why}
                  </p>

                  {regime.watchCategories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {regime.watchCategories.map(cat => (
                        <span key={cat} style={{
                          fontSize: 11.5, fontWeight: 700, color: 'var(--sky-deep)',
                          background: 'var(--sky-soft)', borderRadius: 6, padding: '2px 8px',
                        }}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}

                  {regime.caution.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-3)', marginBottom: 4 }}>注意点</div>
                      {regime.caution.map((c, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 3 }}>
                          <span style={{ color: 'var(--amber)', flexShrink: 0 }}>⚠</span>
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}

        {/* 運用ルール */}
        {world.operatingRules.length > 0 && (
          <>
            <SectionLabel icon={<Icon name="doc" size={15} />}>運用ルール</SectionLabel>
            <Card pad={12}>
              {world.operatingRules.map((rule, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)',
                  padding: '7px 0',
                  borderBottom: i < world.operatingRules.length - 1 ? '1px solid var(--line)' : 'none',
                  lineHeight: 1.5,
                }}>
                  <span style={{ color: 'var(--lavender-deep)', flexShrink: 0 }}>•</span>
                  {rule}
                </div>
              ))}
            </Card>
          </>
        )}

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
