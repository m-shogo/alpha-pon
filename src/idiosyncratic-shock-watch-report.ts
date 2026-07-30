// 企業固有ショックの現在監視 + 過去類似比較レポート。
// pnpm report:shocks

import { mkdirSync, writeFileSync } from "fs";
import { addDaysJst, daysSinceJst, todayJst } from "./date.js";
import { fetchDailyQuotes, isJQuantsConfigured } from "./fetcher/jquants.js";
import { fetchTwelveDataDailyQuotes, isTwelveDataConfigured } from "./fetcher/twelve-data.js";
import {
  DEFAULT_SHOCK_WINDOW_DAYS,
  buildNotificationDecision,
  calculateShockDrawdownPct,
  findClosestHistoricalCases,
  inferPriceState,
  totalShockScore,
  type HistoricalShockCase,
  type ShockCandidate,
  type ShockDimensionScores,
  type ShockPriceState,
} from "./idiosyncratic-shock.js";
import { loadActiveShockConfig, loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import {
  inferShockMarket,
  shockBenchmarkLabel,
  supportsAutomaticShockPrice,
  type ShockMarket,
} from "./idiosyncratic-shock-market.js";
import { calculateSameDayRelativeShockDrawdownPct } from "./idiosyncratic-shock-relative.js";
import {
  buildShockJurisdictionReview,
  type ShockJurisdictionReview,
} from "./idiosyncratic-shock-jurisdiction.js";

const MARKET_BENCHMARK_CODE = process.env.MARKET_BENCHMARK_CODE ?? "1306";
const US_MARKET_BENCHMARK_SYMBOL = process.env.US_MARKET_BENCHMARK_SYMBOL ?? "SPY";

type ActiveConfigCandidate = ReturnType<typeof loadActiveShockConfig>["candidates"][number];
type PriceSource = "jquants" | "twelve_data" | "manual_override" | "missing";

type EvaluatedCandidate = {
  candidate: ShockCandidate;
  market: ShockMarket;
  benchmarkLabel: string;
  priceSource: PriceSource;
  priceAsOf: string | null;
  jurisdictionReview: ShockJurisdictionReview;
  decision: ReturnType<typeof buildNotificationDecision>;
  analogues: Array<{
    id: string;
    company: string;
    country: string;
    eventDate: string;
    category: string;
    score: number;
    outcomePattern: string;
    distance: number;
    jurisdictionPenalty: number;
    lesson: string;
  }>;
};

function normalizeDate(date: string): string {
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date.slice(0, 10);
}

function priceScore(state: ShockPriceState): 0 | 1 | 2 {
  if (state === "stabilized_after_drop") return 2;
  if (state === "stabilizing") return 1;
  return 0;
}

async function resolvePriceState(raw: ActiveConfigCandidate): Promise<{
  state: ShockPriceState;
  shockDrawdownPct: number | null;
  relativeShockDrawdownPct: number | null;
  source: PriceSource;
  asOf: string | null;
}> {
  const today = todayJst();
  const market = inferShockMarket({ market: raw.market, code: raw.code, ticker: raw.symbol });
  const fromDate = addDaysJst(raw.detectedAt, -10);
  const shockWindowEnd = addDaysJst(raw.detectedAt, DEFAULT_SHOCK_WINDOW_DAYS);

  if (market === "JP" && supportsAutomaticShockPrice(market) && raw.code && isJQuantsConfigured()) {
    try {
      const quotes = await fetchDailyQuotes(raw.code, fromDate.replaceAll("-", ""), today.replaceAll("-", ""));
      const benchmarkQuotes = await fetchDailyQuotes(
        MARKET_BENCHMARK_CODE,
        fromDate.replaceAll("-", ""),
        shockWindowEnd.replaceAll("-", ""),
      );
      const sortedQuotes = [...quotes].sort((a, b) => normalizeDate(a.Date).localeCompare(normalizeDate(b.Date)));
      const observations = sortedQuotes.map(row => ({
        date: normalizeDate(row.Date),
        close: row.AdjustmentClose,
        volume: row.AdjustmentVolume,
      }));
      const benchmarkObservations = benchmarkQuotes.map(row => ({
        date: normalizeDate(row.Date),
        close: row.AdjustmentClose,
        volume: row.AdjustmentVolume,
      }));
      const shockDrawdownPct = calculateShockDrawdownPct(observations, raw.detectedAt, shockWindowEnd);
      const relativeShockDrawdownPct = calculateSameDayRelativeShockDrawdownPct(
        observations,
        benchmarkObservations,
        raw.detectedAt,
        shockWindowEnd,
      );
      const latest = sortedQuotes.at(-1);
      if (latest) {
        const latestDate = normalizeDate(latest.Date);
        const age = daysSinceJst(latestDate);
        if (age !== null && age >= 0 && age <= 5) {
          const state = inferPriceState(observations);
          return { state, shockDrawdownPct, relativeShockDrawdownPct, source: "jquants", asOf: latestDate };
        }
      }
    } catch (error) {
      console.warn(`shock JP price fetch failed ${raw.code}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (market === "US" && supportsAutomaticShockPrice(market) && raw.symbol && isTwelveDataConfigured()) {
    try {
      const quotes = await fetchTwelveDataDailyQuotes(raw.symbol, fromDate, today);
      const benchmarkQuotes = await fetchTwelveDataDailyQuotes(US_MARKET_BENCHMARK_SYMBOL, fromDate, shockWindowEnd);
      const observations = quotes.map(row => ({
        date: normalizeDate(row.Date),
        close: row.AdjustmentClose,
        volume: row.AdjustmentVolume,
      }));
      const benchmarkObservations = benchmarkQuotes.map(row => ({
        date: normalizeDate(row.Date),
        close: row.AdjustmentClose,
        volume: row.AdjustmentVolume,
      }));
      const shockDrawdownPct = calculateShockDrawdownPct(observations, raw.detectedAt, shockWindowEnd);
      const relativeShockDrawdownPct = calculateSameDayRelativeShockDrawdownPct(
        observations,
        benchmarkObservations,
        raw.detectedAt,
        shockWindowEnd,
      );
      const latest = quotes.at(-1);
      if (latest) {
        const latestDate = normalizeDate(latest.Date);
        const age = daysSinceJst(latestDate);
        if (age !== null && age >= 0 && age <= 5) {
          const state = inferPriceState(observations);
          return { state, shockDrawdownPct, relativeShockDrawdownPct, source: "twelve_data", asOf: latestDate };
        }
      }
    } catch (error) {
      console.warn(`shock US price fetch failed ${raw.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 海外を含む手動overrideは、絶対下落と現地benchmark相対の両方を明示したときだけ使う。
  // relativeが無ければbuildNotificationDecision側でfail-closedする。
  if (raw.priceStateOverride && raw.priceStateCheckedAt) {
    const age = daysSinceJst(raw.priceStateCheckedAt);
    const maxAgeDays = Number(process.env.SHOCK_PRICE_OVERRIDE_MAX_AGE_DAYS ?? "3");
    if (age !== null && age >= 0 && age <= maxAgeDays) {
      return {
        state: raw.priceStateOverride,
        shockDrawdownPct: raw.shockDrawdownPctOverride ?? null,
        relativeShockDrawdownPct: raw.relativeShockDrawdownPctOverride ?? null,
        source: "manual_override",
        asOf: raw.priceStateCheckedAt,
      };
    }
  }

  return {
    state: "unknown",
    shockDrawdownPct: null,
    relativeShockDrawdownPct: null,
    source: "missing",
    asOf: null,
  };
}

function withDynamicPriceScore(scores: ShockDimensionScores, state: ShockPriceState): ShockDimensionScores {
  return { ...scores, priceStabilization: priceScore(state) };
}

async function evaluate(raw: ActiveConfigCandidate, historical: HistoricalShockCase[]): Promise<EvaluatedCandidate> {
  const market = inferShockMarket({ market: raw.market, code: raw.code, ticker: raw.symbol });
  const benchmarkLabel = shockBenchmarkLabel(market);
  const resolved = await resolvePriceState(raw);
  const candidate: ShockCandidate = {
    id: raw.id,
    code: raw.code ?? raw.symbol ?? null,
    country: raw.country ?? null,
    market,
    company: raw.company,
    detectedAt: raw.detectedAt,
    category: raw.category,
    actorType: raw.actorType,
    eventSummary: raw.eventSummary,
    macroPrimaryCause: raw.macroPrimaryCause,
    evidenceStatus: raw.evidenceStatus,
    investigationStatus: raw.investigationStatus,
    priceState: resolved.state,
    shockDrawdownPct: resolved.shockDrawdownPct,
    relativeShockDrawdownPct: resolved.relativeShockDrawdownPct,
    scores: withDynamicPriceScore(raw.scores, resolved.state),
    criticalLicenseOrDelistingRisk: raw.criticalLicenseOrDelistingRisk,
    sources: raw.sources,
  };

  const baseDecision = buildNotificationDecision(candidate);
  const jurisdictionReview = buildShockJurisdictionReview(candidate, historical);
  const blockers = [...baseDecision.blockers, ...jurisdictionReview.blockers];
  const decision = {
    ...baseDecision,
    eligible: blockers.length === 0,
    blockers,
  };

  const analogues = findClosestHistoricalCases(candidate, historical, 5).map(({ item, distance, jurisdictionPenalty }) => ({
    id: item.id,
    company: item.company,
    country: item.country,
    eventDate: item.eventDate,
    category: item.category,
    score: item.score,
    outcomePattern: item.outcome?.recoveryPattern ?? "unknown",
    distance,
    jurisdictionPenalty,
    lesson: item.outcome?.summary ?? "",
  }));
  return {
    candidate,
    market,
    benchmarkLabel,
    priceSource: resolved.source,
    priceAsOf: resolved.asOf,
    jurisdictionReview,
    decision,
    analogues,
  };
}

function historicalStats(cases: HistoricalShockCase[]) {
  const byCategory = new Map<string, HistoricalShockCase[]>();
  for (const item of cases) {
    const rows = byCategory.get(item.category) ?? [];
    rows.push(item);
    byCategory.set(item.category, rows);
  }
  return [...byCategory.entries()]
    .map(([category, rows]) => ({
      category,
      count: rows.length,
      avgScore: Number((rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(1)),
      researchPriority: rows.filter(row => row.score >= 16).length,
      watchOrHigher: rows.filter(row => row.score >= 12).length,
      failedOutcomes: rows.filter(row => row.outcome?.recoveryPattern === "failed").length,
    }))
    .sort((a, b) => b.count - a.count || b.avgScore - a.avgScore);
}

function countryStats(cases: HistoricalShockCase[]) {
  const counts = new Map<string, number>();
  for (const item of cases) counts.set(item.country, (counts.get(item.country) ?? 0) + 1);
  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

function renderMarkdown(date: string, evaluated: EvaluatedCandidate[], historical: HistoricalShockCase[]): string {
  const lines = [
    "# 企業固有ショック / 不祥事ディップ監視",
    "",
    `生成日: ${date}`,
    "",
    "> 20点は企業ダメージの世界共通score。国・文化差はscoreへ直接混ぜず、jurisdiction reviewと類似事例の重みで別管理します。",
    "> 恋愛・ハラスメント・炎上・バイトテロ等のjurisdiction-sensitiveカテゴリは、同国の同カテゴリ事例が不足すると自動通知を止めます。会計・品質不正は世界共通の構造比較をより強く使います。",
    "> 12点以上は必要条件であり十分条件ではありません。一次情報 + 調査範囲確定 + event窓の実下落 + 現地市場benchmark超過下落 + 下落一巡を必須にします。",
    "",
    "## 現在の監視候補",
    "",
  ];

  if (evaluated.length === 0) lines.push("- なし", "");
  for (const row of evaluated) {
    lines.push(`### ${row.candidate.code ?? "-"} ${row.candidate.company}`);
    lines.push(`- market: ${row.market} / country: ${row.jurisdictionReview.country ?? "unknown"} / jurisdiction: ${row.jurisdictionReview.group} / benchmark: ${row.benchmarkLabel}`);
    lines.push(`- score: **${row.decision.score}/20** (${row.decision.label})`);
    lines.push(`- category: ${row.candidate.category} / actor: ${row.candidate.actorType}`);
    lines.push(`- jurisdiction sensitivity: ${row.jurisdictionReview.sensitivity} / local confidence: ${row.jurisdictionReview.confidence}`);
    lines.push(`- analogue coverage: same-country/category=${row.jurisdictionReview.sameCountryCategoryCases}, same-group/category=${row.jurisdictionReview.sameGroupCategoryCases}, global/category=${row.jurisdictionReview.globalCategoryCases}`);
    lines.push(`- local review axes: ${row.jurisdictionReview.reviewAxes.join(" / ")}`);
    lines.push(`- evidence: ${row.candidate.evidenceStatus} / investigation: ${row.candidate.investigationStatus ?? "unknown"}`);
    lines.push(`- shock drawdown: ${row.candidate.shockDrawdownPct == null ? "-" : `${row.candidate.shockDrawdownPct.toFixed(1)}%`}`);
    lines.push(`- ${row.benchmarkLabel} same-day relative shock: ${row.candidate.relativeShockDrawdownPct == null ? "-" : `${row.candidate.relativeShockDrawdownPct.toFixed(1)}%`}`);
    lines.push(`- price: ${row.candidate.priceState} / source=${row.priceSource} / asOf=${row.priceAsOf ?? "-"}`);
    lines.push(`- notification: ${row.decision.eligible ? "PASS（調査候補通知）" : "WAIT"}`);
    if (row.decision.blockers.length > 0) lines.push(`- blockers: ${row.decision.blockers.join(" / ")}`);
    lines.push(`- event: ${row.candidate.eventSummary}`);
    lines.push("- closest analogues:");
    for (const analogy of row.analogues.slice(0, 3)) {
      lines.push(`  - [${analogy.country}] ${analogy.company} ${analogy.eventDate}: distance=${analogy.distance} (jurisdiction +${analogy.jurisdictionPenalty}), score=${analogy.score}/20, outcome=${analogy.outcomePattern}`);
      if (analogy.lesson) lines.push(`    - ${analogy.lesson}`);
    }
    lines.push("");
  }

  lines.push("## 過去事例DB", "");
  lines.push(`- cases: ${historical.length}`);
  lines.push(`- 16-20点: ${historical.filter(row => row.score >= 16).length}`);
  lines.push(`- 12-15点: ${historical.filter(row => row.score >= 12 && row.score < 16).length}`);
  lines.push(`- 8-11点: ${historical.filter(row => row.score >= 8 && row.score < 12).length}`);
  lines.push(`- 0-7点: ${historical.filter(row => row.score < 8).length}`);
  lines.push("");
  lines.push("### country coverage", "");
  lines.push("| country | n |", "|---|---:|");
  for (const stat of countryStats(historical)) lines.push(`| ${stat.country} | ${stat.count} |`);
  lines.push("");
  lines.push("### category stats", "");
  lines.push("| category | n | avg score | >=16 | >=12 | failed outcome |", "|---|---:|---:|---:|---:|---:|");
  for (const stat of historicalStats(historical)) {
    lines.push(`| ${stat.category} | ${stat.count} | ${stat.avgScore} | ${stat.researchPriority} | ${stat.watchOrHigher} | ${stat.failedOutcomes} |`);
  }
  lines.push("", "## 読み方", "");
  lines.push("- 20点scoreは国別の道徳観を採点しません。企業価値への実害だけを世界共通軸で測ります。");
  lines.push("- jurisdiction-sensitiveカテゴリは同国類似を優先し、同国事例が2件未満なら自動通知せずローカル制度/慣行レビューを要求します。");
  lines.push("- accounting / quality / organized fraud等は国差感度を低くし、世界の構造的負例を強く参照します。");
  lines.push(`- event後${DEFAULT_SHOCK_WINDOW_DAYS}日以内の下落だけをshockとして測り、数か月後の別材料下落を混ぜません。`);
  lines.push("- benchmark相対は対象株のshock lowと同じ取引日を使い、benchmark自身の別日の安値を差し引きません。");
  lines.push(`- JPはJ-Quants + TOPIX (${MARKET_BENCHMARK_CODE})。USはTwelve Data + S&P 500 proxy (${US_MARKET_BENCHMARK_SYMBOL})。`);
  lines.push("- provider/API keyが未設定なら価格はunknownとなり、自動通知しません。");
  lines.push("- 高得点でも priceState が falling / volatile / rebounded_too_fast なら通知しません。");
  lines.push("- investigationStatus が open / unknown の間は通知しません。範囲拡大を待ちます。");
  lines.push("- accountingIntegrity=0 は12点以上でも強制ブロックです。");
  lines.push("- 過去outcomeは類似事例の教訓用で、当時scoreへ逆流させません。");
  lines.push("- low confidence のseedは一次情報を追加して更新します。");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const date = todayJst();
  const historical = loadHistoricalShockCases();
  const active = loadActiveShockConfig();
  const evaluated: EvaluatedCandidate[] = [];
  for (const candidate of active.candidates) evaluated.push(await evaluate(candidate, historical));

  mkdirSync("reports", { recursive: true });
  const payload = {
    generatedAt: date,
    marketBenchmarkCode: MARKET_BENCHMARK_CODE,
    usMarketBenchmarkSymbol: US_MARKET_BENCHMARK_SYMBOL,
    marketAware: true,
    jurisdictionAware: true,
    jurisdictionPolicy: "global damage score + local-context review + jurisdiction-weighted analogues",
    relativeShockMethod: "benchmark return on stock shock-low trading date",
    shockWindowDays: DEFAULT_SHOCK_WINDOW_DAYS,
    historicalCaseCount: historical.length,
    historicalCountryStats: countryStats(historical),
    historicalStats: historicalStats(historical),
    candidates: evaluated,
  };
  writeFileSync("reports/idiosyncratic_shock_watch_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(`reports/idiosyncratic_shock_watch_${date}.json`, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_watch_latest.md", renderMarkdown(date, evaluated, historical), "utf-8");
  console.log(`企業固有ショック watch: active=${evaluated.length} historical=${historical.length}`);
  for (const row of evaluated) {
    console.log(`  ${row.market}/${row.jurisdictionReview.country ?? "?"} ${row.candidate.code ?? "-"} ${row.candidate.company}: ${totalShockScore(row.candidate.scores)}/20 jurisdiction=${row.jurisdictionReview.sensitivity}/${row.jurisdictionReview.confidence} shock=${row.candidate.shockDrawdownPct ?? "?"}% rel=${row.candidate.relativeShockDrawdownPct ?? "?"}% ${row.candidate.priceState} source=${row.priceSource} investigation=${row.candidate.investigationStatus ?? "unknown"} notify=${row.decision.eligible}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
