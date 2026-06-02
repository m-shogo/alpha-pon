export type AppMode = 'private' | 'portfolio'

export type InternalSignal =
  | 'ENTRY_WATCH'
  | 'ADD_WATCH'
  | 'HOLD'
  | 'TRIM_WATCH'
  | 'EXIT_WATCH'
  | 'NO_ACTION'
  | 'DANGER'

export type PublicSignal =
  | '監視候補'
  | '優先監視'
  | '保有観察'
  | '一部整理検討'
  | '撤退検討'
  | '様子見'
  | '要注意'
  | '危険'

export function getAppMode(): AppMode {
  return process.env.APP_MODE === 'portfolio' ? 'portfolio' : 'private'
}

export function toDisplaySignal(signal: InternalSignal, mode: AppMode): string {
  if (mode === 'private') {
    const map: Record<InternalSignal, string> = {
      ENTRY_WATCH: '新規買い候補',
      ADD_WATCH: '買い足し候補',
      HOLD: '保有継続',
      TRIM_WATCH: '一部売り検討',
      EXIT_WATCH: '撤退検討',
      NO_ACTION: '何もしない',
      DANGER: '危険',
    }
    return map[signal]
  }
  const map: Record<InternalSignal, string> = {
    ENTRY_WATCH: '監視候補',
    ADD_WATCH: '優先監視',
    HOLD: '保有観察',
    TRIM_WATCH: '一部整理検討',
    EXIT_WATCH: '撤退検討',
    NO_ACTION: '様子見',
    DANGER: '危険',
  }
  return map[signal]
}

export function getDisclaimer(mode: AppMode): string {
  if (mode === 'private') {
    return '自分用メモです。最終判断は自分で行います。自動売買は行いません。'
  }
  return 'このアプリは投資判断を支援するための個人用リサーチツールです。特定銘柄の売買を推奨するものではありません。最終判断はご自身で行ってください。'
}

export function getSignalColor(signal: InternalSignal): string {
  switch (signal) {
    case 'ENTRY_WATCH': return 'var(--sky-deep)'
    case 'ADD_WATCH': return 'var(--mint-deep)'
    case 'HOLD': return 'var(--ink-2)'
    case 'TRIM_WATCH': return 'var(--amber)'
    case 'EXIT_WATCH': return 'var(--urgent)'
    case 'NO_ACTION': return 'var(--ink-3)'
    case 'DANGER': return 'var(--urgent)'
  }
}

export function getSignalBg(signal: InternalSignal): string {
  switch (signal) {
    case 'ENTRY_WATCH': return 'var(--sky-soft)'
    case 'ADD_WATCH': return 'var(--mint-soft)'
    case 'HOLD': return 'var(--surface-2)'
    case 'TRIM_WATCH': return 'var(--amber-soft)'
    case 'EXIT_WATCH': return 'rgba(var(--urgent-rgb, 220,50,50),0.1)'
    case 'NO_ACTION': return 'var(--surface-2)'
    case 'DANGER': return 'rgba(var(--urgent-rgb, 220,50,50),0.12)'
  }
}
