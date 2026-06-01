import type { CandidateStatus, AlertLevel, Priority } from './types'

export const ALERT_META: Record<AlertLevel, { jp: string; colorVar: string; softVar: string }> = {
  urgent: { jp: '即通知',   colorVar: 'var(--urgent)',   softVar: 'var(--urgent-soft)' },
  daily:  { jp: '朝まとめ', colorVar: 'var(--amber)',    softVar: 'var(--amber-soft)' },
  log:    { jp: 'ログ',     colorVar: 'var(--sky-deep)', softVar: 'var(--sky-soft)' },
  ignore: { jp: '無視',     colorVar: 'var(--ink-3)',    softVar: 'rgba(0,0,0,0.04)' },
}

export const STATUS_META: Record<CandidateStatus, { jp: string; colorVar: string; softVar: string }> = {
  candidate: { jp: '候補',     colorVar: 'var(--sky-deep)',      softVar: 'var(--sky-soft)' },
  research:  { jp: '調査',     colorVar: 'var(--lavender-deep)', softVar: 'var(--lavender-soft)' },
  watch:     { jp: '監視',     colorVar: 'var(--accent)',         softVar: 'var(--accent-soft)' },
  active:    { jp: '本命',     colorVar: 'var(--mint-deep)',      softVar: 'var(--mint-soft)' },
  ignore:    { jp: '除外',     colorVar: 'var(--ink-3)',          softVar: 'rgba(0,0,0,0.04)' },
  expired:   { jp: '期限切れ', colorVar: 'var(--ink-3)',          softVar: 'rgba(0,0,0,0.04)' },
}

export const PRIO_META: Record<Priority, { color: string; bgVar: string }> = {
  S: { color: '#fff',           bgVar: 'var(--urgent)' },
  A: { color: '#fff',           bgVar: 'var(--accent)' },
  B: { color: '#fff',           bgVar: 'var(--sky-deep)' },
  C: { color: 'var(--ink-2)',   bgVar: 'var(--line-strong)' },
}
