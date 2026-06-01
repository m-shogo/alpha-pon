// 仮説の結果検証
// reviewDueAt を過ぎた仮説について株価リターンを計算し、当たり外れを記録する
// pnpm review:hypotheses
//
// 注意: 買い推奨ではない。仮説の精度向上・反省用。
// J-Quants未設定時はリターン計算をスキップし、"unknown" として記録する。

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { toCompactDate, todayJst } from "./date.js";
import { fetchDailyQuotes } from "./fetcher/jquants.js";
import type {
  StockCandidateHypothesis,
  HypothesisOutcome,
  HypothesisResult,
  AccuracySummary,
} from "./universe.js";

const HYPOTHESIS_PATH = "data/hypothesis_predictions.jsonl";
const OUTCOME_PATH = "data/hypothesis_outcomes.jsonl";
const SUMMARY_PATH = "data/hypothesis_accuracy_summary.json";
const TOPIX_ETF_CODE = "1306"; // 野村TOPIX連動型上場投信

// ── JSONL 読み書き ────────────────────────────────────────────

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

function readHypotheses(): StockCandidateHypothesis[] {
  return readJsonl<StockCandidateHypothesis>(HYPOTHESIS_PATH);
}

function readExistingOutcomes(): HypothesisOutcome[] {
  return readJsonl<HypothesisOutcome>(OUTCOME_PATH);
}

function appendOutcome(o: HypothesisOutcome): void {
  appendFileSync(OUTCOME_PATH, JSON.stringify(o) + "\n", "utf-8");
}

// ── J-Quants チェック ─────────────────────────────────────────

function isJQuantsConfigured(): boolean {
  return Boolean(process.env.JQUANTS_EMAIL && process.env.JQUANTS_PASSWORD);
}

// ── リターン計算 ──────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function findPriceOnOrAfter(
  quotes: { Date: string; AdjustmentClose: number }[],
  targetDateCompact: string
): number | null {
  const match = quotes
    .sort((a, b) => a.Date.localeCompare(b.Date))
    .find(q => q.Date >= targetDateCompact);
  return match?.AdjustmentClose ?? null;
}

function calcReturnPct(base: number | null, target: number | null): number | null {
  if (!base || !target) return null;
  return ((target - base) / base) * 100;
}

async function fetchReturnData(
  code: string,
  detectedAt: string
): Promise<{ base: number | null; ret1w: number | null; ret1m: number | null; ret3m: number | null }> {
  const today = todayJst();
  const from = toCompactDate(detectedAt);
  const to = toCompactDate(today);

  const quotes = await fetchDailyQuotes(code, from, to);
  const sorted = quotes.sort((a, b) => a.Date.localeCompare(b.Date));

  const base = sorted[0]?.AdjustmentClose ?? null;
  const p1w  = findPriceOnOrAfter(sorted, toCompactDate(addDays(detectedAt, 7)));
  const p1m  = findPriceOnOrAfter(sorted, toCompactDate(addDays(detectedAt, 30)));
  const p3m  = findPriceOnOrAfter(sorted, toCompactDate(addDays(detectedAt, 90)));

  return {
    base,
    ret1w: calcReturnPct(base, p1w),
    ret1m: calcReturnPct(base, p1m),
    ret3m: calcReturnPct(base, p3m),
  };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolveResult(
  ret1m: number | null,
  expectedDirection: string
): HypothesisResult {
  if (ret1m == null) return "unknown";
  if (expectedDirection === "up") {
    return ret1m >= 3 ? "hit" : ret1m >= -3 ? "too_early" : "miss";
  }
  if (expectedDirection === "down") {
    return ret1m <= -3 ? "hit" : ret1m <= 3 ? "too_early" : "miss";
  }
  // unknown direction: 絶対値で判定
  return Math.abs(ret1m) >= 5 ? "hit" : "too_early";
}

// ── 精度サマリー ──────────────────────────────────────────────

function calcAccuracySummary(outcomes: HypothesisOutcome[]): AccuracySummary {
  const total = outcomes.length;
  const hit = outcomes.filter(o => o.result === "hit").length;
  const miss = outcomes.filter(o => o.result === "miss").length;
  const tooEarly = outcomes.filter(o => o.result === "too_early").length;
  const unknown = outcomes.filter(o => o.result === "unknown").length;

  const hitRate = total > 0 && (hit + miss) > 0 ? hit / (hit + miss) : null;

  const returns1m = outcomes.map(o => o.return1m).filter((v): v is number => v != null);
  const avgReturn1m = returns1m.length > 0
    ? returns1m.reduce((a, b) => a + b, 0) / returns1m.length
    : null;

  const topixRets = outcomes.map(o => o.topixReturn1m).filter((v): v is number => v != null);
  const avgTopixReturn1m = topixRets.length > 0
    ? topixRets.reduce((a, b) => a + b, 0) / topixRets.length
    : null;

  return { total, hit, miss, tooEarly, unknown, hitRate, avgReturn1m, avgTopixReturn1m };
}

// ── メイン ────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== 仮説検証開始 ===");

  const today = todayJst();
  const hypotheses = readHypotheses();
  const existingOutcomes = readExistingOutcomes();
  const reviewedKeys = new Set(
    existingOutcomes.map(o => `${o.code}:${o.hypothesis.detectedAt}`)
  );

  // reviewDueAt が今日以前のオープン仮説を対象にする
  const due = hypotheses.filter(h =>
    h.status === "open" &&
    h.reviewDueAt <= today &&
    !reviewedKeys.has(`${h.code}:${h.detectedAt}`)
  );

  console.log(`対象仮説: ${due.length}件 (reviewDueAt <= ${today})`);

  if (due.length === 0) {
    console.log("検証対象なし");
  }

  const useJQuants = isJQuantsConfigured();
  if (!useJQuants) {
    console.log("[warn] J-Quants未設定。リターン計算をスキップします。");
  }

  let topixQuotes: { Date: string; AdjustmentClose: number }[] = [];
  if (useJQuants && due.length > 0) {
    try {
      const earliest = due.reduce(
        (min, h) => (h.detectedAt < min ? h.detectedAt : min),
        due[0].detectedAt
      );
      topixQuotes = await fetchDailyQuotes(
        TOPIX_ETF_CODE,
        toCompactDate(earliest),
        toCompactDate(today)
      );
      await sleep(300);
    } catch (err) {
      console.warn("[warn] TOPIX取得失敗:", err instanceof Error ? err.message : String(err));
    }
  }

  for (const h of due) {
    let returns = { base: null as number | null, ret1w: null as number | null, ret1m: null as number | null, ret3m: null as number | null };
    let topixRet1m: number | null = null;
    let dataSource: "jquants" | "mock" = "mock";

    if (useJQuants) {
      try {
        returns = await fetchReturnData(h.code, h.detectedAt);
        await sleep(300);

        // TOPIX比較
        const topixBase = topixQuotes.find(q => q.Date >= toCompactDate(h.detectedAt))?.AdjustmentClose ?? null;
        const topixP1m  = findPriceOnOrAfter(topixQuotes, toCompactDate(addDays(h.detectedAt, 30)));
        topixRet1m = calcReturnPct(topixBase, topixP1m);
        dataSource = "jquants";
      } catch (err) {
        console.warn(`  [warn] ${h.code} リターン取得失敗:`, err instanceof Error ? err.message : String(err));
      }
    }

    const result = resolveResult(returns.ret1m, h.expectedDirection);
    const relativeToTopix = returns.ret1m != null && topixRet1m != null
      ? returns.ret1m - topixRet1m
      : null;

    const outcome: HypothesisOutcome = {
      schemaVersion: 1,
      code: h.code,
      name: h.name,
      hypothesis: h,
      evaluatedAt: today,
      return1w: returns.ret1w,
      return1m: returns.ret1m,
      return3m: returns.ret3m,
      topixReturn1m: topixRet1m,
      relativeToTopix1m: relativeToTopix,
      result,
      notes: dataSource === "mock"
        ? "J-Quants未設定のためリターン未計算"
        : `${today}時点で評価`,
      dataSource,
    };

    appendOutcome(outcome);
    console.log(`  [reviewed] ${h.code} ${h.name}: ${result} (1m: ${returns.ret1m?.toFixed(1) ?? "N/A"}%)`);
  }

  // 全アウトカムを再集計してサマリー更新
  const allOutcomes = readExistingOutcomes();
  const summary = calcAccuracySummary(allOutcomes);
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\n精度サマリー: hit=${summary.hit}/${summary.total} (hitRate=${summary.hitRate != null ? (summary.hitRate * 100).toFixed(0) + "%" : "N/A"})`);
  console.log(`保存先: ${OUTCOME_PATH}`);
  console.log("=== 完了 ===");
}

main().catch(err => {
  console.error("[fatal]", err);
  process.exit(1);
});
