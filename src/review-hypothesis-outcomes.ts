// 仮説の結果検証
// reviewDueAt を過ぎた仮説について株価リターンを計算し、当たり外れを記録する
// pnpm review:hypotheses
//
// 注意: 買い推奨ではない。仮説の精度向上・反省用。
// J-Quants未設定時はリターン計算をスキップし、"unknown" として記録する。

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { DatabaseSync } from "node:sqlite";
import { addDaysJst, toCompactDate, todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import { inferMissReasons } from "./miss-reason.js";
import { buildOutcomeNotes, resolveActualDirection } from "./outcome-notes.js";
import type {
  StockCandidateHypothesis,
  HypothesisOutcome,
  HypothesisResult,
  HypothesisLabel,
  HypothesisActionLabel,
  ReviewHorizon,
  ActionLabelStats,
  AccuracySummary,
  ScoreBand,
  ScoreBandStats,
} from "./universe.js";

const HYPOTHESIS_PATH = "data/hypothesis_predictions.jsonl";
const OUTCOME_PATH = "data/hypothesis_outcomes.jsonl";
const OUTCOME_DB_PATH = "data/hypothesis_outcomes.db";
const SUMMARY_PATH = "data/hypothesis_accuracy_summary.json";
const TOPIX_ETF_CODE = "1306";

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8").split("\n").map(line => line.trim()).filter(Boolean).map(line => JSON.parse(line) as T);
}
function readHypotheses(): StockCandidateHypothesis[] { return readJsonl<StockCandidateHypothesis>(HYPOTHESIS_PATH); }

function openDb(): DatabaseSync {
  mkdirSync("data", { recursive: true });
  const db = new DatabaseSync(OUTCOME_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS hypothesis_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      review_horizon TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hypothesis_outcomes_unique
      ON hypothesis_outcomes (code, detected_at, review_horizon);
  `);
  return db;
}

function readExistingOutcomes(): HypothesisOutcome[] {
  if (existsSync(OUTCOME_DB_PATH)) {
    const db = openDb();
    const rows = db.prepare("SELECT payload FROM hypothesis_outcomes ORDER BY id").all() as { payload: string }[];
    db.close();
    return rows.map(r => JSON.parse(r.payload) as HypothesisOutcome);
  }
  return readJsonl<HypothesisOutcome>(OUTCOME_PATH);
}

function appendOutcome(o: HypothesisOutcome): void {
  const db = openDb();
  try {
    db.prepare(`INSERT INTO hypothesis_outcomes (code, detected_at, review_horizon, payload) VALUES (?, ?, ?, ?)`)
      .run(o.code, o.hypothesis.detectedAt, o.reviewHorizon, JSON.stringify(o));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint failed")) {
      console.warn(`  [skip] 重複: ${o.code} ${o.hypothesis.detectedAt} [${o.reviewHorizon}] は保存済み`);
      db.close();
      return;
    }
    db.close();
    throw err;
  }
  db.close();
  appendFileSync(OUTCOME_PATH, JSON.stringify(o) + "\n", "utf-8");
}

function migrateJsonlToDb(): void {
  if (!existsSync(OUTCOME_PATH)) return;
  const db = openDb();
  const count = (db.prepare("SELECT COUNT(*) as n FROM hypothesis_outcomes").get() as { n: number }).n;
  if (count > 0) { db.close(); return; }
  const existing = readJsonl<HypothesisOutcome>(OUTCOME_PATH);
  if (existing.length === 0) { db.close(); return; }
  const insert = db.prepare(`INSERT OR IGNORE INTO hypothesis_outcomes (code, detected_at, review_horizon, payload) VALUES (?, ?, ?, ?)`);
  db.exec("BEGIN");
  for (const o of existing) insert.run(o.code, o.hypothesis.detectedAt, o.reviewHorizon ?? "1m", JSON.stringify(o));
  db.exec("COMMIT");
  db.close();
  console.log(`[migrate] JSONL → SQLite: ${existing.length}件を移行しました`);
}

function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
function findPriceOnOrAfter(quotes: { Date: string; AdjustmentClose: number }[], targetDateCompact: string): number | null {
  const match = quotes.sort((a, b) => a.Date.localeCompare(b.Date)).find(q => q.Date >= targetDateCompact);
  return match?.AdjustmentClose ?? null;
}
function calcReturnPct(base: number | null, target: number | null): number | null {
  if (!base || !target) return null;
  return ((target - base) / base) * 100;
}

type ReturnData = {
  base: number | null; p1d: number | null; p1w: number | null; p1m: number | null; p3m: number | null;
  ret1d: number | null; ret1w: number | null; ret1m: number | null; ret3m: number | null;
  maxDrawdownPct: number | null;
  dataAvailability: "ok" | "partial" | "missing";
};
function calcMaxDrawdownPct(base: number | null, prices: Array<number | null>): number | null {
  if (!base) return null;
  const valid = prices.filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  if (valid.length === 0) return null;
  return ((Math.min(...valid) - base) / base) * 100;
}
function buildReturnData(quotes: { Date: string; AdjustmentClose: number }[], detectedAt: string): ReturnData {
  const sorted = quotes.sort((a, b) => a.Date.localeCompare(b.Date));
  const base = sorted[0]?.AdjustmentClose ?? null;
  const p1d = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 1)));
  const p1w = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 7)));
  const p1m = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 30)));
  const p3m = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 90)));
  const ret1d = calcReturnPct(base, p1d);
  const ret1w = calcReturnPct(base, p1w);
  const ret1m = calcReturnPct(base, p1m);
  const ret3m = calcReturnPct(base, p3m);
  const maxDrawdownPct = calcMaxDrawdownPct(base, sorted.map(q => q.AdjustmentClose));
  const available = [base, p1w, p1m, p3m, ret1w, ret1m, ret3m, maxDrawdownPct].filter(v => v != null).length;
  return { base, p1d, p1w, p1m, p3m, ret1d, ret1w, ret1m, ret3m, maxDrawdownPct, dataAvailability: available >= 8 ? "ok" : available >= 2 ? "partial" : "missing" };
}
function mapActionLabel(label: HypothesisLabel): HypothesisActionLabel {
  if (label === "監視候補") return "watch";
  if (label === "検証候補") return "log";
  return "ignore";
}
async function fetchReturnData(code: string, detectedAt: string): Promise<ReturnData> {
  const quotes = await fetchDailyQuotes(code, toCompactDate(detectedAt), toCompactDate(todayJst()));
  return buildReturnData(quotes, detectedAt);
}

const HORIZON_THRESHOLD: Record<ReviewHorizon, number> = { "1d": 1, "1w": 2, "1m": 3, "3m": 5 };
function resolveResult(ret: number | null, expectedDirection: string, horizon: ReviewHorizon = "1m"): HypothesisResult {
  if (ret == null) return "unknown";
  const th = HORIZON_THRESHOLD[horizon];
  if (expectedDirection === "up") return ret >= th ? "hit" : ret >= -th ? "too_early" : "miss";
  if (expectedDirection === "down") return ret <= -th ? "hit" : ret <= th ? "too_early" : "miss";
  return Math.abs(ret) >= th * 1.5 ? "hit" : "too_early";
}
function pickRetForHorizon(returns: ReturnData, horizon: ReviewHorizon): number | null {
  if (horizon === "1d") return returns.ret1d;
  if (horizon === "1w") return returns.ret1w;
  if (horizon === "3m") return returns.ret3m;
  return returns.ret1m;
}
function pickTopixRetForHorizon(topixReturns: ReturnData, horizon: ReviewHorizon): number | null {
  if (horizon === "1d") return topixReturns.ret1d;
  if (horizon === "1w") return topixReturns.ret1w;
  if (horizon === "3m") return topixReturns.ret3m;
  return topixReturns.ret1m;
}
function avgOrNull(values: number[]): number | null { return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function calcActionLabelStats(outcomes: HypothesisOutcome[], label: HypothesisActionLabel): ActionLabelStats {
  const group = outcomes.filter(o => o.actionLabel === label);
  return { total: group.length, avgExcessReturn1w: avgOrNull(group.map(o => o.relativeToTopix1w).filter((v): v is number => v != null)), avgExcessReturn1m: avgOrNull(group.map(o => o.relativeToTopix1m).filter((v): v is number => v != null)) };
}
function scoreBand(score: number | null | undefined): ScoreBand { if (score == null) return "unknown"; if (score < 50) return "0-49"; if (score < 70) return "50-69"; if (score < 85) return "70-84"; return "85-100"; }
function calcScoreBandStats(outcomes: HypothesisOutcome[], band: ScoreBand): ScoreBandStats {
  const group = outcomes.filter(o => scoreBand(o.scoreAtPrediction) === band);
  const resolved = group.filter(o => o.result === "hit" || o.result === "miss");
  const hits = resolved.filter(o => o.result === "hit").length;
  return { total: group.length, hitRate: resolved.length > 0 ? hits / resolved.length : null, avgExcessReturn1w: avgOrNull(group.map(o => o.relativeToTopix1w).filter((v): v is number => v != null)), avgExcessReturn1m: avgOrNull(group.map(o => o.relativeToTopix1m).filter((v): v is number => v != null)) };
}
function calcAccuracySummary(outcomes: HypothesisOutcome[]): AccuracySummary {
  const total = outcomes.length;
  const hit = outcomes.filter(o => o.result === "hit").length;
  const miss = outcomes.filter(o => o.result === "miss").length;
  const tooEarly = outcomes.filter(o => o.result === "too_early").length;
  const unknown = outcomes.filter(o => o.result === "unknown").length;
  const hitRate = total > 0 && (hit + miss) > 0 ? hit / (hit + miss) : null;
  return {
    total, hit, miss, tooEarly, unknown, hitRate,
    avgReturn1m: avgOrNull(outcomes.map(o => o.return1m).filter((v): v is number => v != null)),
    avgTopixReturn1m: avgOrNull(outcomes.map(o => o.topixReturn1m).filter((v): v is number => v != null)),
    avgRelativeToTopix1m: avgOrNull(outcomes.map(o => o.relativeToTopix1m).filter((v): v is number => v != null)),
    avgMaxDrawdownPct: avgOrNull(outcomes.map(o => o.maxDrawdownPct).filter((v): v is number => v != null)),
    byActionLabel: { watch: calcActionLabelStats(outcomes, "watch"), log: calcActionLabelStats(outcomes, "log"), ignore: calcActionLabelStats(outcomes, "ignore") },
    byScoreBand: { "0-49": calcScoreBandStats(outcomes, "0-49"), "50-69": calcScoreBandStats(outcomes, "50-69"), "70-84": calcScoreBandStats(outcomes, "70-84"), "85-100": calcScoreBandStats(outcomes, "85-100"), unknown: calcScoreBandStats(outcomes, "unknown") },
  };
}

const REVIEW_HORIZONS: { horizon: ReviewHorizon; days: number }[] = [{ horizon: "1d", days: 1 }, { horizon: "1w", days: 7 }, { horizon: "1m", days: 30 }, { horizon: "3m", days: 90 }];

async function main(): Promise<void> {
  console.log("=== 仮説検証開始 ===");
  migrateJsonlToDb();
  const today = todayJst();
  const hypotheses = readHypotheses();
  const existingOutcomes = readExistingOutcomes();
  const reviewedKeys = new Set(existingOutcomes.map(o => `${o.code}:${o.hypothesis.detectedAt}:${o.reviewHorizon}`));
  type DueItem = { hypothesis: StockCandidateHypothesis; horizon: ReviewHorizon };
  const dueItems: DueItem[] = [];
  for (const h of hypotheses) {
    if (h.status !== "open") continue;
    for (const { horizon, days } of REVIEW_HORIZONS) {
      const dueAt = addDaysJst(h.detectedAt, days);
      const key = `${h.code}:${h.detectedAt}:${horizon}`;
      if (dueAt <= today && !reviewedKeys.has(key)) dueItems.push({ hypothesis: h, horizon });
    }
  }
  console.log(`対象: ${dueItems.length}件 (horizon別, today=${today})`);
  if (dueItems.length === 0) console.log("検証対象なし");
  const useJQuants = isJQuantsConfigured();
  if (!useJQuants) console.log("[warn] J-Quants未設定。リターン計算をスキップします。");
  let topixQuotes: { Date: string; AdjustmentClose: number }[] = [];
  if (useJQuants && dueItems.length > 0) {
    try {
      const earliest = dueItems.reduce((min, d) => (d.hypothesis.detectedAt < min ? d.hypothesis.detectedAt : min), dueItems[0].hypothesis.detectedAt);
      topixQuotes = await fetchDailyQuotes(TOPIX_ETF_CODE, toCompactDate(earliest), toCompactDate(today));
      await sleep(300);
    } catch (err) { console.warn("[warn] TOPIX取得失敗:", err instanceof Error ? err.message : String(err)); }
  }
  const emptyReturnData: ReturnData = { base: null, p1d: null, p1w: null, p1m: null, p3m: null, ret1d: null, ret1w: null, ret1m: null, ret3m: null, maxDrawdownPct: null, dataAvailability: "missing" };
  const priceCache = new Map<string, ReturnData>();
  for (const { hypothesis: h, horizon } of dueItems) {
    let returns: ReturnData = { ...emptyReturnData };
    let topixReturns: ReturnData = { ...emptyReturnData };
    let dataSource: "jquants" | "mock" = "mock";
    if (useJQuants) {
      const cacheKey = h.code + ":" + h.detectedAt;
      if (priceCache.has(cacheKey)) returns = priceCache.get(cacheKey)!;
      else {
        try { returns = await fetchReturnData(h.code, h.detectedAt); priceCache.set(cacheKey, returns); await sleep(300); }
        catch (err) { console.warn(`  [warn] ${h.code} 価格取得失敗:`, err instanceof Error ? err.message : String(err)); }
      }
      topixReturns = buildReturnData(topixQuotes, h.detectedAt);
      dataSource = "jquants";
    }
    const horizonRet = pickRetForHorizon(returns, horizon);
    const horizonTopixRet = pickTopixRetForHorizon(topixReturns, horizon);
    const result = resolveResult(horizonRet, h.expectedDirection, horizon);
    const relativeToTopix1d = returns.ret1d != null && topixReturns.ret1d != null ? returns.ret1d - topixReturns.ret1d : null;
    const relativeToTopix1w = returns.ret1w != null && topixReturns.ret1w != null ? returns.ret1w - topixReturns.ret1w : null;
    const relativeToTopix1m = returns.ret1m != null && topixReturns.ret1m != null ? returns.ret1m - topixReturns.ret1m : null;
    const relativeToTopix3m = returns.ret3m != null && topixReturns.ret3m != null ? returns.ret3m - topixReturns.ret3m : null;
    const excessRet = horizonRet != null && horizonTopixRet != null ? horizonRet - horizonTopixRet : relativeToTopix1m;
    const narrative = buildOutcomeNotes({ hypothesis: h, returns, relativeToTopix1m: excessRet, result, dataSource });
    const missReasonCandidates = inferMissReasons(narrative);
    const outcome: HypothesisOutcome = {
      schemaVersion: 1, code: h.code, name: h.name, hypothesis: h, evaluatedAt: today, reviewHorizon: horizon, actionLabel: mapActionLabel(h.label), scoreAtPrediction: Math.round(h.confidence * 100),
      startPrice: returns.base, endPrice1d: returns.p1d, endPrice1w: returns.p1w, endPrice1m: returns.p1m, endPrice3m: returns.p3m,
      return1d: returns.ret1d, return1w: returns.ret1w, return1m: returns.ret1m, return3m: returns.ret3m,
      topixReturn1d: topixReturns.ret1d, benchmarkReturn1w: topixReturns.ret1w, benchmarkReturn3m: topixReturns.ret3m, topixReturn1m: topixReturns.ret1m,
      relativeToTopix1d, relativeToTopix1w, relativeToTopix1m, relativeToTopix3m, maxDrawdownPct: returns.maxDrawdownPct, actualDirection: resolveActualDirection(horizonRet), result, dataAvailability: returns.dataAvailability,
      whatMatched: narrative.whatMatched, whatDiffered: narrative.whatDiffered, missedSignals: narrative.missedSignals, improvedRuleIdeas: narrative.improvedRuleIdeas, missReasonCandidates, notes: narrative.notes, dataSource,
    };
    appendOutcome(outcome);
    console.log(`  [reviewed] ${h.code} ${h.name} [${horizon}]: ${result} (ret=${horizonRet?.toFixed(1) ?? "N/A"}%)`);
  }
  const allOutcomes = readExistingOutcomes();
  const summary = calcAccuracySummary(allOutcomes);
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\n精度サマリー: hit=${summary.hit}/${summary.total} (hitRate=${summary.hitRate != null ? (summary.hitRate * 100).toFixed(0) + "%" : "N/A"})`);
  console.log(`保存先: ${OUTCOME_PATH}`);
  console.log("=== 完了 ===");
}

main().catch(err => { console.error("[fatal]", err); process.exit(1); });
