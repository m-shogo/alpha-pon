import Link from 'next/link'
import type { Candidate } from '@/lib/types'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META } from '@/lib/labels'
import { AlertBadge, PrioBadge, StatusPill, TagChip } from './Badge'
import { Sparkline } from './Sparkline'

type Props = {
  cand: Candidate
}

function safeNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function CandidateCard({ cand }: Props) {
  const total = calcTotal(cand.score)
  const level = calcLevel(total)
  const a = ALERT_META[level]

  return (
    <Link
      href={`/stocks/${cand.code}`}
      style={{ textDecoration: 'none', display: 'block', marginBottom: 11 }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 20,
          padding: 15,
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--card-line)',
          transition: 'transform .12s ease',
        }}
      >
        {/* Row 1: prio + name + score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PrioBadge priority={cand.priority} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                {cand.name}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)' }}>{cand.code}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <StatusPill status={cand.status} />
              <span style={{
                fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {cand.triggeredRule}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 30, lineHeight: 0.9, color: a.colorVar }}>
                {total}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>/100</span>
            </div>
            <AlertBadge level={level} dot />
          </div>
        </div>

        {/* Row 2: tags + sparkline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
            {cand.tags.slice(0, 2).map((t) => <TagChip key={t}>{t}</TagChip>)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Sparkline data={cand.sparkline ?? [100, 100]} color="auto" />
            {safeNum(cand.changePct) ? (
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: cand.changePct! >= 0 ? 'var(--mint-deep)' : 'var(--urgent)',
              }}>
                {cand.changePct! >= 0 ? '+' : ''}{cand.changePct}%
              </span>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>--</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
