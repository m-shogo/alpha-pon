// Threshold=12検証用shadow controlの「件数だけ」達成を防ぐ多様性監査。
// 11点の同一カテゴリ/同一市場だけを8件集めてもthreshold変更readyにしない。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalThresholdCalibrationEligibility,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket, type ShockMarket } from "./idiosyncratic-shock-market.js";
import { isHistoricalReactionAnchorReplayReady } from "./idiosyncratic-shock-reaction-anchor.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";

export const THRESHOLD_DIVERSITY_TARGETS = {
  totalReplayReadyBelow12: 8,
  nearBoundary10to11: 4,
  deeper8to9: 2,
  distinctCategories: 3,
  jpControls: 2,
  usControls: 2,
  usable3mBelow12: 8,
} as const;

export type ThresholdDiversityRow = {
  id: string;
  company: string;
  ticker: string | null;
  country: string;
  market: ShockMarket;
  score: number;
  category: string;
  actorType: string;
  calibrationEligibility: "confirmed_pass" | "confirmed_block" | "unknown";
  replayReady: boolean;
  supportedMarket: boolean;
  usable3m: boolean;
};

export type ThresholdDiversitySummary = {
  totalReplayReadyBelow12: number;
  nearBoundary10to11: number;
  deeper8to9: number;
  score0to7: number;
  distinctCategories: number;
  categories: string[];
  jpControls: number;
  usControls: number;
  distinctActorTypes: number;
  actorTypes: string[];
  usable3mBelow12: number;
  blockers: string[];
  ready: boolean;
};

function loadOutcomes(): ShockHistoricalOutcomeRecord[] {
  if (!existsSync(OUTCOME_PATH)) return [];
  try {
    const payload = JSON.parse(readFileSync(OUTCOME_PATH, "utf-8")) as { records?: ShockHistoricalOutcomeRecord[] };
    return Array.isArray(payload.records) ? payload.records : [];
  } catch {
    return [];
  }
}

function outcomeUsable3m(row?: ShockHistoricalOutcomeRecord): boolean {
  return Boolean(
    row
    && row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass"
    && row.reactionAnchorStatus === "verified"
    && row.calibrationFirstEligibleSignalDate
    && typeof row.calibrationSignalBenchmarkRelative3m === "number"
    && Number.isFinite(row.calibrationSignalBenchmarkRelative3m),
  );
}

export function buildThresholdDiversityRows(): ThresholdDiversityRow[] {
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const outcomes = new Map(loadOutcomes().map(row => [row.caseId, row]));

  return cases
    .filter(item => item.score < 12)
    .map(item => {
      const context = contexts.get(item.id);
      const market = inferShockMarket({ country: item.country, ticker: item.ticker });
      const supportedMarket = market === "JP" || market === "US";
      return {
        id: item.id,
        company: item.company,
        ticker: item.ticker ?? null,
        country: item.country,
        market,
        score: item.score,
        category: item.category,
        actorType: item.actorType,
        calibrationEligibility: resolveHistoricalThresholdCalibrationEligibility(item, context),
        replayReady: isHistoricalReactionAnchorReplayReady(context),
        supportedMarket,
        usable3m: outcomeUsable3m(outcomes.get(item.id)),
      };
    });
}

export function summarizeThresholdDiversity(rows: ThresholdDiversityRow[]): ThresholdDiversitySummary {
  const controls = rows.filter(row => row.calibrationEligibility === "confirmed_pass" && row.replayReady && row.supportedMarket);
  const categories = [...new Set(controls.map(row => row.category))].sort();
  const actorTypes = [...new Set(controls.map(row => row.actorType))].sort();
  const summary = {
    totalReplayReadyBelow12: controls.length,
    nearBoundary10to11: controls.filter(row => row.score >= 10 && row.score <= 11).length,
    deeper8to9: controls.filter(row => row.score >= 8 && row.score <= 9).length,
    score0to7: controls.filter(row => row.score <= 7).length,
    distinctCategories: categories.length,
    categories,
    jpControls: controls.filter(row => row.market === "JP").length,
    usControls: controls.filter(row => row.market === "US").length,
    distinctActorTypes: actorTypes.length,
    actorTypes,
    usable3mBelow12: controls.filter(row => row.usable3m).length,
    blockers: [] as string[],
    ready: false,
  };

  if (summary.totalReplayReadyBelow12 < THRESHOLD_DIVERSITY_TARGETS.totalReplayReadyBelow12) {
    summary.blockers.push(`replay-ready below12 ${summary.totalReplayReadyBelow12}/${THRESHOLD_DIVERSITY_TARGETS.totalReplayReadyBelow12}`);
  }
  if (summary.nearBoundary10to11 < THRESHOLD_DIVERSITY_TARGETS.nearBoundary10to11) {
    summary.blockers.push(`score10-11 controls ${summary.nearBoundary10to11}/${THRESHOLD_DIVERSITY_TARGETS.nearBoundary10to11}`);
  }
  if (summary.deeper8to9 < THRESHOLD_DIVERSITY_TARGETS.deeper8to9) {
    summary.blockers.push(`score8-9 controls ${summary.deeper8to9}/${THRESHOLD_DIVERSITY_TARGETS.deeper8to9}`);
  }
  if (summary.distinctCategories < THRESHOLD_DIVERSITY_TARGETS.distinctCategories) {
    summary.blockers.push(`distinct categories ${summary.distinctCategories}/${THRESHOLD_DIVERSITY_TARGETS.distinctCategories}`);
  }
  if (summary.jpControls < THRESHOLD_DIVERSITY_TARGETS.jpControls) {
    summary.blockers.push(`JP controls ${summary.jpControls}/${THRESHOLD_DIVERSITY_TARGETS.jpControls}`);
  }
  if (summary.usControls < THRESHOLD_DIVERSITY_TARGETS.usControls) {
    summary.blockers.push(`US controls ${summary.usControls}/${THRESHOLD_DIVERSITY_TARGETS.usControls}`);
  }
  if (summary.usable3mBelow12 < THRESHOLD_DIVERSITY_TARGETS.usable3mBelow12) {
    summary.blockers.push(`usable shadow 3m ${summary.usable3mBelow12}/${THRESHOLD_DIVERSITY_TARGETS.usable3mBelow12}`);
  }
  summary.ready = summary.blockers.length === 0;
  return summary;
}

function main(): void {
  const date = todayJst();
  const rows = buildThresholdDiversityRows();
  const summary = summarizeThresholdDiversity(rows);
  const controls = rows
    .filter(row => row.calibrationEligibility === "confirmed_pass")
    .sort((a, b) => b.score - a.score || a.market.localeCompare(b.market) || a.id.localeCompare(b.id));
  const queue = rows
    .filter(row => row.calibrationEligibility === "unknown" && row.supportedMarket)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const payload = {
    generatedAt: date,
    productionThreshold: 12,
    targets: THRESHOLD_DIVERSITY_TARGETS,
    summary,
    controls,
    reviewQueue: queue,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_threshold_diversity_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  const lines = [
    "# 企業固有ショック Threshold Control Diversity Audit",
    "",
    `生成日: ${date}`,
    "",
    `- threshold change readiness: **${summary.ready ? "READY" : "NOT READY"}**`,
    `- replay-ready below12: ${summary.totalReplayReadyBelow12}/${THRESHOLD_DIVERSITY_TARGETS.totalReplayReadyBelow12}`,
    `- score10-11: ${summary.nearBoundary10to11}/${THRESHOLD_DIVERSITY_TARGETS.nearBoundary10to11}`,
    `- score8-9: ${summary.deeper8to9}/${THRESHOLD_DIVERSITY_TARGETS.deeper8to9}`,
    `- distinct categories: ${summary.distinctCategories}/${THRESHOLD_DIVERSITY_TARGETS.distinctCategories} (${summary.categories.join(", ") || "-"})`,
    `- JP controls: ${summary.jpControls}/${THRESHOLD_DIVERSITY_TARGETS.jpControls}`,
    `- US controls: ${summary.usControls}/${THRESHOLD_DIVERSITY_TARGETS.usControls}`,
    `- usable shadow 3m: ${summary.usable3mBelow12}/${THRESHOLD_DIVERSITY_TARGETS.usable3mBelow12}`,
    "",
    "> 低score controlの単純件数だけではthreshold=12を変更しない。score帯・カテゴリ・JP/US市場の分散も必須。",
    "",
    "## blockers",
    "",
    ...(summary.blockers.length ? summary.blockers.map(value => `- ${value}`) : ["- none"]),
    "",
    "## explicit shadow PASS controls",
    "",
    ...(controls.length
      ? controls.map(row => `- ${row.market} ${row.ticker ?? "-"} ${row.company}: score=${row.score}, ${row.category}, replayReady=${row.replayReady}, usable3m=${row.usable3m}`)
      : ["- none"]),
    "",
    "## below12 review queue",
    "",
    ...(queue.length
      ? queue.slice(0, 40).map(row => `- ${row.market} ${row.ticker ?? "-"} ${row.company}: score=${row.score}, ${row.category}`)
      : ["- none"]),
  ];
  writeFileSync("reports/idiosyncratic_shock_threshold_diversity_latest.md", lines.join("\n"), "utf-8");

  console.log(`shock threshold diversity: ready=${summary.ready} below12=${summary.totalReplayReadyBelow12} near=${summary.nearBoundary10to11} deep=${summary.deeper8to9} categories=${summary.distinctCategories} JP=${summary.jpControls} US=${summary.usControls} usable3m=${summary.usable3mBelow12}`);
}

main();
