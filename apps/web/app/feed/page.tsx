import { loadGeneratedData } from '@/lib/generated-data'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { AlertBadge } from '@/components/Badge'
import Link from 'next/link'

export default function FeedPage() {
  const data = loadGeneratedData()

  // フィードを候補から構築（スコア上位 / 最終通知日付ベース）
  const feedItems = data.candidates
    .filter((c) => c.lastNotifiedAt)
    .map((c) => ({
      code: c.code,
      name: c.name,
      total: calcTotal(c.score),
      level: calcLevel(calcTotal(c.score)),
      reason: c.triggeredRule || '—',
      lastNotifiedAt: c.lastNotifiedAt!,
    }))
    .sort((a, b) => b.total - a.total)

  // 日付でグループ化
  const byDate: Record<string, typeof feedItems> = {}
  feedItems.forEach((f) => {
    const date = f.lastNotifiedAt.split(' ')[0] ?? f.lastNotifiedAt
    ;(byDate[date] = byDate[date] ?? []).push(f)
  })
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <>
      {/* header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '52px 20px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', letterSpacing: 0.3, marginBottom: 2 }}>
              urgent / daily / log
            </div>
            <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--ink)', letterSpacing: 0.2 }}>
              通知フィード
            </h1>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <Icon name="bell" size={19} />
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 16px 0' }}>
        {dates.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, padding: '32px 0' }}>
            通知がありません
          </p>
        ) : (
          dates.map((date) => (
            <div key={date}>
              <SectionLabel>{date}</SectionLabel>
              {byDate[date].map((f) => {
                const a = ALERT_META[f.level]
                return (
                  <Link key={f.code} href={`/companies/${f.code}`} style={{ display: 'block', marginBottom: 10, textDecoration: 'none' }}>
                    <Card pad={14}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 99, background: a.colorVar, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <AlertBadge level={f.level} dot />
                            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                              {f.name}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>{f.code}</span>
                          </div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.4 }}>
                            {f.reason}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>スコア {f.total}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ))
        )}
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
