type Props = {
  data: number[]
  w?: number
  h?: number
  color?: string
}

export function Sparkline({ data, w = 64, h = 24, color = 'var(--accent)' }: Props) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const rng = max - min || 1
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - ((v - min) / rng) * (h - 4) - 2,
  ])
  const d = pts
    .map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)
    .join(' ')
  const up = data[data.length - 1] >= data[0]
  const c = color === 'auto' ? (up ? 'var(--mint-deep)' : 'var(--urgent)') : color
  const last = pts[pts.length - 1]

  return (
    <svg
      width={w}
      height={h}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={c} />
    </svg>
  )
}
