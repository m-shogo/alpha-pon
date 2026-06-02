// 銘柄別ルール自動生成
// 選んだ銘柄ごとに、その時点のデータ・考察からルールを自動生成して保存する
// pnpm generate:company-rules
//
// 注意: 買い推奨ではない。調査・監視・仮説検証用。
// 特定銘柄のハードコードルールを作らない。
// code === '8136' のような分岐は禁止。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { addDaysJst, todayJst } from "./date.js";

// ── 型定義（apps/web/lib/stock/rules/types.ts と同形状） ────────────────

type InternalSignal =
  | "ENTRY_WATCH"
  | "ADD_WATCH"
  | "HOLD"
  | "TRIM_WATCH"
  | "EXIT_WATCH"
  | "NO_ACTION"
  | "DANGER";

type PriceZone = {
  label: string;
  priceFrom: number | null;
  priceTo: number | null;
  reason: string;
};

type DangerLine = {
  label: string;
  price: number | null;
  reason: string;
};

type GenerateStockRuleInput = {
  code: string;
  name: string;
  currentPrice: number | null;
  high52w: number | null;
  low52w: number | null;
  drawdownFromHigh52wPct: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  operatingProfitGrowthPct: number | null;
  hasDangerDisclosure: boolean;
  hasPositiveDisclosure: boolean;
  isBeforeEarnings: boolean;
  worldEventTags: string[];
  companyTheme: string[];
  currentThesis: string[];
  knownRisks: string[];
  positionStatus: "not_owned" | "owned";
  unrealizedGainPct?: number | null;
  positionWeightPct?: number | null;
};

type GeneratedStockRule = {
  generatedRuleId: string;
  code: string;
  name: string;
  generatedAt: string;
  thesis: string[];
  actionSignal: InternalSignal;
  confidence: number;
  watchPriceZones: PriceZone[];
  addWatchZones: PriceZone[];
  trimWatchZones: PriceZone[];
  dangerLines: DangerLine[];
  invalidationSignals: string[];
  evidenceNeeded: string[];
  reasons: string[];
  risks: string[];
  privateMemo: string;
  publicMemo: string;
  reviewDueAt: string;
};

// ── ルール生成ロジック ────────────────────────────────────────────────────
// 特定銘柄名で分岐しない。code === '8136' のようなハードコードは禁止。

function generateStockRule(input: GenerateStockRuleInput): GeneratedStockRule {
  const reasons: string[] = [];
  const risks: string[] = [];
  const evidenceNeeded: string[] = [];
  const invalidationSignals: string[] = [];
  let score = 50;

  const generatedDate = todayJst();
  const generatedAt = `${generatedDate}T00:00:00+09:00`;
  const reviewDueAt = `${addDaysJst(generatedDate, 30)}T00:00:00+09:00`;
  const fastCatalysts = detectFastCatalysts(input);

  if (input.currentPrice == null) {
    if (fastCatalysts.length > 0) {
      return {
        generatedRuleId: `${input.code}-${generatedDate}-fast-catalyst`,
        code: input.code,
        name: input.name,
        generatedAt,
        thesis: input.currentThesis,
        actionSignal: "ENTRY_WATCH",
        confidence: 0.65,
        watchPriceZones: [],
        addWatchZones: [],
        trimWatchZones: [],
        dangerLines: [],
        invalidationSignals: [
          "公式IR・Investor Dayの内容が決算/受注/市況に接続しない",
          "AIテーマ内でメモリ/SSDではなくGPU/HBM/電力/光通信へ資金が偏る",
          "IPO後需給・ロックアップ・換金売りが強い",
        ],
        evidenceNeeded: ["現在株価", "出来高/需給", "公式IR本文", "NAND/SSD市況", "次回決算日"],
        reasons: fastCatalysts,
        risks: ["株価データ未取得のため価格帯は未計算", "早耳材料は期待先行になりやすい"],
        privateMemo: "価格データ未取得でも先行カタリストを検出。人間より遅れないためENTRY_WATCHにする。",
        publicMemo: "先行材料を検出。投資助言ではなく、一次情報と需給を急ぎ確認する監視シグナルです。",
        reviewDueAt,
      };
    }
    return {
      generatedRuleId: `${input.code}-${generatedDate}-missing-price`,
      code: input.code,
      name: input.name,
      generatedAt,
      thesis: input.currentThesis,
      actionSignal: "NO_ACTION",
      confidence: 0.1,
      watchPriceZones: [],
      addWatchZones: [],
      trimWatchZones: [],
      dangerLines: [],
      invalidationSignals: ["株価データ未取得"],
      evidenceNeeded: ["現在株価", "52週高値/安値", "直近決算"],
      reasons: [],
      risks: ["株価データ未取得"],
      privateMemo: "株価未取得のため判断しない",
      publicMemo: "データ不足のため様子見",
      reviewDueAt,
    };
  }

  if (input.hasDangerDisclosure) {
    score -= 40;
    risks.push("危険開示があるため一次情報確認が必要");
    invalidationSignals.push("監査・不正・下方修正・決算延期などの追加悪材料");
  }

  if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct >= 10) {
    score += 20;
    reasons.push("営業利益が成長している");
  } else if (input.operatingProfitGrowthPct !== null && input.operatingProfitGrowthPct < 0) {
    score -= 15;
    risks.push("営業利益が減少している");
  }

  if (input.roe !== null && input.roe >= 10) {
    score += 10;
    reasons.push("ROEが10%以上と良好");
  }

  if (input.pbr !== null && input.pbr <= 1.2) {
    score += 10;
    reasons.push("PBRが1.2以下で割安感あり");
  }

  if (
    input.drawdownFromHigh52wPct !== null &&
    input.drawdownFromHigh52wPct <= -15 &&
    input.drawdownFromHigh52wPct >= -35
  ) {
    score += 20;
    reasons.push("52週高値から15〜35%下落しており、過熱感が落ちている");
  } else if (input.drawdownFromHigh52wPct !== null && input.drawdownFromHigh52wPct > -10) {
    score -= 10;
    risks.push("52週高値近辺で過熱感がある可能性");
  }

  if (input.per !== null && input.per > 40) {
    score -= 10;
    risks.push("PERが高く、期待先行の可能性");
  }

  if (input.isBeforeEarnings) {
    score -= 5;
    risks.push("決算前で不確定要素がある");
    evidenceNeeded.push("次回決算日", "会社予想", "決算説明資料");
  }

  if (input.hasPositiveDisclosure) {
    score += 8;
    reasons.push("ポジティブな開示がある");
  }

  if (input.worldEventTags.length > 0) {
    score += 5;
    reasons.push(`世界情勢（${input.worldEventTags.slice(0, 2).join("・")}）と関連がある`);
  }

  if (fastCatalysts.length > 0) {
    score += 20;
    reasons.push(...fastCatalysts);
    evidenceNeeded.push("公式IR本文", "NAND/SSD市況", "出来高/需給", "次回決算日");
    risks.push("早耳材料は期待先行・寄り天・テーマ剥落に注意");
  }

  const base = input.currentPrice;
  const watchPriceZones: PriceZone[] = [
    {
      label: "浅い押し目監視",
      priceFrom: Math.round(base * 0.95),
      priceTo: Math.round(base * 0.98),
      reason: "短期の過熱が冷めた場合に確認する価格帯",
    },
    {
      label: "中期押し目監視",
      priceFrom: Math.round(base * 0.88),
      priceTo: Math.round(base * 0.94),
      reason: "高値からの調整が進んだ場合に、仮説維持を確認する価格帯",
    },
  ];

  const dangerLines: DangerLine[] = [
    {
      label: "仮説再確認ライン",
      price: input.low52w,
      reason: "52週安値付近を割る場合、需給または事業仮説の再確認が必要",
    },
  ];

  let actionSignal: InternalSignal = "NO_ACTION";
  if (input.hasDangerDisclosure) {
    actionSignal = "DANGER";
  } else if (score >= 75 && input.positionStatus === "not_owned") {
    actionSignal = "ENTRY_WATCH";
  } else if (score >= 75 && input.positionStatus === "owned") {
    actionSignal = "ADD_WATCH";
  } else if (
    input.positionStatus === "owned" &&
    (input.unrealizedGainPct ?? 0) >= 25 &&
    input.per !== null &&
    input.per > 40
  ) {
    actionSignal = "TRIM_WATCH";
  } else if (input.positionStatus === "owned") {
    actionSignal = "HOLD";
  }

  return {
    generatedRuleId: `${input.code}-${generatedDate}`,
    code: input.code,
    name: input.name,
    generatedAt,
    thesis: input.currentThesis,
    actionSignal,
    confidence: Math.max(0.1, Math.min(0.9, score / 100)),
    watchPriceZones,
    addWatchZones: watchPriceZones,
    trimWatchZones: [
      {
        label: "過熱時の一部整理検討",
        priceFrom: Math.round(base * 1.2),
        priceTo: null,
        reason: "短期で大きく上昇し、バリュエーション過熱がある場合に確認",
      },
    ],
    dangerLines,
    invalidationSignals: [
      ...invalidationSignals,
      "営業利益成長の鈍化",
      "利益率悪化",
      "主要テーマの失速",
      "競合優位性の低下",
    ],
    evidenceNeeded: [
      ...evidenceNeeded,
      "直近決算",
      "会社予想",
      "PER/PBR過去レンジ",
      "同業比較",
      "直近開示",
    ],
    reasons,
    risks,
    privateMemo: `スコア${score}。${actionSignal}シグナル。銘柄ごとの考察から自動生成。`,
    publicMemo: "銘柄ごとのデータから生成された監視・検証用メモ。投資助言ではありません。",
    reviewDueAt,
  };
}

function detectFastCatalysts(input: GenerateStockRuleInput): string[] {
  const text = [...input.companyTheme, ...input.currentThesis].join(" ").toLowerCase();
  const catalysts: string[] = [];

  if (text.includes("official_ir_catalyst") || text.includes("ai_inference_investor_day")) {
    catalysts.push("公式IR/Investor Day 系の先行カタリストあり");
  }
  if (input.companyTheme.includes("ai_ipo")) {
    catalysts.push("Anthropic/SpaceX/OpenAI級のAI大型IPOレースと関連するテーマ");
  }
  if (input.companyTheme.includes("memory") && input.companyTheme.includes("ai")) {
    catalysts.push("AI推論・データ蓄積がNAND/SSD需要へ波及する仮説");
  }
  if (input.worldEventTags.includes("ai_ipo") || input.worldEventTags.includes("memory")) {
    catalysts.push(`世界イベントタグ: ${input.worldEventTags.filter(tag => tag === "ai_ipo" || tag === "memory").join(" / ")}`);
  }

  return [...new Set(catalysts)];
}

// ── watchlist から入力データを構築 ────────────────────────────────────────

type WatchlistEntry = {
  code: string;
  name: string;
  theme: string[];
  thesis: string[];
  risks: string[];
};

type WatchlistConfigEntry = {
  code?: string;
  name?: string;
  tags?: string[];
  rules?: string[];
};

type WatchlistConfigFile = {
  symbols?: WatchlistConfigEntry[];
};

function toWatchlistEntry(entry: WatchlistConfigEntry): WatchlistEntry | null {
  if (!entry.code || !entry.name) return null;
  const tags = entry.tags ?? [];
  const rules = entry.rules ?? [];
  return {
    code: entry.code,
    name: entry.name,
    theme: tags,
    thesis: [
      ...(tags.length > 0 ? [`監視テーマ: ${tags.join(" / ")}`] : []),
      ...(rules.length > 0 ? [`発火ルール: ${rules.join(" / ")}`] : []),
    ],
    risks: ["一次情報・決算・価格データの確認が必要"],
  };
}

function loadWatchlist(): WatchlistEntry[] {
  const defaultList: WatchlistEntry[] = [
    { code: "8136", name: "サンリオ", theme: ["entertainment", "ip_licensing", "inbound"], thesis: ["グローバルIPライセンス拡大", "インバウンド消費回復"], risks: ["IP人気の陳腐化", "為替リスク"] },
    { code: "4661", name: "オリエンタルランド", theme: ["entertainment", "inbound"], thesis: ["継続的な設備投資によるリピート誘引", "インバウンド需要拡大"], risks: ["入場者数の伸び悩み", "建設コスト増加"] },
    { code: "7974", name: "任天堂", theme: ["gaming", "ip_licensing"], thesis: ["次世代ハード移行期", "IP展開の多様化"], risks: ["ハード移行期の売上低迷", "競合プラットフォームの台頭"] },
    { code: "7011", name: "三菱重工業", theme: ["defense_space", "energy"], thesis: ["防衛費増額による受注拡大", "原発・エネルギー転換"], risks: ["政策転換リスク", "受注の集中リスク"] },
    { code: "5803", name: "フジクラ", theme: ["ai_compute", "data_center"], thesis: ["AI/データセンター向け光ファイバー需要急拡大"], risks: ["データセンター投資の一巡", "競合他社の参入"] },
    { code: "8306", name: "三菱UFJフィナンシャル・グループ", theme: ["finance", "interest_rate"], thesis: ["金利上昇局面での利ザヤ改善", "海外収益拡大"], risks: ["信用コスト増加", "海外景気後退"] },
  ];

  const customPath = join(process.cwd(), "config", "watchlist.yml");
  if (existsSync(customPath)) {
    try {
      const parsed = load(readFileSync(customPath, "utf-8")) as WatchlistConfigFile;
      const customList = (parsed.symbols ?? [])
        .map(toWatchlistEntry)
        .filter((entry): entry is WatchlistEntry => entry !== null);

      if (customList.length > 0) {
        const merged = new Map(defaultList.map(entry => [entry.code, entry]));
        for (const entry of customList) merged.set(entry.code, entry);
        console.log(`[generate-company-rules] config/watchlist.yml から ${customList.length} 銘柄を読み込みました`);
        return [...merged.values()];
      }
    } catch { /* YAML parse失敗時はデフォルトを使う */ }
  }

  return defaultList;
}

function loadUniverseCandidates(): { code: string; name: string; currentPrice: number | null; drawdownPct: number | null; operatingProfitYoY: number | null; matchedWorldEventTags: string[]; dataSource: string; hasNegativeFlag?: boolean; hasRecentDisclosure?: boolean }[] {
  const paths = [
    join(process.cwd(), "data", "universe_candidates_latest.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        const candidates = Array.isArray(raw) ? raw : (raw.candidates ?? []);
        return candidates;
      } catch { /* ignore */ }
    }
  }
  return [];
}

// ── メイン処理 ─────────────────────────────────────────────────────────────

async function main() {
  const today = todayJst();
  const watchlist = loadWatchlist();
  const universeCandidates = loadUniverseCandidates();
  const watchlistCodes = new Set(watchlist.map(w => w.code));

  // universe candidates のうち watchlist に未登録のものも処理対象にする
  const universeOnly = universeCandidates.filter(c => !watchlistCodes.has(c.code));
  const totalCount = watchlist.length + universeOnly.length;

  console.log(`[generate-company-rules] ${today} — watchlist:${watchlist.length} + universe:${universeOnly.length} = ${totalCount} 銘柄`);

  const rules: GeneratedStockRule[] = [];

  // 1. watchlist 銘柄
  for (const stock of watchlist) {
    const candidate = universeCandidates.find(c => c.code === stock.code);
    const isMock = candidate?.dataSource === "mock" || !candidate;

    const input: GenerateStockRuleInput = {
      code: stock.code,
      name: stock.name,
      currentPrice: candidate?.currentPrice ?? null,
      high52w: null,
      low52w: null,
      drawdownFromHigh52wPct: candidate?.drawdownPct ?? null,
      per: null,
      pbr: null,
      roe: null,
      operatingProfitGrowthPct: candidate?.operatingProfitYoY ?? null,
      hasDangerDisclosure: false,
      hasPositiveDisclosure: candidate?.hasRecentDisclosure ?? false,
      isBeforeEarnings: false,
      worldEventTags: candidate?.matchedWorldEventTags ?? [],
      companyTheme: stock.theme,
      currentThesis: stock.thesis,
      knownRisks: stock.risks,
      positionStatus: "not_owned",
    };

    const rule = generateStockRule(input);
    if (isMock) {
      rule.privateMemo = `[MOCK] ${rule.privateMemo}`;
      rule.publicMemo = `[MOCK] ${rule.publicMemo}`;
    }
    rules.push(rule);
    const src = isMock ? "[MOCK]" : "[実データ]";
    console.log(`  [watchlist] ${src} ${stock.code} ${stock.name}: ${rule.actionSignal} (${rule.confidence.toFixed(2)})`);
  }

  // 2. universe only 銘柄（watchlist 未登録）
  for (const c of universeOnly) {
    const isMock = c.dataSource === "mock";
    const input: GenerateStockRuleInput = {
      code: c.code,
      name: c.name,
      currentPrice: c.currentPrice ?? null,
      high52w: null,
      low52w: null,
      drawdownFromHigh52wPct: c.drawdownPct ?? null,
      per: null,
      pbr: null,
      roe: null,
      operatingProfitGrowthPct: c.operatingProfitYoY ?? null,
      hasDangerDisclosure: c.hasNegativeFlag ?? false,
      hasPositiveDisclosure: c.hasRecentDisclosure ?? false,
      isBeforeEarnings: false,
      worldEventTags: c.matchedWorldEventTags ?? [],
      companyTheme: [],
      currentThesis: [],
      knownRisks: [],
      positionStatus: "not_owned",
    };

    const rule = generateStockRule(input);
    if (isMock) {
      rule.privateMemo = `[MOCK] ${rule.privateMemo}`;
      rule.publicMemo = `[MOCK] ${rule.publicMemo}`;
    }
    rules.push(rule);
    const src = isMock ? "[MOCK]" : "[実データ]";
    console.log(`  [universe] ${src} ${c.code} ${c.name}: ${rule.actionSignal} (${rule.confidence.toFixed(2)})`);
  }

  // ── 保存 ──────────────────────────────────────────────────────────────────
  const outDir = join(process.cwd(), "data", "generated_company_rules");
  mkdirSync(outDir, { recursive: true });

  const dated = join(outDir, `${today}.json`);
  const latest = join(process.cwd(), "data", "generated_company_rules_latest.json");
  const webOut = join(process.cwd(), "apps", "web", "public", "generated", "company-rules.json");

  const output = { generatedAt: today, count: rules.length, rules };

  writeFileSync(dated, JSON.stringify(output, null, 2));
  writeFileSync(latest, JSON.stringify(output, null, 2));
  writeFileSync(webOut, JSON.stringify(output, null, 2));

  console.log(`[generate-company-rules] 完了: ${rules.length} 件`);
  console.log(`  → data/generated_company_rules/${today}.json`);
  console.log(`  → data/generated_company_rules_latest.json`);
  console.log(`  → apps/web/public/generated/company-rules.json`);
}

main().catch(e => {
  console.error("[generate-company-rules] エラー:", e);
  process.exit(1);
});
