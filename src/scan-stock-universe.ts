// ユニバーススキャン
// 登録外銘柄を「監視候補」として自動スクリーニングする
// pnpm scan:universe
//
// 注意: 買い推奨ではない。条件一致の通知・調査用。
//
// 動作モード:
//   JQUANTS_EMAIL + JQUANTS_PASSWORD が設定済み → J-Quants API（本番）
//   --mock または USE_MOCK=true が指定されている → モックデータ使用
//   J-Quants未設定 → モックデータ使用（本番データではないことを出力に明示）

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import {
  fetchDailyQuotes,
  fetchFinancialStatements,
  calcPriceStats,
  calcFinancialStats,
} from "./fetcher/jquants.js";
import { todayJst, addDaysJst } from "./date.js";
import type { UniverseCandidate, WorldContextRegime } from "./universe.js";
import { SCREENING_CRITERIA } from "./universe.js";

// ── 設定読み込み ────────────────────────────────────────────

type UniverseStockEntry = {
  code: string;
  name: string;
  sector: string;
  tags: string[];
};

type UniverseConfig = {
  version: string;
  description: string;
  sectorThemeMap: Record<string, string[]>;
  stocks: UniverseStockEntry[];
};

type CurrentRegime = {
  asOf: string;
  mode: string;
  summary: string;
  activeRegimes: WorldContextRegime[];
  operatingRules: string[];
};

function loadUniverseConfig(): UniverseConfig {
  const raw = readFileSync("config/stock-universe.yml", "utf-8");
  return load(raw) as UniverseConfig;
}

function loadCurrentRegime(): CurrentRegime {
  const raw = readFileSync("config/current-regime.yml", "utf-8");
  return load(raw) as CurrentRegime;
}

// ── ユーティリティ ────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isJQuantsConfigured(): boolean {
  return Boolean(process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD);
}

function isMockEnabled(): boolean {
  return process.argv.includes("--mock") || process.env.USE_MOCK === "true";
}

/** セクターに対して関連する世界情勢タグを返す */
function matchWorldEventTags(
  sector: string,
  tags: string[],
  sectorThemeMap: Record<string, string[]>,
  activeRegimes: WorldContextRegime[]
): string[] {
  const relevantRegimeIds = new Set<string>();

  // セクターマップから関連情勢を特定
  const sectorThemes = sectorThemeMap[sector] ?? [];
  const allTags = [...tags, ...sectorThemes];

  for (const regime of activeRegimes) {
    const regimeCategories = regime.watchCategories ?? [];
    const hasMatch =
      sectorThemes.some(t => regime.id.includes(t.split("_")[0])) ||
      regimeCategories.some(cat => allTags.some(t => cat.includes(t) || t.includes(cat))) ||
      allTags.some(t => regime.id.includes(t));

    if (hasMatch) {
      relevantRegimeIds.add(regime.id);
    }
  }

  return [...relevantRegimeIds];
}

/** スクリーニングスコアを計算（0-100） */
function calcScreeningScore(candidate: Partial<UniverseCandidate>): number {
  let score = 40; // ベーススコア

  // ドローダウンが15-25%: 高評価、25-35%: 中評価
  const dd = candidate.drawdownPct ?? 0;
  if (dd >= -25 && dd <= -15) score += 20;
  else if (dd >= -35 && dd < -25) score += 10;

  // 営業利益成長
  const yoy = candidate.operatingProfitYoY;
  if (yoy != null && yoy > 10) score += 20;
  else if (yoy != null && yoy > 0) score += 10;

  // 世界情勢テーマとの一致
  const tagCount = (candidate.matchedWorldEventTags ?? []).length;
  score += Math.min(tagCount * 5, 15);

  // 直近開示あり
  if (candidate.hasRecentDisclosure) score += 5;

  // ネガティブフラグでペナルティ
  if (candidate.hasNegativeFlag) score -= 30;
  if (candidate.hasDownwardRevision) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ── J-Quants モード ──────────────────────────────────────────

async function screenWithJQuants(
  stock: UniverseStockEntry,
  regime: CurrentRegime,
  config: UniverseConfig
): Promise<UniverseCandidate | null> {
  const date = todayJst();
  const dateFrom = addDaysJst(date, -365);

  // 日次株価データ取得
  let priceStats = null;
  try {
    const quotes = await fetchDailyQuotes(
      stock.code,
      dateFrom.replace(/-/g, ""),
      date.replace(/-/g, "")
    );
    priceStats = calcPriceStats(quotes);
  } catch (err) {
    console.warn(`  [warn] ${stock.code} 株価取得失敗: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (!priceStats) {
    console.log(`  [skip] ${stock.code} 価格データ不足`);
    return null;
  }

  // ドローダウンフィルタ
  const dd = priceStats.drawdownPct;
  if (dd > SCREENING_CRITERIA.drawdownMax || dd < SCREENING_CRITERIA.drawdownMin) {
    console.log(`  [skip] ${stock.code} drawdown=${dd.toFixed(1)}% (対象外)`);
    return null;
  }

  await sleep(300); // レート制限

  // 財務データ取得
  let financialStats = { revenueYoY: null as number | null, operatingProfitYoY: null as number | null, hasDownwardRevision: false };
  try {
    const statements = await fetchFinancialStatements(stock.code);
    financialStats = calcFinancialStats(statements);
  } catch (err) {
    console.warn(`  [warn] ${stock.code} 財務取得失敗: ${err instanceof Error ? err.message : String(err)}`);
  }

  await sleep(300);

  // 営業利益成長フィルタ（null は通過させ、warningsに記録）
  const warnings: string[] = [];
  if (financialStats.operatingProfitYoY != null) {
    if (financialStats.operatingProfitYoY < SCREENING_CRITERIA.operatingProfitYoYMin) {
      console.log(`  [skip] ${stock.code} 営業利益YoY=${financialStats.operatingProfitYoY.toFixed(1)}% (マイナス)`);
      return null;
    }
  } else {
    warnings.push("営業利益成長データ未取得");
  }

  if (financialStats.hasDownwardRevision) {
    warnings.push("下方修正あり");
  }

  const matchedTags = matchWorldEventTags(
    stock.sector,
    stock.tags,
    config.sectorThemeMap,
    regime.activeRegimes
  );

  const partial: Partial<UniverseCandidate> = {
    drawdownPct: dd,
    operatingProfitYoY: financialStats.operatingProfitYoY,
    matchedWorldEventTags: matchedTags,
    hasDownwardRevision: financialStats.hasDownwardRevision,
    hasNegativeFlag: false,
    hasRecentDisclosure: true, // J-Quants でdisclosure確認は別途必要
  };

  const screeningScore = calcScreeningScore(partial);

  return {
    code: stock.code,
    name: stock.name,
    sector: stock.sector,
    detectedAt: date,
    currentPrice: priceStats.current,
    high52w: priceStats.high52w,
    drawdownPct: dd,
    operatingProfitYoY: financialStats.operatingProfitYoY,
    hasDownwardRevision: financialStats.hasDownwardRevision,
    hasNegativeFlag: false,
    hasRecentDisclosure: true,
    matchedWorldEventTags: matchedTags,
    screeningScore,
    warnings,
    status: "monitoring",
    dataSource: "jquants",
  };
}

// ── モックモード ─────────────────────────────────────────────

type MockDataFile = {
  _note: string;
  dataSource: string;
  candidates: UniverseCandidate[];
};

function scanWithMock(): UniverseCandidate[] {
  const mockPath = "data/mock/universe_candidates_mock.json";
  if (!existsSync(mockPath)) {
    console.warn("[warn] モックデータファイルが見つかりません: " + mockPath);
    return [];
  }

  const raw = readFileSync(mockPath, "utf-8");
  const data = JSON.parse(raw) as MockDataFile;

  const today = todayJst();
  return data.candidates.map(c => ({
    ...c,
    detectedAt: today,
    warnings: [...(c.warnings ?? []), "[MOCK] J-Quants未設定。実データではありません。"],
  }));
}

// ── メイン ───────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== ユニバーススキャン開始 ===");
  const date = todayJst();

  const config = loadUniverseConfig();
  const regime = loadCurrentRegime();

  let candidates: UniverseCandidate[];

  if (isJQuantsConfigured()) {
    console.log(`[mode] J-Quants API (${config.stocks.length}銘柄をスクリーニング)`);
    candidates = [];

    for (const stock of config.stocks) {
      console.log(`  チェック: ${stock.code} ${stock.name}`);
      try {
        const result = await screenWithJQuants(stock, regime, config);
        if (result) {
          candidates.push(result);
          console.log(`  [pass] ${stock.code} score=${result.screeningScore}`);
        }
      } catch (err) {
        console.warn(`  [error] ${stock.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    if (isMockEnabled()) {
      console.log("[mode] モック (--mock / USE_MOCK=true が指定されています)");
    } else {
      console.log("[mode] モック (J-Quants未設定のため local JSON を使用します)");
    }
    candidates = scanWithMock();
  }

  console.log(`\n通過: ${candidates.length}銘柄`);

  // 出力
  const dir = "data/universe_candidates";
  mkdirSync(dir, { recursive: true });

  const dailyPath = join(dir, `${date}.json`);
  const latestPath = "data/universe_candidates_latest.json";

  const output = {
    generatedAt: date,
    dataSource: isJQuantsConfigured() ? "jquants" : "mock",
    count: candidates.length,
    candidates,
  };

  writeFileSync(dailyPath, JSON.stringify(output, null, 2), "utf-8");
  writeFileSync(latestPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n出力:`);
  console.log(`  ${dailyPath}`);
  console.log(`  ${latestPath}`);
  console.log("=== 完了 ===");
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
