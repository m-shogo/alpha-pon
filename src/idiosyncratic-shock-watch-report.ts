// 企業固有ショックの現在監視 + 過去類似比較レポート。
// pnpm report:shocks

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
import { loadHistoricalShockCaseContext } from "./idiosyncratic-shock-case-context.js";
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
import {
  buildShockContextReview,
  contextAnalogyPenalty,
  type ShockContextReview,
  type ShockContextInput,
} from "./idiosyncratic-shock-context.js";
import {
  enrichShockCalibrationObservations,
  type ShockCalibrationObservation,
} from "./idiosyncratic-shock-calibration.js";
import {
  computeLocalOpportunityScore,
  loadShockCalibrationConfig,
  resolveShockCalibration,
  type ResolvedShockCalibration,
  type ShockCalibrationConfig,
} from "./idiosyncratic-shock-calibration-config.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

const MARKET_BENCHMARK_CODE = process.env.MARKET_BENCHMARK_CODE ?? "1306";
const US_MARKET_BENCHMARK_SYMBOL = process.env.US_MARKET_BENCHMARK_SYMBOL ?? "SPY";
const SHOCK_OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";

type ActiveConfigCandidate = ReturnType<typeof loadActiveShockConfig>["candidates"][number];
type HistoricalContextMap = ReturnType<typeof loadHistoricalShockCaseContext>;
type PriceSource = "jquants" | "twelve_data" | "manual_override" | "missing";

type EvaluatedCandidate = {
  candidate: ShockCandidate;
  market: ShockMarket;
  benchmarkLabel: string;
  priceSource: PriceSource;
  priceAsOf: string | null;
  jurisdictionReview: ShockJurisdictionReview;
  contextReview: ShockContextReview;
  calibration: ResolvedShockCalibration;
  localOpportunityScore: number;
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
    temporalPenalty: number;
    contextPenalty: number;
    contextVerified: boolean;
    lesson: string;
  }>;
};

function loadOutcomeRecords(): ShockHistoricalOutcomeRecord[] {
  if (!existsSync(SHOCK_OUTCOME_PATH)) return [];
  try {
    const payload = JSON.parse(readFileSync(SHOCK_OUTCOME_PATH, "utf-8")) as { records?: ShockHistoricalOutcomeRecord[] };
    return Array.isArray(payload.records) ? payload.records : [];
  } catch {
    return [];
  }
}

function normalizeDate(date: string): string {
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date.slice(0, 10);
}

function priceScore(state: ShockPriceState): 0 | 1 | 2 {
  if (state === "stabilized_after_drop") return 2;
  if (state === "stabilizing") return 1;
  return 0;
}

function pctText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "-" : `${value.toFixed(1)}%`;
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

function candidateContext(raw: ActiveConfigCandidate): ShockContextInput {
  return {
    issuerCountry: raw.country,
    incidentCountry: raw.incidentCountry,
    market: raw.market,
    sector: raw.sector,
    stakeholder: raw.stakeholder,
    incidentScope: raw.incidentScope,
    confounderStatus: raw.confounderStatus,
    informationLeakStatus: raw.informationLeakStatus,
    recurrenceStatus: raw.recurrenceStatus,
    remediationStatus: raw.remediationStatus,
    listingStructure: raw.listingStructure,
    ownershipControl: raw.ownershipControl,
    liquidityStatus: raw.liquidityStatus,
    incidentClusterStatus: raw.incidentClusterStatus,
    disclosureObservability: raw.disclosureObservability,
    incidentRevenueExposurePct: raw.incidentRevenueExposurePct,
    estimatedDirectCostPctMarketCap: raw.estimatedDirectCostPctMarketCap,
    industryRelativeShockDrawdownPct: raw.industryRelativeShockDrawdownPct,
  };
}

function rerankAnalogues(
  candidate: ShockCandidate,
  raw: ActiveConfigCandidate,
  historical: HistoricalShockCase[],
  historicalContext: HistoricalContextMap,
) {
  const broad = findClosestHistoricalCases(candidate, historical, Math.min(20, historical.length));
  const currentContext = candidateContext(raw);
  return broad
    .map(({ item, distance, jurisdictionPenalty, temporalPenalty }) => {
      const context = historicalContext.get(item.id);
      const contextPenalty = context
        ? contextAnalogyPenalty(currentContext, {
          issuerCountry: item.country,
          incidentCountry: context.incidentCountry,
          sector: context.sector,
          stakeholder: context.stakeholder,
          incidentScope: context.incidentScope,
          recurrenceStatus: context.recurrenceStatus,
          listingStructure: context.listingStructure,
          ownershipControl: context.ownershipControl,
          liquidityStatus: context.liquidityStatus,
          incidentClusterStatus: context.incidentClusterStatus,
          disclosureObservability: context.disclosureObservability,
        })
        : 0;
      return {
        item,
        distance: distance + contextPenalty,
        jurisdictionPenalty,
        temporalPenalty,
        contextPenalty,
        contextVerified: Boolean(context),
      };
    })
    .sort((a, b) => a.distance - b.distance || b.item.score - a.item.score)
    .slice(0, 5);
}

async function evaluate(
  raw: ActiveConfigCandidate,
  historical: HistoricalShockCase[],
  historicalContext: HistoricalContextMap,
  calibrationObservations: ShockCalibrationObservation[],
  calibrationConfig: ShockCalibrationConfig,
): Promise<EvaluatedCandidate> {
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

  const calibration = resolveShockCalibration(calibrationConfig, {
    country: candidate.country,
    market,
    category: candidate.category,
    observations: calibrationObservations,
  });
  const localOpportunityScore = computeLocalOpportunityScore(candidate.scores, calibration.registryEntry);
  // 共通hard gateはそのまま使うが、score thresholdだけLocal Opportunityへ置き換える。
  const structuralDecision = buildNotificationDecision(candidate, 0);
  const localScoreBlockers = localOpportunityScore < calibration.readiness.effectiveThreshold
    ? [`localOpportunityScore ${localOpportunityScore.toFixed(2)} < threshold ${calibration.readiness.effectiveThreshold}`]
    : [];
  const jurisdictionReview = buildShockJurisdictionReview(candidate, historical);
  const contextReview = buildShockContextReview(candidateContext(raw));
  const blockers = [...structuralDecision.blockers, ...localScoreBlockers, ...jurisdictionReview.blockers, ...contextReview.blockers];
  const decision = {
    ...structuralDecision,
    eligible: blockers.length === 0,
    blockers,
  };

  const analogues = rerankAnalogues(candidate, raw, historical, historicalContext).map(({
    item,
    distance,
    jurisdictionPenalty,
    temporalPenalty,
    contextPenalty,
    contextVerified,
  }) => ({
    id: item.id,
    company: item.company,
    country: item.country,
    eventDate: item.eventDate,
    category: item.category,
    score: item.score,
    outcomePattern: item.outcome?.recoveryPattern ?? "unknown",
    distance,
    jurisdictionPenalty,
    temporalPenalty,
    contextPenalty,
    contextVerified,
    lesson: item.outcome?.summary ?? "",
  }));
  return {
    candidate,
    market,
    benchmarkLabel,
    priceSource: resolved.source,
    priceAsOf: resolved.asOf,
    jurisdictionReview,
    contextReview,
    calibration,
    localOpportunityScore,
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

function renderMarkdown(
  date: string,
  evaluated: EvaluatedCandidate[],
  historical: HistoricalShockCase[],
  historicalContextCount: number,
): string {
  const lines = [
    "# 企業固有ショック / 不祥事ディップ監視",
    "",
    `生成日: ${date}`,
    "",
    "> Global Structural Scoreは企業ダメージの世界共通20点。国差はjurisdiction evidence、事件帰属はcontext、検証済み差分だけLocal Opportunity Scoreで別管理します。",
    "> local weights/thresholdはoutcome母数 + chronological holdout + registry証跡を全て満たした場合だけ使い、それ以外はGlobal scoreと12点へ戻します。",
    "> 本社国・事件国・上場市場・業種・被害者・支配構造・流動性・事件連鎖・開示観測性・再発・是正・同時材料を分離し、分からない重要軸はunknownのままWAITにします。",
    "",
    "## 現在の監視候補",
    "",
  ];

  if (evaluated.length === 0) lines.push("- なし", "");
  for (const row of evaluated) {
    const calibration = row.calibration.readiness;
    lines.push(`### ${row.candidate.code ?? "-"} ${row.candidate.company}`);
    lines.push(`- market: ${row.market} / issuer country: ${row.jurisdictionReview.country ?? "unknown"} / incident country: ${row.contextReview.incidentCountry ?? "unknown"} / benchmark: ${row.benchmarkLabel}`);
    lines.push(`- Global Structural Score: **${row.decision.score}/20** / Local Opportunity Score: **${row.localOpportunityScore.toFixed(2)}/20** / effective threshold=${calibration.effectiveThreshold}`);
    lines.push(`- calibration: level=${calibration.modelLevel} / status=${calibration.status} / method=${row.calibration.registryEntry?.scoreMethod ?? "global_structural"} / country n=${calibration.countryCases} / country-category n=${calibration.countryCategoryCases} / registry=${row.calibration.registryEntry?.id ?? "none"}`);
    lines.push(`- category: ${row.candidate.category} / actor: ${row.candidate.actorType}`);
    lines.push(`- jurisdiction: ${row.jurisdictionReview.group} / sensitivity=${row.jurisdictionReview.sensitivity} / local confidence=${row.jurisdictionReview.confidence} / evidence tier=${row.jurisdictionReview.evidenceTier}`);
    lines.push(`- evidence weights: local=${row.jurisdictionReview.evidenceWeights.sameCountry}, group=${row.jurisdictionReview.evidenceWeights.sameGroup}, global=${row.jurisdictionReview.evidenceWeights.global}`);
    lines.push(`- analogue coverage: same-country/category=${row.jurisdictionReview.sameCountryCategoryCases}, same-group/category=${row.jurisdictionReview.sameGroupCategoryCases}, global/category=${row.jurisdictionReview.globalCategoryCases}`);
    lines.push(`- incident context: geography=${row.contextReview.incidentGeography} / sectorRisk=${row.contextReview.sectorRiskClass} / stakeholder=${row.contextReview.stakeholder} / scope=${row.contextReview.incidentScope}`);
    lines.push(`- structure: listing=${row.contextReview.listingStructure} / ownership=${row.contextReview.ownershipControl} / liquidity=${row.contextReview.liquidityStatus} / cluster=${row.contextReview.incidentClusterStatus} / observability=${row.contextReview.disclosureObservability}`);
    lines.push(`- attribution: confounder=${row.contextReview.confounderStatus} / leak=${row.contextReview.informationLeakStatus} / recurrence=${row.contextReview.recurrenceStatus} / remediation=${row.contextReview.remediationStatus}`);
    lines.push(`- exposure: incident-region revenue=${pctText(row.contextReview.incidentRevenueExposurePct)} / direct-cost-to-market-cap=${pctText(row.contextReview.estimatedDirectCostPctMarketCap)} / industry-relative=${pctText(row.contextReview.industryRelativeShockDrawdownPct)}`);
    if (row.contextReview.reviewNotes.length > 0) lines.push(`- context notes: ${row.contextReview.reviewNotes.join(" / ")}`);
    lines.push(`- local review axes: ${row.jurisdictionReview.reviewAxes.join(" / ")}`);
    lines.push(`- evidence: ${row.candidate.evidenceStatus} / investigation: ${row.candidate.investigationStatus ?? "unknown"}`);
    lines.push(`- shock drawdown: ${pctText(row.candidate.shockDrawdownPct)}`);
    lines.push(`- ${row.benchmarkLabel} same-day relative shock: ${pctText(row.candidate.relativeShockDrawdownPct)}`);
    lines.push(`- price: ${row.candidate.priceState} / source=${row.priceSource} / asOf=${row.priceAsOf ?? "-"}`);
    lines.push(`- notification: ${row.decision.eligible ? "PASS（調査候補通知）" : "WAIT"}`);
    if (row.decision.blockers.length > 0) lines.push(`- blockers: ${row.decision.blockers.join(" / ")}`);
    lines.push(`- event: ${row.candidate.eventSummary}`);
    lines.push("- closest analogues:");
    for (const analogy of row.analogues.slice(0, 3)) {
      lines.push(`  - [${analogy.country}] ${analogy.company} ${analogy.eventDate}: distance=${analogy.distance} (jurisdiction +${analogy.jurisdictionPenalty}, time +${analogy.temporalPenalty}, context +${analogy.contextPenalty}${analogy.contextVerified ? " verified" : " unverified"}), score=${analogy.score}/20, outcome=${analogy.outcomePattern}`);
      if (analogy.lesson) lines.push(`    - ${analogy.lesson}`);
    }
    lines.push("");
  }

  lines.push("## 過去事例DB", "");
  lines.push(`- cases: ${historical.length}`);
  lines.push(`- context sidecar coverage: ${historicalContextCount}/${historical.length}`);
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
  lines.push("- Global Structural Scoreへ国別の道徳点を足しません。企業価値への実害は世界共通軸です。");
  lines.push("- Local Opportunity Scoreのdimension weightsとthresholdは検証済みregistryにある場合だけ適用します。registryなしではGlobal score=Local scoreです。");
  lines.push("- local modelはcountry-category → country → jurisdiction-group → globalの順で、holdoutとregistryを満たす最深の検証済み階層を使います。");
  lines.push("- evidence poolは同国→同制度圏→世界の順で借り、母数が薄いと自動通知を止めます。");
  lines.push("- context sidecarは確認できた事例だけ付与し、未確認項目を推測で埋めません。");
  lines.push("- 本社国と事件国を分離します。海外子会社の事件は現地規制と本社ガバナンスを両方確認します。");
  lines.push("- ADR/二重上場はprimary listing、売買停止/値幅制限は価格発見、支配株主はactor separabilityを追加確認します。");
  lines.push("- 関連不祥事がcascadeしている間は単発ディップ扱いせず、開示観測性が低い市場ではニュースの少なさを安全材料にしません。");
  lines.push("- 決算・増資・M&A・訴訟等の同時材料がmajor/unknownなら、不祥事下げへ帰属せずWAITです。");
  lines.push("- systemic recurrence / weak remediation / likely information leakは通知をBLOCKします。");
  lines.push("- broad-market比較だけでなく、同業比較が取れる場合は企業固有shockが残ることを要求します。");
  lines.push("- 古い文化依存事例はtemporal penaltyで順位を下げます。会計/品質等はより長く構造比較に残します。");
  lines.push(`- event後${DEFAULT_SHOCK_WINDOW_DAYS}日以内の下落だけを初期shockとして測ります。`);
  lines.push(`- JPはJ-Quants + TOPIX (${MARKET_BENCHMARK_CODE})。USはTwelve Data + S&P 500 proxy (${US_MARKET_BENCHMARK_SYMBOL})。`);
  lines.push("- provider/API keyが未設定なら価格はunknownとなり、自動通知しません。");
  lines.push("- outcomeは当時Global scoreへ逆流させません。dataset bias自体もaudit対象です。");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const date = todayJst();
  const historical = loadHistoricalShockCases();
  const historicalContext = loadHistoricalShockCaseContext();
  const active = loadActiveShockConfig();
  const calibrationConfig = loadShockCalibrationConfig();
  const calibrationObservations = enrichShockCalibrationObservations(loadOutcomeRecords(), historical);
  const evaluated: EvaluatedCandidate[] = [];
  for (const candidate of active.candidates) {
    evaluated.push(await evaluate(candidate, historical, historicalContext, calibrationObservations, calibrationConfig));
  }

  mkdirSync("reports", { recursive: true });
  const payload = {
    generatedAt: date,
    marketBenchmarkCode: MARKET_BENCHMARK_CODE,
    usMarketBenchmarkSymbol: US_MARKET_BENCHMARK_SYMBOL,
    marketAware: true,
    jurisdictionAware: true,
    contextAware: true,
    calibrationAware: true,
    validatedLocalThresholds: calibrationConfig.validatedLocalThresholds.length,
    jurisdictionPolicy: "global damage score + hierarchical local-to-global evidence + temporal decay",
    contextPolicy: "issuer/incident/market separation + verified sidecar reranking + sector/stakeholder/scope + listing/ownership/liquidity/cluster/observability + causal attribution + recurrence/remediation",
    calibrationPolicy: "global structural score + validated local opportunity weights/threshold + hierarchical outcome readiness + chronological holdout + explicit registry; otherwise Global score/threshold=12",
    relativeShockMethod: "benchmark return on stock shock-low trading date",
    shockWindowDays: DEFAULT_SHOCK_WINDOW_DAYS,
    calibrationOutcomeObservations: calibrationObservations.filter(row => row.benchmarkRelative3m != null).length,
    historicalCaseCount: historical.length,
    historicalContextCount: historicalContext.size,
    historicalCountryStats: countryStats(historical),
    historicalStats: historicalStats(historical),
    candidates: evaluated,
  };
  writeFileSync("reports/idiosyncratic_shock_watch_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync(`reports/idiosyncratic_shock_watch_${date}.json`, JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_watch_latest.md", renderMarkdown(date, evaluated, historical, historicalContext.size), "utf-8");
  console.log(`企業固有ショック watch: active=${evaluated.length} historical=${historical.length} context=${historicalContext.size} calibration3m=${payload.calibrationOutcomeObservations} registry=${payload.validatedLocalThresholds}`);
  for (const row of evaluated) {
    const c = row.calibration.readiness;
    console.log(`  ${row.market}/${row.jurisdictionReview.country ?? "?"}/${row.contextReview.incidentCountry ?? "?"} ${row.candidate.code ?? "-"} ${row.candidate.company}: global=${totalShockScore(row.candidate.scores)}/20 local=${row.localOpportunityScore.toFixed(2)}/20 threshold=${c.effectiveThreshold}/${c.effectiveThresholdSource} calibration=${c.modelLevel}/${c.status} jurisdiction=${row.jurisdictionReview.evidenceTier}/${row.jurisdictionReview.confidence} contextBlockers=${row.contextReview.blockers.length} shock=${row.candidate.shockDrawdownPct ?? "?"}% rel=${row.candidate.relativeShockDrawdownPct ?? "?"}% ${row.candidate.priceState} notify=${row.decision.eligible}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
