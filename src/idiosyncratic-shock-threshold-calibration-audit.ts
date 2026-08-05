// score thresholdそのものを検証するためのselection-bias監査。
// production threshold=12は変更せず、score<12のshadow controlを十分集めるまでthreshold変更を禁止する。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
  resolveHistoricalThresholdCalibrationEligibilityDetailed,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { inferShockMarket } from "./idiosyncratic-shock-market.js";
import { isHistoricalReactionAnchorReplayReady } from "./idiosyncratic-shock-reaction-anchor.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";
const BELOW_THRESHOLD_STRUCTURAL_TARGET = 8;
const BELOW_THRESHOLD_USABLE_3M_TARGET = 8;

function loadOutcomes(): ShockHistoricalOutcomeRecord[] {
  if (!existsSync(OUTCOME_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(OUTCOME_PATH, "utf-8")) as { records?: ShockHistoricalOutcomeRecord[] };
    return Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    return [];
  }
}

function isSupportedQuantitativeCase(country: string, ticker?: string | null): boolean {
  if (!ticker) return false;
  const market = inferShockMarket({ country, ticker });
  return market === "JP" || market === "US";
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const outcomes = loadOutcomes();
  const outcomeById = new Map(outcomes.map(row => [row.caseId, row]));
  const issues: string[] = [];
  const warnings: string[] = [];

  const rows = cases.map(item => {
    const context = contexts.get(item.id);
    const production = resolveHistoricalStrategyEligibility(item, context);
    const calibration = resolveHistoricalThresholdCalibrationEligibilityDetailed(item, context);
    const replayReady = isHistoricalReactionAnchorReplayReady(context);
    const supported = isSupportedQuantitativeCase(item.country, item.ticker);
    const outcome = outcomeById.get(item.id);
    const usable3m = calibration.status === "confirmed_pass"
      && replayReady
      && outcome?.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass"
      && outcome.reactionAnchorStatus === "verified"
      && Boolean(outcome.calibrationFirstEligibleSignalDate)
      && typeof outcome.calibrationSignalBenchmarkRelative3m === "number"
      && Number.isFinite(outcome.calibrationSignalBenchmarkRelative3m);

    if (item.score < 12 && calibration.status === "confirmed_pass" && production !== "confirmed_block") {
      issues.push(`${item.id}: score<12 shadow PASS must remain production BLOCK`);
    }
    if (item.score < 12 && context?.calibrationEligibilityAtCheckpoint === "confirmed_pass" && !context.calibrationEligibilityNotes?.trim()) {
      issues.push(`${item.id}: explicit below-threshold calibration PASS requires calibrationEligibilityNotes`);
    }
    if (item.score < 12 && context?.calibrationEligibilityAtCheckpoint === "confirmed_block" && !context.calibrationEligibilityNotes?.trim()) {
      issues.push(`${item.id}: explicit below-threshold calibration BLOCK requires calibrationEligibilityNotes`);
    }
    if (production === "confirmed_pass" && calibration.status !== "confirmed_pass") {
      issues.push(`${item.id}: production PASS must remain calibration PASS; got ${calibration.status}`);
    }

    return {
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      score: item.score,
      category: item.category,
      checkpoint: item.decisionCheckpoint,
      productionEligibility: production,
      calibrationEligibility: calibration.status,
      calibrationBlockers: calibration.blockers,
      calibrationMissingEvidence: calibration.missingEvidence,
      replayReady,
      supported,
      usable3m,
      explicitCalibrationAnnotation: context?.calibrationEligibilityAtCheckpoint ?? null,
    };
  });

  const below = rows.filter(row => row.score < 12);
  const belowPass = below.filter(row => row.calibrationEligibility === "confirmed_pass");
  const belowBlock = below.filter(row => row.calibrationEligibility === "confirmed_block");
  const belowUnknown = below.filter(row => row.calibrationEligibility === "unknown");
  const belowReplayReady = belowPass.filter(row => row.replayReady && row.supported);
  const belowUsable3m = below.filter(row => row.usable3m);
  const aboveReplayReady = rows.filter(row => row.score >= 12 && row.calibrationEligibility === "confirmed_pass" && row.replayReady && row.supported);

  if (belowReplayReady.length < BELOW_THRESHOLD_STRUCTURAL_TARGET) {
    warnings.push(`below-threshold replay-ready controls ${belowReplayReady.length}/${BELOW_THRESHOLD_STRUCTURAL_TARGET}; threshold=12変更禁止`);
  }
  if (belowUsable3m.length < BELOW_THRESHOLD_USABLE_3M_TARGET) {
    warnings.push(`below-threshold usable shadow 3m outcomes ${belowUsable3m.length}/${BELOW_THRESHOLD_USABLE_3M_TARGET}; threshold performance comparison not ready`);
  }
  if (belowUnknown.length > 0) {
    warnings.push(`below-threshold calibration eligibility unknown=${belowUnknown.length}; prioritize score 8-11 primary-source review`);
  }
  if (outcomes.length === 0) warnings.push("quantitative outcome dataset not generated yet; structural controls only");

  const queue = belowUnknown
    .filter(row => row.supported)
    .sort((a, b) => b.score - a.score || b.checkpoint.localeCompare(a.checkpoint) || a.id.localeCompare(b.id))
    .map(row => ({
      priority: row.score >= 10 ? "P0" : row.score >= 8 ? "P1" : "P2",
      ...row,
    }));

  const thresholdComparisonReady = belowReplayReady.length >= BELOW_THRESHOLD_STRUCTURAL_TARGET
    && belowUsable3m.length >= BELOW_THRESHOLD_USABLE_3M_TARGET
    && aboveReplayReady.length >= BELOW_THRESHOLD_STRUCTURAL_TARGET;

  const summary = {
    generatedAt: date,
    currentProductionThreshold: 12,
    thresholdComparisonReady,
    targets: {
      belowThresholdStructuralControls: BELOW_THRESHOLD_STRUCTURAL_TARGET,
      belowThresholdUsable3mOutcomes: BELOW_THRESHOLD_USABLE_3M_TARGET,
    },
    totalCases: rows.length,
    belowThresholdCases: below.length,
    belowThresholdCalibrationPass: belowPass.length,
    belowThresholdCalibrationBlock: belowBlock.length,
    belowThresholdCalibrationUnknown: belowUnknown.length,
    belowThresholdReplayReadySupported: belowReplayReady.length,
    belowThresholdUsable3m: belowUsable3m.length,
    aboveThresholdReplayReadySupported: aboveReplayReady.length,
    quantitativeOutcomeRecords: outcomes.length,
    belowThresholdControls: belowPass,
    reviewQueue: queue,
    issues,
    warnings,
    ok: issues.length === 0,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_threshold_calibration_audit_latest.json", JSON.stringify(summary, null, 2), "utf-8");
  const lines = [
    "# 企業固有ショック Threshold Calibration Audit",
    "",
    `生成日: ${date}`,
    "",
    `- production threshold: **12（維持）**`,
    `- threshold comparison ready: **${thresholdComparisonReady ? "YES" : "NO"}**`,
    `- below-threshold cases: ${below.length}`,
    `- calibration pass/block/unknown: ${belowPass.length}/${belowBlock.length}/${belowUnknown.length}`,
    `- replay-ready supported controls: ${belowReplayReady.length}/${BELOW_THRESHOLD_STRUCTURAL_TARGET}`,
    `- usable shadow 3m outcomes: ${belowUsable3m.length}/${BELOW_THRESHOLD_USABLE_3M_TARGET}`,
    `- >=12 replay-ready supported controls: ${aboveReplayReady.length}`,
    `- quantitative outcome records: ${outcomes.length}`,
    "",
    "> score<12を本番通知へ入れる機能ではない。12点という境界自体を検証するためのshadow control監査。",
    "> target未達の間はthreshold=12を変更しない。",
    "",
    "## Below-threshold shadow controls",
    "",
    ...(belowPass.length
      ? belowPass.map(row => `- ${row.country} ${row.ticker ?? "-"} ${row.company}: score=${row.score}, replayReady=${row.replayReady}, supported=${row.supported}, usable3m=${row.usable3m}`)
      : ["- none"]),
    "",
    "## Review queue",
    "",
    ...(queue.length
      ? queue.slice(0, 30).map(row => `- **${row.priority}** ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20, ${row.category}): ${[...row.calibrationBlockers, ...row.calibrationMissingEvidence].join(", ") || "calibration review required"}`)
      : ["- none"]),
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map(value => `- ${value}`) : ["- none"]),
    "",
    "## Issues",
    "",
    ...(issues.length ? issues.map(value => `- ${value}`) : ["- none"]),
  ];
  writeFileSync("reports/idiosyncratic_shock_threshold_calibration_audit_latest.md", lines.join("\n"), "utf-8");

  console.log(`shock threshold calibration audit: below=${below.length} pass/block/unknown=${belowPass.length}/${belowBlock.length}/${belowUnknown.length} replayReady=${belowReplayReady.length} usable3m=${belowUsable3m.length} ready=${thresholdComparisonReady} issues=${issues.length} warnings=${warnings.length}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
