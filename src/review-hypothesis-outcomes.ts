// 仮説の結果検証
// reviewDueAt を過ぎた仮説について株価リターンを計算し、当たり外れを記録する
// pnpm review:hypotheses
//
// 注意: 買い推奨ではない。仮説の精度向上・反省用。
// J-Quants未設定時はリターン計算をスキップし、"unknown" として記録する。

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { addDaysJst, toCompactDate, todayJst } from "./date.js";
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

type ReturnData = {
  base: number | null;
  p1w: number | null;
  p1m: number | null;
  p3m: number | null;
  ret1w: number | null;
  ret1m: number | null;
  ret3m: number | null;
  maxDrawdownPct: number | null;
  dataAvailability: "ok" | "partial" | "missing";
};

function calcMaxDrawdownPct(base: number | null, prices: Array<number | null>): number | null {
  if (!base) return null;
  const valid = prices.filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  return ((min - base) / base) * 100;
}

function buildReturnData(quotes: { Date: string; AdjustmentClose: number }[], detectedAt: string): ReturnData {
  const sorted = quotes.sort((a, b) => a.Date.localeCompare(b.Date));
  const base = sorted[0]?.AdjustmentClose ?? null;
  const p1w = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 7)));
  const p1m = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 30)));
  const p3m = findPriceOnOrAfter(sorted, toCompactDate(addDaysJst(detectedAt, 90)));
  const ret1w = calcReturnPct(base, p1w);
  const ret1m = calcReturnPct(base, p1m);
  const ret3m = calcReturnPct(base, p3m);
  const maxDrawdownPct = calcMaxDrawdownPct(base, sorted.map(q => q.AdjustmentClose));
  const available = [base, p1w, p1m, p3m, ret1w, ret1m, ret3m, maxDrawdownPct].filter(v => v != null).length;
  return {
    base,
    p1w,
    p1m,
    p3m,
    ret1w,
    ret1m,
    ret3m,
    maxDrawdownPct,
    dataAvailability: available >= 8 ? "ok" : available >= 2 ? "partial" : "missing",
  };
}

async function fetchReturnData(
  code: string,
  detectedAt: string
): Promise<ReturnData> {
  const today = todayJst();
  const from = toCompactDate(detectedAt);
  const to = toCompactDate(today);

  const quotes = await fetchDailyQuotes(code, from, to);
  return buildReturnData(quotes, detectedAt);
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

function resolveActualDirection(ret1m: number | null): "up" | "down" | "sideways" | "unknown" {
  if (ret1m == null) return "unknown";
  if (ret1m >= 3) return "up";
  if (ret1m <= -3) return "down";
  return "sideways";
}

function buildOutcomeNotes(input: {
  hypothesis: StockCandidateHypothesis;
  returns: ReturnData;
  topixRet1m: number | null;
  relativeToTopix1m: number | null;
  result: HypothesisResult;
  dataSource: "jquants" | "mock";
}): Pick<HypothesisOutcome, "whatMatched" | "whatDiffered" | "missedSignals" | "improvedRuleIdeas" | "notes"> {
  if (input.dataSource === "mock") {
    return {
      whatMatched: [],
      whatDiffered: [],
      missedSignals: ["J-Quants未設定のため価格・TOPIX比を未検証"],
      improvedRuleIdeas: ["実データ取得後に同じ仮説を再レビューする"],
      notes: "J-Quants未設定のためリターン未計算",
    };
  }

  const whatMatched: string[] = [];
  const whatDiffered: string[] = [];
  const missedSignals: string[] = [];
  const improvedRuleIdeas: string[] = [];
  const direction = resolveActualDirection(input.returns.ret1m);

  if (input.hypothesis.expectedDirection === direction) {
    whatMatched.push(`期待方向 ${input.hypothesis.expectedDirection} と1か月方向が一致`);
  } else if (direction !== "unknown") {
    whatDiffered.push(`期待方向 ${input.hypothesis.expectedDirection} に対して実績は ${direction}`);
  }

  if (input.relativeToTopix1m != null) {
    if (input.relativeToTopix1m >= 0) whatMatched.push(`TOPIX比で+${input.relativeToTopix1m.toFixed(1)}%`);
    else whatDiffered.push(`TOPIX比で${input.relativeToTopix1m.toFixed(1)}%`);
  }

  if (input.returns.maxDrawdownPct != null && input.returns.maxDrawdownPct <= -10) {
    missedSignals.push(`検証期間中の最大下落が${input.returns.maxDrawdownPct.toFixed(1)}%`);
    improvedRuleIdeas.push("仮説保存時に最大許容下落と撤退確認ラインを明示する");
  }

  if (input.result === "miss") {
    improvedRuleIdeas.push("反証条件・一次情報・決算前後イベントを追加確認する");
  }
  if (input.returns.dataAvailability !== "ok") {
    missedSignals.push(`価格データ品質が${input.returns.dataAvailability}`);
    improvedRuleIdeas.push("データ取得期間または市場コードの妥当性を確認する");
  }

  return {
    whatMatched,
    whatDiffered,
    missedSignals,
    improvedRuleIdeas: [...new Set(improvedRuleIdeas)],
    notes: `${todayJst()}時点で評価。1m=${input.returns.ret1m?.toFixed(1) ?? "N/A"}%, TOPIX比=${input.relativeToTopix1m?.toFixed(1) ?? "N/A"}%`,
  };
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

  const relativeRets = outcomes.map(o => o.relativeToTopix1m).filter((v): v is number => v != null);
  const avgRelativeToTopix1m = relativeRets.length > 0
    ? relativeRets.reduce((a, b) => a + b, 0) / relativeRets.length
    : null;
  const drawdowns = outcomes.map(o => o.maxDrawdownPct).filter((v): v is number => v != null);
  const avgMaxDrawdownPct = drawdowns.length > 0
    ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length
    : null;

  return { total, hit, miss, tooEarly, unknown, hitRate, avgReturn1m, avgTopixReturn1m, avgRelativeToTopix1m, avgMaxDrawdownPct };
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
    let returns: ReturnData = { base: null, p1w: null, p1m: null, p3m: null, ret1w: null, ret1m: null, ret3m: null, maxDrawdownPct: null, dataAvailability: "missing" };
    let topixReturns: ReturnData = { base: null, p1w: null, p1m: null, p3m: null, ret1w: null, ret1m: null, ret3m: null, maxDrawdownPct: null, dataAvailability: "missing" };
    let dataSource: "jquants" | "mock" = "mock";

    if (useJQuants) {
      try {
        returns = await fetchReturnData(h.code, h.detectedAt);
        await sleep(300);

        // TOPIX比較
        topixReturns = buildReturnData(topixQuotes, h.detectedAt);
        dataSource = "jquants";
      } catch (err) {
        console.warn(`  [warn] ${h.code} リターン取得失敗:`, err instanceof Error ? err.message : String(err));
      }
    }

    const result = resolveResult(returns.ret1m, h.expectedDirection);
    const relativeToTopix1w = returns.ret1w != null && topixReturns.ret1w != null ? returns.ret1w - topixReturns.ret1w : null;
    const relativeToTopix1m = returns.ret1m != null && topixReturns.ret1m != null ? returns.ret1m - topixReturns.ret1m : null;
    const relativeToTopix3m = returns.ret3m != null && topixReturns.ret3m != null ? returns.ret3m - topixReturns.ret3m : null;
    const narrative = buildOutcomeNotes({ hypothesis: h, returns, topixRet1m: topixReturns.ret1m, relativeToTopix1m, result, dataSource });

    const outcome: HypothesisOutcome = {
      schemaVersion: 1,
      code: h.code,
      name: h.name,
      hypothesis: h,
      evaluatedAt: today,
      startPrice: returns.base,
      endPrice1w: returns.p1w,
      endPrice1m: returns.p1m,
      endPrice3m: returns.p3m,
      return1w: returns.ret1w,
      return1m: returns.ret1m,
      return3m: returns.ret3m,
      benchmarkReturn1w: topixReturns.ret1w,
      benchmarkReturn3m: topixReturns.ret3m,
      topixReturn1m: topixReturns.ret1m,
      relativeToTopix1w,
      relativeToTopix1m,
      relativeToTopix3m,
      maxDrawdownPct: returns.maxDrawdownPct,
      actualDirection: resolveActualDirection(returns.ret1m),
      result,
      dataAvailability: returns.dataAvailability,
      whatMatched: narrative.whatMatched,
      whatDiffered: narrative.whatDiffered,
      missedSignals: narrative.missedSignals,
      improvedRuleIdeas: narrative.improvedRuleIdeas,
      notes: narrative.notes,
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
