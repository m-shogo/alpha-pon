// 企業固有ショック定量backfillのprovider-independent事前計画。
// 価格APIを呼ばず、どのcaseがproduction/shadow signal replayへ進めるか・何が不足しているか・必要取得期間を固定する。

import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibilityDetailed,
  resolveHistoricalThresholdCalibrationEligibilityDetailed,
  type HistoricalStrategyEligibilityStatus,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";
import {
  historicalReactionAnchorReplayBlockers,
  isHistoricalReactionAnchorReplayReady,
} from "./idiosyncratic-shock-reaction-anchor.js";
import { outcomeFetchRange, outcomeFetchRangeIso } from "./idiosyncratic-shock-outcomes.js";

export type ShockBackfillPlanRow = {
  id: string;
  company: string;
  ticker: string | null;
  country: string;
  market: ShockMarket;
  score: number;
  checkpoint: string;
  eventDate: string;
  reactionStartDate: string | null;
  strategyEligibility: HistoricalStrategyEligibilityStatus;
  thresholdCalibrationEligibility: HistoricalStrategyEligibilityStatus;
  reactionAnchorReplayReady: boolean;
  signalReplayEligible: boolean;
  thresholdCalibrationReplayEligible: boolean;
  provider: "jquants" | "twelve_data" | "unsupported";
  benchmark: "TOPIX" | "S&P 500" | "unsupported";
  fetchFrom: string | null;
  fetchTo: string | null;
  blockers: string[];
  calibrationBlockers: string[];
};

export type ShockBackfillPlan = {
  generatedAt: string;
  totalHistoricalCases: number;
  tickerCases: number;
  supportedMarketCases: number;
  strategyEligibility: Record<HistoricalStrategyEligibilityStatus, number>;
  thresholdCalibrationEligibility: Record<HistoricalStrategyEligibilityStatus, number>;
  replayReadyAnchors: number;
  signalReplayEligible: number;
  thresholdCalibrationReplayEligible: number;
  byMarket: Partial<Record<ShockMarket, {
    tickerCases: number;
    confirmedPass: number;
    calibrationPass: number;
    replayReady: number;
    signalReplayEligible: number;
    thresholdCalibrationReplayEligible: number;
  }>>;
  rows: ShockBackfillPlanRow[];
};

function providerForMarket(market: ShockMarket): ShockBackfillPlanRow["provider"] {
  if (market === "JP") return "jquants";
  if (market === "US") return "twelve_data";
  return "unsupported";
}

function benchmarkForMarket(market: ShockMarket): ShockBackfillPlanRow["benchmark"] {
  if (market === "JP") return "TOPIX";
  if (market === "US") return "S&P 500";
  return "unsupported";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function buildShockBackfillPlan(asOf = todayJst()): ShockBackfillPlan {
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const rows: ShockBackfillPlanRow[] = [];

  for (const item of cases) {
    const ticker = item.ticker ?? null;
    const market = inferShockMarket({ country: item.country, ticker });
    const provider = providerForMarket(market);
    const benchmark = benchmarkForMarket(market);
    const context = contexts.get(item.id);
    const eligibility = resolveHistoricalStrategyEligibilityDetailed(item, context);
    const calibrationEligibility = resolveHistoricalThresholdCalibrationEligibilityDetailed(item, context);
    const replayReady = isHistoricalReactionAnchorReplayReady(context);
    const anchorBlockers = historicalReactionAnchorReplayBlockers(context);
    const blockers: string[] = [];
    const calibrationBlockers: string[] = [];

    if (!ticker) {
      blockers.push("ticker missing");
      calibrationBlockers.push("ticker missing");
    }
    if (provider === "unsupported") {
      blockers.push(`market ${market} has no quantitative provider`);
      calibrationBlockers.push(`market ${market} has no quantitative provider`);
    }
    if (eligibility.status !== "confirmed_pass") {
      blockers.push(`strategyEligibility=${eligibility.status}`);
      blockers.push(...eligibility.blockers, ...eligibility.missingEvidence);
    }
    if (calibrationEligibility.status !== "confirmed_pass") {
      calibrationBlockers.push(`thresholdCalibrationEligibility=${calibrationEligibility.status}`);
      calibrationBlockers.push(...calibrationEligibility.blockers, ...calibrationEligibility.missingEvidence);
    }
    if (!replayReady) {
      blockers.push(...anchorBlockers);
      calibrationBlockers.push(...anchorBlockers);
    }

    const signalReplayEligible = Boolean(ticker)
      && provider !== "unsupported"
      && eligibility.status === "confirmed_pass"
      && replayReady;
    const thresholdCalibrationReplayEligible = Boolean(ticker)
      && provider !== "unsupported"
      && calibrationEligibility.status === "confirmed_pass"
      && replayReady;

    let fetchFrom: string | null = null;
    let fetchTo: string | null = null;
    if (ticker && provider !== "unsupported") {
      const range = market === "JP"
        ? outcomeFetchRange(item, asOf)
        : outcomeFetchRangeIso(item, asOf);
      fetchFrom = range.from;
      fetchTo = range.to;
    }

    rows.push({
      id: item.id,
      company: item.company,
      ticker,
      country: item.country,
      market,
      score: item.score,
      checkpoint: item.decisionCheckpoint,
      eventDate: item.eventDate,
      reactionStartDate: context?.priceReactionStartDate ?? null,
      strategyEligibility: eligibility.status,
      thresholdCalibrationEligibility: calibrationEligibility.status,
      reactionAnchorReplayReady: replayReady,
      signalReplayEligible,
      thresholdCalibrationReplayEligible,
      provider,
      benchmark,
      fetchFrom,
      fetchTo,
      blockers: unique(blockers),
      calibrationBlockers: unique(calibrationBlockers),
    });
  }

  const tickerRows = rows.filter(row => Boolean(row.ticker));
  const supportedRows = tickerRows.filter(row => row.provider !== "unsupported");
  const strategyEligibility: Record<HistoricalStrategyEligibilityStatus, number> = {
    confirmed_pass: rows.filter(row => row.strategyEligibility === "confirmed_pass").length,
    confirmed_block: rows.filter(row => row.strategyEligibility === "confirmed_block").length,
    unknown: rows.filter(row => row.strategyEligibility === "unknown").length,
  };
  const thresholdCalibrationEligibility: Record<HistoricalStrategyEligibilityStatus, number> = {
    confirmed_pass: rows.filter(row => row.thresholdCalibrationEligibility === "confirmed_pass").length,
    confirmed_block: rows.filter(row => row.thresholdCalibrationEligibility === "confirmed_block").length,
    unknown: rows.filter(row => row.thresholdCalibrationEligibility === "unknown").length,
  };

  const byMarket: ShockBackfillPlan["byMarket"] = {};
  for (const market of [...new Set(tickerRows.map(row => row.market))].sort()) {
    const marketRows = tickerRows.filter(row => row.market === market);
    byMarket[market] = {
      tickerCases: marketRows.length,
      confirmedPass: marketRows.filter(row => row.strategyEligibility === "confirmed_pass").length,
      calibrationPass: marketRows.filter(row => row.thresholdCalibrationEligibility === "confirmed_pass").length,
      replayReady: marketRows.filter(row => row.reactionAnchorReplayReady).length,
      signalReplayEligible: marketRows.filter(row => row.signalReplayEligible).length,
      thresholdCalibrationReplayEligible: marketRows.filter(row => row.thresholdCalibrationReplayEligible).length,
    };
  }

  return {
    generatedAt: asOf,
    totalHistoricalCases: rows.length,
    tickerCases: tickerRows.length,
    supportedMarketCases: supportedRows.length,
    strategyEligibility,
    thresholdCalibrationEligibility,
    replayReadyAnchors: rows.filter(row => row.reactionAnchorReplayReady).length,
    signalReplayEligible: rows.filter(row => row.signalReplayEligible).length,
    thresholdCalibrationReplayEligible: rows.filter(row => row.thresholdCalibrationReplayEligible).length,
    byMarket,
    rows,
  };
}

function renderMarkdown(plan: ShockBackfillPlan): string {
  const signalRows = plan.rows
    .filter(row => row.signalReplayEligible)
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const calibrationRows = plan.rows
    .filter(row => row.thresholdCalibrationReplayEligible)
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const belowThresholdControls = calibrationRows.filter(row => row.score < 12);
  const anchorQueue = plan.rows
    .filter(row => row.thresholdCalibrationEligibility === "confirmed_pass" && !row.reactionAnchorReplayReady)
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const calibrationEligibilityQueue = plan.rows
    .filter(row => row.thresholdCalibrationEligibility === "unknown")
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));

  const lines = [
    "# 企業固有ショック Quantitative Backfill Plan",
    "",
    `生成日: ${plan.generatedAt}`,
    "",
    "> 価格APIを呼ばない事前計画。本番signalとthreshold=12検証用shadow signalを分離する。",
    "",
    `- historical cases: ${plan.totalHistoricalCases}`,
    `- ticker cases: ${plan.tickerCases}`,
    `- supported JP/US ticker cases: ${plan.supportedMarketCases}`,
    `- production eligibility pass/block/unknown: ${plan.strategyEligibility.confirmed_pass}/${plan.strategyEligibility.confirmed_block}/${plan.strategyEligibility.unknown}`,
    `- threshold calibration eligibility pass/block/unknown: ${plan.thresholdCalibrationEligibility.confirmed_pass}/${plan.thresholdCalibrationEligibility.confirmed_block}/${plan.thresholdCalibrationEligibility.unknown}`,
    `- replay-ready anchors: ${plan.replayReadyAnchors}`,
    `- production signal replay eligible: ${plan.signalReplayEligible}`,
    `- threshold calibration replay eligible: ${plan.thresholdCalibrationReplayEligible}`,
    `- below-threshold shadow controls ready: ${belowThresholdControls.length}`,
    "",
    "## Market readiness",
    "",
    "| market | ticker | prod pass | calib pass | replay-ready | prod replay | calib replay |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];

  for (const [market, stats] of Object.entries(plan.byMarket)) {
    if (!stats) continue;
    lines.push(`| ${market} | ${stats.tickerCases} | ${stats.confirmedPass} | ${stats.calibrationPass} | ${stats.replayReady} | ${stats.signalReplayEligible} | ${stats.thresholdCalibrationReplayEligible} |`);
  }

  lines.push("", "## Production signal replay ready", "");
  if (signalRows.length === 0) lines.push("- none");
  else {
    lines.push("| market | ticker | company | score | reaction | checkpoint | provider | fetch range |", "|---|---|---|---:|---|---|---|---|");
    for (const row of signalRows) lines.push(`| ${row.market} | ${row.ticker ?? "-"} | ${row.company} | ${row.score} | ${row.reactionStartDate ?? "-"} | ${row.checkpoint} | ${row.provider} | ${row.fetchFrom ?? "-"} → ${row.fetchTo ?? "-"} |`);
  }

  lines.push("", "## Threshold calibration shadow replay ready", "");
  if (calibrationRows.length === 0) lines.push("- none");
  else {
    lines.push("| market | ticker | company | score | production | reaction | provider |", "|---|---|---|---:|---|---|---|");
    for (const row of calibrationRows) lines.push(`| ${row.market} | ${row.ticker ?? "-"} | ${row.company} | ${row.score} | ${row.strategyEligibility} | ${row.reactionStartDate ?? "-"} | ${row.provider} |`);
  }

  lines.push("", "## Below-threshold shadow controls", "");
  if (belowThresholdControls.length === 0) lines.push("- none — threshold=12を下方向へ検証できないため追加調査が必要");
  else for (const row of belowThresholdControls) lines.push(`- ${row.market} ${row.ticker ?? "-"} ${row.company}: score=${row.score}, reaction=${row.reactionStartDate}, provider=${row.provider}`);

  lines.push("", "## Calibration reaction-anchor queue", "");
  if (anchorQueue.length === 0) lines.push("- none");
  else for (const row of anchorQueue) lines.push(`- ${row.market} ${row.ticker ?? "-"} ${row.company} (${row.score}/20): ${row.calibrationBlockers.join(", ")}`);

  lines.push("", "## Threshold-calibration eligibility unknown queue", "");
  if (calibrationEligibilityQueue.length === 0) lines.push("- none");
  else for (const row of calibrationEligibilityQueue.slice(0, 50)) lines.push(`- ${row.market} ${row.ticker ?? "-"} ${row.company} (${row.score}/20): ${row.calibrationBlockers.join(", ")}`);

  lines.push("", "## Rules", "");
  lines.push("- production eligibilityは現行score>=12を維持する。通知挙動は変更しない。");
  lines.push("- threshold calibration eligibilityだけscore thresholdを外し、その他のhard gateを本番と共有する。");
  lines.push("- 低score production BLOCKを自動でshadow PASSへ推測しない。calibrationEligibilityAtCheckpointの明示確認が必要。");
  lines.push("- reaction anchorが構造上validでもevidence URL/provenance note不足ならproduction/shadowどちらのsignal replayにも進めない。");
  lines.push("- unknown eligibilityをno-tradeへ変換しない。");
  lines.push("- provider unsupported市場はresearch-onlyのまま保持する。");
  return lines.join("\n");
}

function main(): void {
  const plan = buildShockBackfillPlan();
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_backfill_plan_latest.json", JSON.stringify(plan, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_backfill_plan_latest.md", renderMarkdown(plan), "utf-8");
  console.log(`shock backfill plan: historical=${plan.totalHistoricalCases} ticker=${plan.tickerCases} supported=${plan.supportedMarketCases} production=${plan.strategyEligibility.confirmed_pass}/${plan.strategyEligibility.confirmed_block}/${plan.strategyEligibility.unknown} calibration=${plan.thresholdCalibrationEligibility.confirmed_pass}/${plan.thresholdCalibrationEligibility.confirmed_block}/${plan.thresholdCalibrationEligibility.unknown} replayReady=${plan.replayReadyAnchors} prodReplay=${plan.signalReplayEligible} calibReplay=${plan.thresholdCalibrationReplayEligible}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) main();
