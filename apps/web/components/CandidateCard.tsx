import Link from 'next/link'
import type { Candidate } from '@/lib/types'
import { calcTotal, calcLevel } from '@/lib/score'
import { ALERT_META, STATUS_META } from '@/lib/labels'
import { PrioBadge } from './Badge'
import { Sparkline } from './Sparkline'
import styles from './CandidateCard.module.css'

type Props = {
  cand: Candidate
}

function safeNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function CandidateCard({ cand }: Props) {
  const total = calcTotal(cand.score)
  const level = calcLevel(total)
  const alert = ALERT_META[level]
  const status = STATUS_META[cand.status]

  return (
    <Link href={`/stocks/${cand.code}`} className={styles.link}>
      <article className={styles.row}>
        <div className={styles.top}>
          <PrioBadge priority={cand.priority} />

          <div className={styles.identity}>
            <div className={styles.nameRow}>
              <span className={styles.name}>{cand.name}</span>
              <span className={styles.code}>{cand.code}</span>
            </div>
            <div className={styles.ruleRow}>
              <span className={styles.status}>
                <span className={styles.statusDot} style={{ background: status.colorVar }} />
                {status.jp}
              </span>
              <span className={styles.rule}>{cand.triggeredRule}</span>
            </div>
          </div>

          <div className={styles.score}>
            <div className={styles.scoreLine}>
              <span className={styles.scoreValue} style={{ color: alert.colorVar }}>{total}</span>
              <span className={styles.scoreMax}>/100</span>
            </div>
            <span className={styles.alert}>
              <span className={styles.alertDot} style={{ background: alert.colorVar }} />
              {alert.jp}
            </span>
          </div>
        </div>

        <div className={styles.bottom}>
          <div className={styles.tags}>
            {cand.tags.length > 0 ? cand.tags.slice(0, 2).join(' · ') : 'タグ未設定'}
          </div>
          <div className={styles.market}>
            <Sparkline data={cand.sparkline ?? [100, 100]} color="auto" />
            {safeNum(cand.changePct) ? (
              <span
                className={styles.change}
                style={{ color: cand.changePct >= 0 ? 'var(--mint-deep)' : 'var(--urgent)' }}
              >
                {cand.changePct >= 0 ? '+' : ''}{cand.changePct}%
              </span>
            ) : (
              <span className={styles.change} style={{ color: 'var(--ink-3)' }}>--</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
