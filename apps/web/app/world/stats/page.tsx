import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Link from 'next/link'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'

export const metadata = { title: '世界情勢候補仮説 集計 | alpha-pon' }

type ThemeStat = {
  theme: string
  total: number
  resultCounts: Record<string, number>
  recent: Array<{
    candidateCode: string
    candidateCompany: string
    reviewedAt: string
    afterDays: number
    result: string
    memo: string
  }>
}

type Stats = {
  generatedAt?: string
  total?: number
  byTheme?: ThemeStat[]
  recent?: Array<{
    theme: string
    candidateCode: string
    candidateCompany: string
    reviewedAt: string
    afterDays: number
    result: string
    memo: string
  }>
}

function loadStats(): Stats | null {
  const candidates = [
    join(process.cwd(), '..', '..', 'reports', 'world_theme_candidate_stats_latest.json'),
    join(process.cwd(), 'reports', 'world_theme_candidate_stats_latest.json'),
  ]
  const path = candidates.find(p => existsSync(p))
  if (!path) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Stats
  } catch {
    return null
  }
}

export default function WorldStatsPage() {
  const stats = loadStats()
  const byTheme = stats?.byTheme ?? []
  const recent = stats?.recent ?? []

  return (
    <div style={{ padding: '52px 16px 28px' }}>
      <Link href="/world" style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', textDecoration: 'none' }}>
        ← 世界情勢へ
      </Link>
      <h1 style={{ margin: '8px 0 4px', fontFamily: 'var(--display)', fontSize: 25, color: 'var(--accent)' }}>
        世界情勢候補仮説 集計
      </h1>
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-2)', fontWeight: 700 }}>
        手動評価した世界情勢候補仮説をテーマ別に集計します。買い推奨ではなく、仮説の振り返りです。
      </p>

      <Card pad={12} style={{ marginBottom: 12, background: 'var(--sky-soft)' }}>
        <div style={{ fontSize: 12, fontWeight: 850, color: 'var(--sky-deep)' }}>
          total: {stats?.total ?? 0} / generated: {stats?.generatedAt ?? '未生成'}
        </div>
      </Card>

      <SectionLabel icon={<Icon name="spark" size={15} />}>テーマ別</SectionLabel>
      {byTheme.length === 0 ? (
        <Card pad={14} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>
            まだ評価結果がありません。
          </div>
        </Card>
      ) : byTheme.map(stat => (
        <Card key={stat.theme} pad={14} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ink)' }}>{stat.theme}</div>
            <div style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--sky-deep)' }}>total {stat.total}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(stat.resultCounts).map(([key, value]) => (
              <span key={key} style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 7, padding: '3px 8px' }}>
                {key}: {value}
              </span>
            ))}
          </div>
        </Card>
      ))}

      <SectionLabel icon={<Icon name="doc" size={15} />}>最近の評価</SectionLabel>
      {recent.slice(-10).reverse().map((row, index) => (
        <Card key={`${row.candidateCode}-${row.reviewedAt}-${index}`} pad={13} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 850, color: 'var(--ink)', marginBottom: 3 }}>
            {row.theme} / {row.candidateCode} {row.candidateCompany}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            {row.reviewedAt} / {row.afterDays}日後 / {row.result}{row.memo ? ` / ${row.memo}` : ''}
          </div>
        </Card>
      ))}
    </div>
  )
}
