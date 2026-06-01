import { notFound } from 'next/navigation'
import Link from 'next/link'
import { loadGeneratedData } from '@/lib/generated-data'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { Card, SectionLabel } from '@/components/Card'
import { Icon } from '@/components/Icon'
import { PrioBadge, StatusPill, TagChip } from '@/components/Badge'
import { ScoreViz } from '@/components/ScoreViz'
import { Sparkline } from '@/components/Sparkline'
import { ChecklistCard } from '@/components/ChecklistCard'
import { Disclaimer } from '@/components/Disclaimer'
import { formatPrice, formatPercent } from '@/lib/format'

type Props = {
  params: Promise<{ code: string }>
}

export async function generateStaticParams() {
  try {
    const data = loadGeneratedData()
    return data.candidates.map((c) => ({ code: c.code }))
  } catch {
    return []
  }
}

export default async function CompanyPage({ params }: Props) {
  const { code } = await params
  const data = loadGeneratedData()
  const cand = data.candidates.find((c) => c.code === code)
  if (!cand) notFound()

  const total = calcTotal(cand.score)
  const level = calcLevel(total)
  const a = ALERT_META[level]

  const priceText = formatPrice(cand.price)
  const changeText = formatPercent(cand.changePct, true)
  const drawdownText = typeof cand.drawdownPct === 'number' && Number.isFinite(cand.drawdownPct)
    ? `高値から ${cand.drawdownPct}%`
    : '価格データ未取得'
  const changeColor = typeof cand.changePct === 'number' && cand.changePct >= 0
    ? 'var(--mint-deep)'
    : 'var(--ink-3)'

  return (
    <>
      {/* sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 8,
        padding: '50px 14px 12px',
        background: 'var(--header-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Link href="/" style={{
          width: 38, height: 38, borderRadius: 12,
          border: '1px solid var(--card-line)', background: 'var(--surface)',
          color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none', flexShrink: 0,
        }}>
          <Icon name="back" size={20} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 19, color: 'var(--ink)', lineHeight: 1 }}>
            {cand.name}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginTop: 2 }}>
            {cand.code} ・ {cand.market}
          </div>
        </div>
        <PrioBadge priority={cand.priority} />
        <StatusPill status={cand.status} />
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* score + price hero */}
        <Card pad={18}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 10px' }}>
            <ScoreViz score={cand.score} variant="ring" />
          </div>

          {/* triggered rule */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 12px', marginTop: 8,
            background: 'var(--accent-soft)', borderRadius: 14,
          }}>
            <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}>
              <Icon name="spark" size={16} />
            </span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>発火ルール</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{cand.triggeredRule}</div>
            </div>
          </div>

          {/* price */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>株価</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>
                  {priceText}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: changeColor }}>{changeText}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginTop: 2 }}>{drawdownText}</div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Sparkline data={cand.sparkline ?? [100, 100]} color="auto" w={120} h={40} />
            </div>
          </div>
        </Card>

        {/* disclaimer */}
        <div style={{
          margin: '14px 0 4px',
          padding: '10px 14px',
          background: 'var(--urgent-soft)',
          borderRadius: 12,
          fontSize: 12.5,
          fontWeight: 700,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}>
          ※ 買い推奨ではありません。これは調査候補です。投資判断はご自身の責任で行ってください。
        </div>

        {/* score bars */}
        <SectionLabel icon={<Icon name="arc" size={15} />}>スコア内訳</SectionLabel>
        <Card pad={18}>
          <ScoreViz score={cand.score} variant="bars" />
        </Card>

        {/* reasons */}
        <SectionLabel icon={<Icon name="check" size={15} />}>検出理由</SectionLabel>
        <Card pad={6}>
          {cand.reasons.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 12px',
              borderBottom: i < cand.reasons.length - 1 ? '1px solid var(--line)' : 'none',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 7,
                background: 'var(--mint-soft)', color: 'var(--mint-deep)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1,
              }}>
                <Icon name="check" size={13} strokeWidth={2.8} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>{r}</span>
            </div>
          ))}
        </Card>

        {/* negative reasons */}
        <SectionLabel icon={<Icon name="alert" size={15} />}>注意点・下がる理由</SectionLabel>
        <Card pad={6}>
          {cand.negativeReasons.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '9px 12px',
              borderBottom: i < cand.negativeReasons.length - 1 ? '1px solid var(--line)' : 'none',
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: 7,
                background: 'var(--amber-soft)', color: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 1,
              }}>
                <Icon name="alert" size={13} strokeWidth={2.4} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>{r}</span>
            </div>
          ))}
        </Card>

        {/* checklist (interactive) */}
        <SectionLabel icon={<Icon name="doc" size={15} />}>次に見るもの</SectionLabel>
        <ChecklistCard items={cand.nextToSee} />

        {/* meta */}
        <SectionLabel>銘柄メモ</SectionLabel>
        <Card>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {cand.tags.map((t) => <TagChip key={t}>#{t}</TagChip>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>最終通知</span>
              <span style={{ color: 'var(--ink)' }}>{cand.lastNotifiedAt ?? '未通知'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>暫定スコア</span>
              <span style={{ color: a.colorVar, fontWeight: 700 }}>{total}/100</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>マーケット</span>
              <span style={{ color: 'var(--ink)' }}>{cand.market}</span>
            </div>
          </div>
        </Card>

        {/* actions */}
        <div style={{ display: 'flex', gap: 10, margin: '18px 0 6px' }}>
          <Link href="/reports" style={{
            flex: 1, height: 50, borderRadius: 15,
            border: '1px solid var(--card-line)', background: 'var(--surface)',
            color: 'var(--ink)', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            textDecoration: 'none',
          }}>
            <Icon name="doc" size={18} />レポート
          </Link>
          <Link href="/" style={{
            flex: 1, height: 50, borderRadius: 15,
            border: 'none', background: 'var(--accent)',
            color: '#fff', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            textDecoration: 'none',
            boxShadow: '0 6px 16px var(--accent-shadow)',
          }}>
            <Icon name="back" size={18} color="#fff" />戻る
          </Link>
        </div>

        {/* 免責表示 */}
        <Disclaimer />

        <div style={{ height: 24 }} />
      </div>
    </>
  )
}
