import { SCORE_CATS, calcTotal, calcLevel } from '@/lib/score'
import { AlertBadge } from './Badge'
import type { Score } from '@/lib/types'

type Props = {
  score: Score
  variant?: 'ring' | 'number' | 'bars' | 'radar'
}

function ScoreNumber({ total, level, big }: { total: number; level: ReturnType<typeof calcLevel>; big?: boolean }) {
  const colorMap = {
    urgent: 'var(--urgent)',
    daily: 'var(--amber)',
    log: 'var(--sky-deep)',
    ignore: 'var(--ink-3)',
  }
  const color = colorMap[level]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: big ? 88 : 40, lineHeight: 0.9, color }}>
          {total}
        </span>
        <span style={{ fontSize: big ? 22 : 14, fontWeight: 700, color: 'var(--ink-3)' }}>/100</span>
      </div>
      <AlertBadge level={level} dot />
    </div>
  )
}

function ScoreRing({ total, level, size = 168 }: { total: number; level: ReturnType<typeof calcLevel>; size?: number }) {
  const colorMap = { urgent: 'var(--urgent)', daily: 'var(--amber)', log: 'var(--sky-deep)', ignore: 'var(--ink-3)' }
  const color = colorMap[level]
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  const off = c * (1 - total / 100)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth="12" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.3,1,.4,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: size * 0.34, lineHeight: 0.9, color }}>
          {total}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', marginTop: -2 }}>/ 100</span>
        <div style={{ marginTop: 4 }}><AlertBadge level={level} /></div>
      </div>
    </div>
  )
}

function ScoreBars({ score, total, level }: { score: Score; total: number; level: ReturnType<typeof calcLevel> }) {
  const colorMap = { urgent: 'var(--urgent)', daily: 'var(--amber)', log: 'var(--sky-deep)', ignore: 'var(--ink-3)' }
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 38, lineHeight: 1, color: colorMap[level] }}>
          {total}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-3)' }}>/100</span>
        <span style={{ marginLeft: 'auto' }}><AlertBadge level={level} dot /></span>
      </div>
      {SCORE_CATS.map((cat) => {
        const v = score[cat.key]
        return (
          <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 78, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', flexShrink: 0 }}>
              {cat.label}
            </span>
            <div style={{ flex: 1, height: 9, borderRadius: 99, background: 'var(--line-strong)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(v / cat.max) * 100}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: cat.color,
                  transition: 'width .6s cubic-bezier(.3,1,.4,1)',
                }}
              />
            </div>
            <span style={{ width: 42, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>
              {v}<span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>/{cat.max}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ScoreRadar({ score, total, level, size = 200 }: { score: Score; total: number; level: ReturnType<typeof calcLevel>; size?: number }) {
  const colorMap = { urgent: 'var(--urgent)', daily: 'var(--amber)', log: 'var(--sky-deep)', ignore: 'var(--ink-3)' }
  const cats = SCORE_CATS
  const cx = size / 2, cy = size / 2, R = size / 2 - 28, n = cats.length
  const ang = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, f: number): [number, number] => [
    cx + Math.cos(ang(i)) * R * f,
    cy + Math.sin(ang(i)) * R * f,
  ]
  const grid = (f: number) => cats.map((_, i) => pt(i, f).join(',')).join(' ')
  const poly = cats.map((c, i) => pt(i, score[c.key] / c.max).join(',')).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        {([0.25, 0.5, 0.75, 1] as const).map((f) => (
          <polygon key={f} points={grid(f)} fill="none" stroke="var(--line-strong)" strokeWidth="1" />
        ))}
        {cats.map((_, i) => {
          const [x, y] = pt(i, 1)
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line-strong)" strokeWidth="1" />
        })}
        <polygon points={poly} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" />
        {cats.map((c, i) => {
          const [x, y] = pt(i, score[c.key] / c.max)
          return <circle key={i} cx={x} cy={y} r="3" fill={c.color} />
        })}
        {cats.map((c, i) => {
          const [x, y] = pt(i, 1.22)
          return (
            <text
              key={i} x={x} y={y}
              textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 10.5, fontWeight: 700, fill: 'var(--ink-2)', fontFamily: 'var(--ui)' }}
            >
              {c.label}
            </text>
          )
        })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 30, color: colorMap[level] }}>{total}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)' }}>/100</span>
        <span style={{ marginLeft: 4 }}><AlertBadge level={level} /></span>
      </div>
    </div>
  )
}

export function ScoreViz({ score, variant = 'ring' }: Props) {
  const total = calcTotal(score)
  const level = calcLevel(total)

  if (variant === 'ring')   return <ScoreRing total={total} level={level} />
  if (variant === 'bars')   return <ScoreBars score={score} total={total} level={level} />
  if (variant === 'radar')  return <ScoreRadar score={score} total={total} level={level} />
  return <ScoreNumber total={total} level={level} big />
}
