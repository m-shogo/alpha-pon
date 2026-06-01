'use client'

import { useState } from 'react'
import type { Candidate, CandidateStatus } from '@/lib/types'
import { STATUS_META } from '@/lib/labels'
import { SectionLabel } from './Card'
import { CandidateCard } from './CandidateCard'

type Props = {
  candidates: Candidate[]
}

const WL_ORDER: CandidateStatus[] = ['research', 'watch', 'candidate', 'active', 'ignore', 'expired']

export function WatchlistClient({ candidates }: Props) {
  const [filter, setFilter] = useState<CandidateStatus | 'all'>('all')

  const counts: Partial<Record<CandidateStatus, number>> = {}
  candidates.forEach((c) => { counts[c.status] = (counts[c.status] ?? 0) + 1 })

  const shown = filter === 'all' ? candidates : candidates.filter((c) => c.status === filter)
  const groups = WL_ORDER.filter((s) => shown.some((c) => c.status === s))

  const chip = (key: CandidateStatus | 'all', label: string, n: number) => {
    const on = filter === key
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        style={{
          padding: '7px 13px', borderRadius: 99,
          border: '1px solid ' + (on ? 'var(--accent)' : 'var(--card-line)'),
          background: on ? 'var(--accent)' : 'var(--surface)',
          color: on ? '#fff' : 'var(--ink-2)',
          fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--ui)',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {label}<span style={{ opacity: 0.7, marginLeft: 5 }}>{n}</span>
      </button>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 16px 4px', scrollbarWidth: 'none' }}>
        {chip('all', 'すべて', candidates.length)}
        {WL_ORDER.filter((s) => counts[s]).map((s) => chip(s, STATUS_META[s].jp, counts[s]!))}
      </div>
      <div style={{ padding: '8px 16px 0' }}>
        {groups.map((s) => (
          <div key={s}>
            <SectionLabel>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_META[s].colorVar }} />
                {STATUS_META[s].jp}
              </span>
            </SectionLabel>
            {shown.filter((c) => c.status === s).map((c) => (
              <CandidateCard key={c.code} cand={c} />
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, padding: '32px 0' }}>
            候補がありません
          </p>
        )}
        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, margin: '10px 0 4px' }}>
          削除ではなく status を変える設計です。
        </p>
      </div>
    </>
  )
}
