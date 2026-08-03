const p = (extra?: Record<string, unknown>) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...extra,
})

type Props = {
  name: string
  size?: number
  color?: string
  strokeWidth?: number
}

export function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 2 }: Props) {
  const sp = p({ stroke: color, strokeWidth })
  const paths: Record<string, React.ReactNode> = {
    home:     <path {...sp} d="M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />,
    calendar: <g {...sp}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3" /></g>,
    watch:    <g {...sp}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" /></g>,
    bell:     <path {...sp} d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4" />,
    doc:      <g {...sp}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></g>,
    chevron:  <path {...sp} d="m9 5 7 7-7 7" />,
    back:     <path {...sp} d="m15 5-7 7 7 7" />,
    check:    <path {...sp} d="m4 12 5 5L20 6" />,
    alert:    <g {...sp}><path d="M12 4 2 20h20z" /><path d="M12 10v5M12 18h.01" /></g>,
    spark:    <path {...sp} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
    copy:     <g {...sp}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></g>,
    up:       <path {...sp} d="m6 14 6-6 6 6" />,
    down:     <path {...sp} d="m6 10 6 6 6-6" />,
    filter:   <path {...sp} d="M3 5h18M6 12h12M10 19h4" />,
    arc:      <path {...sp} d="M4 18a8 8 0 1 1 16 0" />,
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
