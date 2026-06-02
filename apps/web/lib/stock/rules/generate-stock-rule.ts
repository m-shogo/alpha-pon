import type { GenerateStockRuleInput, GeneratedStockRule, PriceZone, DangerLine } from './types'

export function generateStockRule(input: GenerateStockRuleInput): GeneratedStockRule {
  const reasons: string[] = []
  const risks: string[] = []
  const evidenceNeeded: string[] = []
  const invalidationSignals: string[] = []
  let score = 50

  const now = new Date()
  const generatedAt = now.toISOString()
  const reviewDueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const fastCatalysts = detectFastCatalysts(input)

  if (input.currentPrice == null) {
    if (fastCatalysts.length > 0) {
      return {
        generatedRuleId: `${input.code}-fast-catalyst-${Date.now()}`,
        code: input.code,
        name: input.name,
        generatedAt,
        thesis: input.currentThesis,
        actionSignal: 'ENTRY_WATCH',
        confidence: 0.65,
        watchPriceZones: [],
        addWatchZones: [],
        trimWatchZones: [],
        dangerLines: [],
        invalidationSignals: [
          '公式IR・Investor Dayの内容が決算/受注/市況に接続しない',
          'AIテーマ内でメモリ/SSDではなくGPU/HBM/電力/光通信へ資金が偏る',
          'IPO後需給・ロックアップ・換金売りが強い',
        ],
        evidenceNeeded: ['現在株価', '出来高/需給', '公式IR本文', 'NAND/SSD市況', '次回決算日'],
        reasons: fastCatalysts,
        risks: ['株価データ未取得のため価格帯は未計算', '早耳材料は期待先行になりやすい'],
        privateMemo: '価格データ未取得でも先行カタリストを検出。人間より遅れないためENTRY_WATCHにする。',
        publicMemo: '先行材料を検出。投資助言ではなく、一次情報と需給を急ぎ確認する監視シグナルです。',
        reviewDueAt,
      }
    }
    return {
      generatedRuleId: `${input.code}-missing-price-${Date.now()}`,
      code: input.code,
      name: input.name,
      generatedAt,
      thesis: input.currentThesis,
      actionSignal: 'NO_ACTION',
      confidence: 0.1,
      watchPriceZones: [],
      addWatchZones: [],
      trimWatchZones: [],
      dangerLines: [],
      invalidationSignals: ['株価データ未取得'],
      evidenceNeeded: ['現在株価', '52週高値/安値', '直近決算'],
      reasons: [],
      risks: ['株価データ未取得'],
      privateMemo: '株価未取得のため判断しない',
      publicMemo: 'データ不足のため様子見',
      reviewDueAt,
    }
  }

  if (input.hasDangerDisclosure) {
    score -= 40
    risks.push('危険開示があるため一次情報確認が必要')
    invalidationSignals.push('監査・不正・下方修正・決算延期などの追加悪材料')
  }

  if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct >= 10) {
    score += 20
    reasons.push('営業利益が成長している')
  } else if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct < 0) {
    score -= 15
    risks.push('営業利益が減少している')
  }

  if (input.roe !== null && input.roe >= 10) {
    score += 10
    reasons.push('ROEが10%以上と良好')
  }

  if (input.pbr !== null && input.pbr <= 1.2) {
    score += 10
    reasons.push('PBRが1.2以下で割安感あり')
  }

  if (
    input.drawdownFromHigh52wPct !== null &&
    input.drawdownFromHigh52wPct <= -15 &&
    input.drawdownFromHigh52wPct >= -35
  ) {
    score += 20
    reasons.push('52週高値から15〜35%下落しており、過熱感が落ちている')
  } else if (input.drawdownFromHigh52wPct !== null && input.drawdownFromHigh52wPct > -10) {
    score -= 10
    risks.push('52週高値近辺で過熱感がある可能性')
  }

  if (input.per !== null && input.per > 40) {
    score -= 10
    risks.push('PERが高く、期待先行の可能性')
  }

  if (input.isBeforeEarnings) {
    score -= 5
    risks.push('決算前で不確定要素がある')
    evidenceNeeded.push('次回決算日', '会社予想', '決算説明資料')
  }

  if (input.hasPositiveDisclosure) {
    score += 8
    reasons.push('ポジティブな開示がある')
  }

  if (input.worldEventTags.length > 0) {
    score += 5
    reasons.push(`世界情勢（${input.worldEventTags.slice(0, 2).join('・')}）と関連がある`)
  }

  if (fastCatalysts.length > 0) {
    score += 20
    reasons.push(...fastCatalysts)
    evidenceNeeded.push('公式IR本文', 'NAND/SSD市況', '出来高/需給', '次回決算日')
    risks.push('早耳材料は期待先行・寄り天・テーマ剥落に注意')
  }

  const base = input.currentPrice
  const watchPriceZones: PriceZone[] = [
    {
      label: '浅い押し目監視',
      priceFrom: Math.round(base * 0.95),
      priceTo: Math.round(base * 0.98),
      reason: '短期の過熱が冷めた場合に確認する価格帯',
    },
    {
      label: '中期押し目監視',
      priceFrom: Math.round(base * 0.88),
      priceTo: Math.round(base * 0.94),
      reason: '高値からの調整が進んだ場合に、仮説維持を確認する価格帯',
    },
  ]

  const dangerLines: DangerLine[] = [
    {
      label: '仮説再確認ライン',
      price: input.low52w,
      reason: '52週安値付近を割る場合、需給または事業仮説の再確認が必要',
    },
  ]

  let actionSignal: GeneratedStockRule['actionSignal'] = 'NO_ACTION'

  if (input.hasDangerDisclosure) {
    actionSignal = 'DANGER'
  } else if (score >= 75 && input.positionStatus === 'not_owned') {
    actionSignal = 'ENTRY_WATCH'
  } else if (score >= 75 && input.positionStatus === 'owned') {
    actionSignal = 'ADD_WATCH'
  } else if (
    input.positionStatus === 'owned' &&
    (input.unrealizedGainPct ?? 0) >= 25 &&
    input.per !== null &&
    input.per > 40
  ) {
    actionSignal = 'TRIM_WATCH'
  } else if (input.positionStatus === 'owned') {
    actionSignal = 'HOLD'
  }

  const confidence = Math.max(0.1, Math.min(0.9, score / 100))

  return {
    generatedRuleId: `${input.code}-${Date.now()}`,
    code: input.code,
    name: input.name,
    generatedAt,
    thesis: input.currentThesis,
    actionSignal,
    confidence,
    watchPriceZones,
    addWatchZones: watchPriceZones,
    trimWatchZones: [
      {
        label: '過熱時の一部整理検討',
        priceFrom: Math.round(base * 1.2),
        priceTo: null,
        reason: '短期で大きく上昇し、バリュエーション過熱がある場合に確認',
      },
    ],
    dangerLines,
    invalidationSignals: [
      ...invalidationSignals,
      '営業利益成長の鈍化',
      '利益率悪化',
      '主要テーマの失速',
      '競合優位性の低下',
    ],
    evidenceNeeded: [
      ...evidenceNeeded,
      '直近決算',
      '会社予想',
      'PER/PBR過去レンジ',
      '同業比較',
      '直近開示',
    ],
    reasons,
    risks,
    privateMemo: `スコア${score}。${actionSignal}シグナル。銘柄ごとの考察から自動生成。`,
    publicMemo: '銘柄ごとのデータから生成された監視・検証用メモ。投資助言ではありません。',
    reviewDueAt,
  }
}

function detectFastCatalysts(input: GenerateStockRuleInput): string[] {
  const text = [...input.companyTheme, ...input.currentThesis].join(' ').toLowerCase()
  const catalysts: string[] = []

  if (text.includes('official_ir_catalyst') || text.includes('ai_inference_investor_day')) {
    catalysts.push('公式IR/Investor Day 系の先行カタリストあり')
  }
  if (input.companyTheme.includes('ai_ipo')) {
    catalysts.push('Anthropic/SpaceX/OpenAI級のAI大型IPOレースと関連するテーマ')
  }
  if (input.companyTheme.includes('memory') && input.companyTheme.includes('ai')) {
    catalysts.push('AI推論・データ蓄積がNAND/SSD需要へ波及する仮説')
  }
  if (input.worldEventTags.includes('ai_ipo') || input.worldEventTags.includes('memory')) {
    catalysts.push(`世界イベントタグ: ${input.worldEventTags.filter(tag => tag === 'ai_ipo' || tag === 'memory').join(' / ')}`)
  }

  return [...new Set(catalysts)]
}
