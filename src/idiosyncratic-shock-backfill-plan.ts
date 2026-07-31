// 企業固有ショック定量backfillのprovider-independent事前計画。
// 価格APIを呼ばず、どのcaseがsignal replayへ進めるか・何が不足しているか・必要取得期間を固定する。

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibilityDetailed,
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
  reactionAnchorReplayReady: boolean;
  signalReplayEligible: boolean;
  provider: "jquants" | "twelve_data" | "unsupported";
  benchmark: "TOPIX" | "S&P 500" | "unsupported";
  fetchFrom: string | null;
  fetchTo: string | null;
  blockers: string[];
};

export type ShockBackfillPlan = {
  generatedAt: string;
  totalHistoricalCases: number;
  tickerCases: number;
  supportedMarketCases: number;
  strategyEligibility: Record<HistoricalStrategyEligibilityStatus, number>;
  replayReadyAnchors: number;
  signalReplayEligible: number;
  byMarket: Partial<Record<ShockMarket, {
    tickerCases: number;
    confirmedPass: number;
    replayReady: number;
    signalReplayEligible: number;
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
    const replayReady = isHistoricalReactionAnchorReplayReady(context);
    const anchorBlockers = historicalReactionAnchorReplayBlockers(context);
    const blockers: string[] = [];

    if (!ticker) blockers.push("ticker missing");
    if (provider === "unsupported") blockers.push(`market ${market} has no quantitative provider`);
    if (eligibility.status !== "confirmed_pass") {
      blockers.push(`strategyEligibility=${eligibility.status}`);
      blockers.push(...eligibility.blockers, ...eligibility.missingEvidence);
    }
    if (!replayReady) blockers.push(...anchorBlockers);

    const signalReplayEligible = Boolean(ticker)
      && provider !== "unsupported"
      && eligibility.status === "confirmed_pass"
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
      reactionAnchorReplayReady: replayReady,
      signalReplayEligible,
      provider,
      benchmark,
      fetchFrom,
      fetchTo,
      blockers: [...new Set(blockers)],
    });
  }

  const tickerRows = rows.filter(row => Boolean(row.ticker));
  const supportedRows = tickerRows.filter(row => row.provider !== "unsupported");
  const strategyEligibility: Record<HistoricalStrategyEligibilityStatus, number> = {
    confirmed_pass: rows.filter(row => row.strategyEligibility === "confirmed_pass").length,
    confirmed_block: rows.filter(row => row.strategyEligibility === "confirmed_block").length,
    unknown: rows.filter(row => row.strategyEligibility === "unknown").length,
  };

  const byMarket: ShockBackfillPlan["byMarket"] = {};
  for (const market of [...new Set(tickerRows.map(row => row.market))].sort()) {
    const marketRows = tickerRows.filter(row => row.market === market);
    byMarket[market] = {
      tickerCases: marketRows.length,
      confirmedPass: marketRows.filter(row => row.strategyEligibility === "confirmed_pass").length,
      replayReady: marketRows.filter(row => row.reactionAnchorReplayReady).length,
      signalReplayEligible: marketRows.filter(row => row.signalReplayEligible).length,
    };
  }

  return {
    generatedAt: asOf,
    totalHistoricalCases: rows.length,
    tickerCases: tickerRows.length,
    supportedMarketCases: supportedRows.length,
    strategyEligibility,
    replayReadyAnchors: rows.filter(row => row.reactionAnchorReplayReady).length,
    signalReplayEligible: rows.filter(row => row.signalReplayEligible).length,
    byMarket,
    rows,
  };
}

function renderMarkdown(plan: ShockBackfillPlan): string {
  const signalRows = plan.rows
    .filter(row => row.signalReplayEligible)
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const anchorQueue = plan.rows
    .filter(row => row.strategyEligibility === "confirmed_pass" && !row.reactionAnchorReplayReady)
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));
  const eligibilityQueue = plan.rows
    .filter(row => row.strategyEligibility === "unknown")
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint));

  const lines = [
    "# 企業固有ショック Quantitative Backfill Plan",
    "",
    `生成日: ${plan.generatedAt}`,
    "",
    "> 価格APIを呼ばない事前計画。signal replayへ進めるのはconfirmed_pass + replay-ready reaction anchor + supported marketだけ。",
    "",
    `- historical cases: ${plan.totalHistoricalCases}`,
    `- ticker cases: ${plan.tickerCases}`,
    `- supported JP/US ticker cases: ${plan.supportedMarketCases}`,
    `- eligibility pass/block/unknown: ${plan.strategyEligibility.confirmed_pass}/${plan.strategyEligibility.confirmed_block}/${plan.strategyEligibility.unknown}`,
    `- replay-ready anchors: ${plan.replayReadyAnchors}`,
    `- signal replay eligible: ${plan.signalReplayEligible}`,
    "",
    "## Market readiness",
    "",
    "| market | ticker cases | confirmed pass | replay-ready | signal replay eligible |",
    "|---|---:|---:|---:|---:|",
  ];

  for (const [market, stats] of Object.entries(plan.byMarket)) {
    if (!stats) continue;
    lines.push(`| ${market} | ${stats.tickerCases} | ${stats.confirmedPass} | ${stats.replayReady} | ${stats.signalReplayEligible} |`);
  }

  lines.push("", "## Signal replay ready", "");
  if (signalRows.length === 0) lines.push("- none");
  else {
    lines.push("| market | ticker | company | score | reaction | checkpoint | provider | fetch range |", "|---|---|---|---:|---|---|---|---|");
    for (const row of signalRows) {
      lines.push(`| ${row.market} | ${row.ticker ?? "-"} | ${row.company} | ${row.score} | ${row.reactionStartDate ?? "-"} | ${row.checkpoint} | ${row.provider} | ${row.fetchFrom ?? "-"} → ${row.fetchTo ?? "-"} |`);
    }
  }

  lines.push("", "## P1 reaction-anchor queue", "");
  if (anchorQueue.length === 0) lines.push("- none");
  else {
    for (const row of anchorQueue) {
      const anchorReasons = row.blockers.filter(value => value.includes("anchor") || value.includes("timing") || value.includes("reaction"));
      lines.push(`- ${row.market} ${row.ticker ?? "-"} ${row.company} (${row.score}/20): ${anchorReasons.join(", ") || "reaction anchor research required"}`);
    }
  }

  lines.push("", "## Eligibility unknown queue", "");
  if (eligibilityQueue.length === 0) lines.push("- none");
  else {
    for (const row of eligibilityQueue.slice(0, 50)) {
      lines.push(`- ${row.market} ${row.ticker ?? "-"} ${row.company} (${row.score}/20): ${row.blockers.join(", ")}`);
    }
  }

  lines.push("", "## Rules", "");
  lines.push("- このplanは価格performanceを含まない。ここでreadyでも買い候補を意味しない。");
  lines.push("- reaction anchorが構造上validでもevidence URL/provenance note不足ならsignal replayへ進めない。");
  lines.push("- eligibility unknownをno-tradeへ変換しない。");
  lines.push("- provider unsupported市場はresearch-onlyのまま保持する。");
  lines.push("- fetch rangeはsignal探索最大90日 + signal後1年評価を欠損させない既存outcome contractを再利用する。");
  return lines.join("\n");
}

function main(): void {
  const plan = buildShockBackfillPlan();
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_backfill_plan_latest.json", JSON.stringify(plan, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_backfill_plan_latest.md", renderMarkdown(plan), "utf-8");
  console.log(`shock backfill plan: historical=${plan.totalHistoricalCases} ticker=${plan.tickerCases} supported=${plan.supportedMarketCases} eligibility=${plan.strategyEligibility.confirmed_pass}/${plan.strategyEligibility.confirmed_block}/${plan.strategyEligibility.unknown} replayReady=${plan.replayReadyAnchors} signalReplayEligible=${plan.signalReplayEligible}`);
}

if (process.argv[1]?.includes("idiosyncratic-shock-backfill-plan")) main();
