import { loadGeneratedData } from '@/lib/generated-data'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { CandidateCard } from '@/components/CandidateCard'
import { ProCommandCard } from '@/components/ProCommandCard'
import { SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { Disclaimer } from '@/components/Disclaimer'
import Link from 'next/link'

export const metadata = {
  title: 'alpha-pon — ホーム',
}

export default function HomePage() {
  const data = loadGeneratedData()

  const list = data.candidates
    .map((c) => ({ c, total: calcTotal(c.score) }))
    .filter((x) => x.total >= 50)
    .sort((a, b) => b.total - a.total)

  const counts = { urgent: 0, daily: 0, log: 0 }
  list.forEach(({ total }) => {
    const lv = calcLevel(total)
    if (lv === 'urgent' || lv === 'daily' || lv === 'log') counts[lv]++
  })

  return (
    <>
      {/* sticky header */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 8,
          padding: '52px 20px 12px',
          background: 'var(--header-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.3, marginBottom: 2 }}>
              Pro会議・改善ロードマップ連携
            </div>
            <h1
              style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 27, color: 'var(--accent)', letterSpacing: 0.2 }}
            >
              alpha-pon
            </h1>
          </div>
          <div
            style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}
          >
            <Icon name="spark" size={20} />
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* pipeline warnings */}
        {(data.meta?.warnings ?? []).length > 0 && (
          <div style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--amber-soft)', borderRadius: 10, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
            <div style={{ fontWeight: 800, color: 'var(--amber)', marginBottom: 4 }}>⚠ データ更新に問題が発生しました</div>
            {(data.meta?.warnings ?? []).map((w, i) => (
              <div key={i} style={{ marginTop: 2 }}>• {w}</div>
            ))}
          </div>
        )}
        {/* data meta row */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', marginBottom: 12,
            background: 'var(--surface)', borderRadius: 12,
            border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)',
          }}
        >
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>最終生成: </span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>
              {data.generatedAt ?? '未生成'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>銘柄数: </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{data.candidates.length}</span>
            </div>
          </div>
        </div>

        {/* alert counts */}
        <div style={{ display: 'flex', gap: 9 }}>
          {(['urgent', 'daily', 'log'] as const).map((lv) => {
            const a = ALERT_META[lv]
            return (
              <div
                key={lv}
                style={{
                  flex: 1, background: 'var(--surface)', borderRadius: 16, padding: '12px 10px',
                  border: '1px solid var(--card-line)', boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: a.colorVar }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>{a.jp}</span>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, color: a.colorVar, marginTop: 2 }}>
                  {counts[lv]}<span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}> 件</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* quick links */}
        <div style={{ display: 'flex', gap: 9, marginTop: 9 }}>
          <Link
            href="/stocks"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 9,
              padding: '12px 13px', borderRadius: 16,
              border: '1px solid var(--card-line)', background: 'var(--surface)',
              boxShadow: 'var(--shadow)', textDecoration: 'none',
            }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--mint-soft)', color: 'var(--mint-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="watch" size={17} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>銘柄一覧</span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--mint-deep)' }}>
                {data.candidates.length} 銘柄 / スコア順
              </span>
            </span>
          </Link>
          <Link
            href="/reports"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 9,
              padding: '12px 13px', borderRadius: 16,
              border: '1px solid var(--card-line)', background: 'var(--surface)',
              boxShadow: 'var(--shadow)', textDecoration: 'none',
            }}
          >
            <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--sky-soft)', color: 'var(--sky-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="doc" size={17} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Pro レポート</span>
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sky-deep)' }}>
                {data.reports.filter((r) => r.available).length} 件 生成済み
              </span>
            </span>
          </Link>
        </div>

        {/* Pro dashboard card */}
        <ProCommandCard data={data} />

        {/* candidate list */}
        <SectionLabel icon={<Icon name="spark" size={15} />}>注目候補（スコア順）</SectionLabel>

        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600 }}>
            <p>データがありません</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              ルートで{' '}
              <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
                pnpm ui:data
              </code>{' '}
              を実行してください
            </p>
          </div>
        ) : (
          list.map(({ c }) => <CandidateCard key={c.code} cand={c} />)
        )}

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, margin: '14px 0 4px', lineHeight: 1.6 }}>
          スコア49点以下は表示されません。<br />
          重要判断はPro会議・IRイベント・決算/総会確認を優先します。
        </p>

        {/* 免責表示 */}
        <Disclaimer compact />
        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
