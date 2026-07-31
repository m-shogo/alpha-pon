// 企業固有ショックDBの「次に何を集めるべきか」を機械的に出す。
// production運用の不足と、threshold=12検証用shadow calibrationの不足を分離する。
// pnpm report:shock-research-gaps

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
  resolveHistoricalThresholdCalibrationEligibility,
  type HistoricalStrategyEligibilityStatus,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import {
  inferShockJurisdictionGroup,
  shockCategoryJurisdictionSensitivity,
  type ShockJurisdictionGroup,
} from "./idiosyncratic-shock-jurisdiction.js";
import { isHistoricalReactionAnchorReplayReady } from "./idiosyncratic-shock-reaction-anchor.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";
const PRIORITY_COUNTRIES = ["JP", "US"] as const;
const RESEARCH_GROUPS: ShockJurisdictionGroup[] = ["UK", "EUROPE", "COMMONWEALTH", "KR", "CN", "HK", "SG", "TW"];
const COUNTRY_RAW_TARGET = 40;
const COUNTRY_CALIBRATION_USABLE_3M_TARGET = 30;
const COUNTRY_CATEGORY_RAW_TARGET = 25;
const RESEARCH_GROUP_RAW_TARGET = 12;

function loadOutcomes(): ShockHistoricalOutcomeRecord[] {
  if (!existsSync(OUTCOME_PATH)) return [];
  try {
    const payload = JSON.parse(readFileSync(OUTCOME_PATH, "utf-8")) as { records?: ShockHistoricalOutcomeRecord[] };
    return Array.isArray(payload.records) ? payload.records : [];
  } catch {
    return [];
  }
}

function pct(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

function gap(target: number, actual: number): number {
  return Math.max(0, target - actual);
}

function productionSignalUsable3m(row: ShockHistoricalOutcomeRecord): boolean {
  return row.strategyEligibilityAtCheckpoint === "confirmed_pass"
    && row.reactionAnchorStatus === "verified"
    && Boolean(row.firstEligibleSignalDate)
    && typeof row.signalBenchmarkRelative3m === "number"
    && Number.isFinite(row.signalBenchmarkRelative3m);
}

function calibrationSignalUsable3m(row: ShockHistoricalOutcomeRecord): boolean {
  return row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass"
    && row.reactionAnchorStatus === "verified"
    && Boolean(row.calibrationFirstEligibleSignalDate)
    && typeof row.calibrationSignalBenchmarkRelative3m === "number"
    && Number.isFinite(row.calibrationSignalBenchmarkRelative3m);
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const outcomes = loadOutcomes();
  const outcomeById = new Map(outcomes.map(row => [row.caseId, row]));
  const productionStatus = new Map(cases.map(item => [item.id, resolveHistoricalStrategyEligibility(item, contexts.get(item.id))]));
  const calibrationStatus = new Map(cases.map(item => [item.id, resolveHistoricalThresholdCalibrationEligibility(item, contexts.get(item.id))]));

  const explicitProduction = (id: string): HistoricalStrategyEligibilityStatus => {
    const value = contexts.get(id)?.strategyEligibilityAtCheckpoint;
    return value === "confirmed_pass" || value === "confirmed_block" ? value : "unknown";
  };
  const explicitCalibration = (id: string): HistoricalStrategyEligibilityStatus => {
    const value = contexts.get(id)?.calibrationEligibilityAtCheckpoint;
    return value === "confirmed_pass" || value === "confirmed_block" ? value : "unknown";
  };

  const productionPassCases = cases.filter(item => productionStatus.get(item.id) === "confirmed_pass");
  const productionBlockCases = cases.filter(item => productionStatus.get(item.id) === "confirmed_block");
  const productionUnknownCases = cases.filter(item => productionStatus.get(item.id) === "unknown");
  const calibrationPassCases = cases.filter(item => calibrationStatus.get(item.id) === "confirmed_pass");
  const calibrationBlockCases = cases.filter(item => calibrationStatus.get(item.id) === "confirmed_block");
  const calibrationUnknownCases = cases.filter(item => calibrationStatus.get(item.id) === "unknown");
  const derivedProductionBlocks = productionBlockCases.filter(item => explicitProduction(item.id) === "unknown");

  const productionReplayReady = productionPassCases.filter(item => isHistoricalReactionAnchorReplayReady(contexts.get(item.id)));
  const productionAnchorQueueCases = productionPassCases.filter(item => !isHistoricalReactionAnchorReplayReady(contexts.get(item.id)));
  const calibrationReplayReady = calibrationPassCases.filter(item => isHistoricalReactionAnchorReplayReady(contexts.get(item.id)));
  const calibrationAnchorQueueCases = calibrationPassCases.filter(item => !isHistoricalReactionAnchorReplayReady(contexts.get(item.id)));

  const productionEligibilityQueue = productionUnknownCases
    .map(item => ({
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      category: item.category,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      confidence: item.researchConfidence,
      sourceType: item.sources[0]?.sourceType ?? "missing",
      priority: PRIORITY_COUNTRIES.includes(item.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]) ? "P0" : "P1",
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "P0" ? -1 : 1)
      || b.score - a.score || b.checkpoint.localeCompare(a.checkpoint) || a.id.localeCompare(b.id));

  const thresholdCalibrationQueue = calibrationUnknownCases
    .filter(item => item.score < 12)
    .map(item => ({
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      category: item.category,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      explicitCalibration: explicitCalibration(item.id),
      priority: item.score >= 10 ? "P0" : item.score >= 8 ? "P1" : "P2",
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "P0" ? -1 : b.priority === "P0" ? 1 : a.priority === "P1" ? -1 : 1)
      || b.score - a.score || b.checkpoint.localeCompare(a.checkpoint) || a.id.localeCompare(b.id));

  const calibrationAnchorQueue = calibrationAnchorQueueCases
    .map(item => ({
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      category: item.category,
      eventDate: item.eventDate,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      priority: PRIORITY_COUNTRIES.includes(item.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]) ? "P1" : "P2",
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "P1" ? -1 : 1)
      || b.score - a.score || b.checkpoint.localeCompare(a.checkpoint) || a.id.localeCompare(b.id));

  const countryStats = PRIORITY_COUNTRIES.map(country => {
    const rows = cases.filter(item => item.country.toUpperCase() === country);
    const quantitative = rows.map(item => outcomeById.get(item.id)).filter((row): row is ShockHistoricalOutcomeRecord => Boolean(row));
    const prodPass = rows.filter(item => productionStatus.get(item.id) === "confirmed_pass");
    const prodBlock = rows.filter(item => productionStatus.get(item.id) === "confirmed_block");
    const prodUnknown = rows.filter(item => productionStatus.get(item.id) === "unknown");
    const calPass = rows.filter(item => calibrationStatus.get(item.id) === "confirmed_pass");
    const calBlock = rows.filter(item => calibrationStatus.get(item.id) === "confirmed_block");
    const calUnknown = rows.filter(item => calibrationStatus.get(item.id) === "unknown");
    const prodAnchored = prodPass.filter(item => isHistoricalReactionAnchorReplayReady(contexts.get(item.id)));
    const calAnchored = calPass.filter(item => isHistoricalReactionAnchorReplayReady(contexts.get(item.id)));
    const quantitativeProdAnchored = quantitative.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified");
    const quantitativeCalAnchored = quantitative.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified");
    const prodSignals = quantitativeProdAnchored.filter(row => Boolean(row.firstEligibleSignalDate));
    const calSignals = quantitativeCalAnchored.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
    const prodUsable3m = quantitative.filter(productionSignalUsable3m).length;
    const calUsable3m = quantitative.filter(calibrationSignalUsable3m).length;
    return {
      country,
      raw: rows.length,
      rawGap: gap(COUNTRY_RAW_TARGET, rows.length),
      quantitative: quantitative.length,
      productionPass: prodPass.length,
      productionBlock: prodBlock.length,
      productionUnknown: prodUnknown.length,
      productionCoverage: pct(prodPass.length + prodBlock.length, rows.length),
      productionReplayReady: prodAnchored.length,
      productionAnchorMissing: prodPass.length - prodAnchored.length,
      productionSignals: prodSignals.length,
      productionSignalRate: pct(prodSignals.length, quantitativeProdAnchored.length),
      productionTrueNoTrade: quantitativeProdAnchored.length - prodSignals.length,
      productionUsable3m: prodUsable3m,
      calibrationPass: calPass.length,
      calibrationBlock: calBlock.length,
      calibrationUnknown: calUnknown.length,
      calibrationCoverage: pct(calPass.length + calBlock.length, rows.length),
      calibrationReplayReady: calAnchored.length,
      calibrationAnchorMissing: calPass.length - calAnchored.length,
      calibrationSignals: calSignals.length,
      calibrationSignalRate: pct(calSignals.length, quantitativeCalAnchored.length),
      calibrationUsable3m: calUsable3m,
      calibrationUsable3mGap: gap(COUNTRY_CALIBRATION_USABLE_3M_TARGET, calUsable3m),
      belowThresholdCalibrationPass: calPass.filter(item => item.score < 12).length,
      belowThresholdReplayReady: calAnchored.filter(item => item.score < 12).length,
      smallOrNoShockRate: pct(quantitative.filter(row => row.shockDrawdownPct != null && row.shockDrawdownPct > -5).length, quantitative.length),
      failedRate: pct(rows.filter(item => item.outcome?.recoveryPattern === "failed").length, rows.length),
      contextCoverage: pct(rows.filter(item => contexts.has(item.id)).length, rows.length),
    };
  });

  const categories = [...new Set(cases
    .filter(item => PRIORITY_COUNTRIES.includes(item.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]))
    .map(item => item.category))].sort();
  const countryCategoryStats = PRIORITY_COUNTRIES.flatMap(country => categories.map(category => {
    const rows = cases.filter(item => item.country.toUpperCase() === country && item.category === category);
    const quantitative = rows.map(item => outcomeById.get(item.id)).filter((row): row is ShockHistoricalOutcomeRecord => Boolean(row));
    return {
      country,
      category,
      sensitivity: shockCategoryJurisdictionSensitivity(category),
      raw: rows.length,
      rawGap: gap(COUNTRY_CATEGORY_RAW_TARGET, rows.length),
      quantitative: quantitative.length,
      productionUnknown: rows.filter(item => productionStatus.get(item.id) === "unknown").length,
      calibrationUnknown: rows.filter(item => calibrationStatus.get(item.id) === "unknown").length,
      calibrationReplayReady: rows.filter(item => calibrationStatus.get(item.id) === "confirmed_pass" && isHistoricalReactionAnchorReplayReady(contexts.get(item.id))).length,
      calibrationSignals: quantitative.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified" && Boolean(row.calibrationFirstEligibleSignalDate)).length,
      calibrationUsable3m: quantitative.filter(calibrationSignalUsable3m).length,
      failed: rows.filter(item => item.outcome?.recoveryPattern === "failed").length,
    };
  })).filter(row => row.raw > 0 || row.sensitivity === "high");

  const groupStats = RESEARCH_GROUPS.map(group => {
    const rows = cases.filter(item => inferShockJurisdictionGroup({ country: item.country }) === group);
    return {
      group,
      raw: rows.length,
      rawGap: gap(RESEARCH_GROUP_RAW_TARGET, rows.length),
      countries: [...new Set(rows.map(item => item.country))].sort(),
      highConfidence: rows.filter(item => item.researchConfidence === "high").length,
      failed: rows.filter(item => item.outcome?.recoveryPattern === "failed").length,
      productionUnknown: rows.filter(item => productionStatus.get(item.id) === "unknown").length,
      calibrationUnknown: rows.filter(item => calibrationStatus.get(item.id) === "unknown").length,
    };
  });

  const allProductionQuantAnchored = outcomes.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified");
  const allProductionSignals = allProductionQuantAnchored.filter(row => Boolean(row.firstEligibleSignalDate));
  const allCalibrationQuantAnchored = outcomes.filter(row => row.thresholdCalibrationEligibilityAtCheckpoint === "confirmed_pass" && row.reactionAnchorStatus === "verified");
  const allCalibrationSignals = allCalibrationQuantAnchored.filter(row => Boolean(row.calibrationFirstEligibleSignalDate));
  const allCalibrationUsable3m = outcomes.filter(calibrationSignalUsable3m);
  const belowThresholdReplayReady = calibrationReplayReady.filter(item => item.score < 12);
  const belowThresholdUsable3m = allCalibrationUsable3m.filter(row => row.score < 12);

  const selectionBiasWarnings: string[] = [];
  const smallOrNoShock = outcomes.filter(row => row.shockDrawdownPct != null && row.shockDrawdownPct > -5).length;
  if (outcomes.length >= 10 && pct(smallOrNoShock, outcomes.length) < 10) selectionBiasWarnings.push(`small/no-shock controls only ${smallOrNoShock}/${outcomes.length}; actively collect no-reaction scandals`);
  const failedTotal = cases.filter(item => item.outcome?.recoveryPattern === "failed").length;
  if (cases.length >= 20 && failedTotal === 0) selectionBiasWarnings.push("failed outcomes are zero; survivorship bias likely");
  if (productionUnknownCases.length > 0) selectionBiasWarnings.push(`production eligibility unknown=${productionUnknownCases.length}; never classify as no-trade`);
  if (calibrationUnknownCases.length > 0) selectionBiasWarnings.push(`threshold calibration eligibility unknown=${calibrationUnknownCases.length}; do not infer from production score`);
  if (calibrationAnchorQueueCases.length > 0) selectionBiasWarnings.push(`calibration PASS but reaction anchor not replay-ready=${calibrationAnchorQueueCases.length}`);
  if (outcomes.length === 0) selectionBiasWarnings.push("quantitative outcome dataset not generated yet");
  if (allCalibrationQuantAnchored.length > 0 && allCalibrationSignals.length === allCalibrationQuantAnchored.length) selectionBiasWarnings.push("all quantitative shadow-eligible cases generated a signal; collect no-signal controls");
  if (belowThresholdReplayReady.length < 8) selectionBiasWarnings.push(`below-threshold replay-ready controls=${belowThresholdReplayReady.length}/8; threshold=12変更禁止`);
  if (belowThresholdUsable3m.length < 8) selectionBiasWarnings.push(`below-threshold usable shadow 3m=${belowThresholdUsable3m.length}/8; threshold comparison not ready`);

  const priorities = [
    ...countryStats.flatMap(row => [
      row.productionUnknown > 0 ? { priority: 160 + row.productionUnknown, key: `${row.country}:production-eligibility`, reason: `production eligibility unknown ${row.productionUnknown}` } : null,
      row.calibrationUnknown > 0 ? { priority: 155 + row.calibrationUnknown, key: `${row.country}:threshold-controls`, reason: `threshold calibration unknown ${row.calibrationUnknown}; prioritize score 8-11 controls` } : null,
      row.calibrationAnchorMissing > 0 ? { priority: 145 + row.calibrationAnchorMissing, key: `${row.country}:calibration-anchor`, reason: `calibration PASS anchor missing ${row.calibrationAnchorMissing}` } : null,
      row.calibrationUsable3mGap > 0 ? { priority: 110 + row.calibrationUsable3mGap, key: `${row.country}:calibration-outcomes`, reason: `usable shadow 3m ${row.calibrationUsable3m}/${COUNTRY_CALIBRATION_USABLE_3M_TARGET}` } : null,
      row.rawGap > 0 ? { priority: 80 + row.rawGap, key: `${row.country}:raw`, reason: `raw cases ${row.raw}/${COUNTRY_RAW_TARGET}` } : null,
      row.quantitative >= 10 && row.smallOrNoShockRate < 10 ? { priority: 95, key: `${row.country}:controls`, reason: `small/no-shock controls ${row.smallOrNoShockRate}%` } : null,
    ]),
    ...countryCategoryStats.filter(row => row.sensitivity === "high" && row.rawGap > 0)
      .map(row => ({ priority: 70 + row.rawGap, key: `${row.country}:${row.category}`, reason: `culture-sensitive raw cases ${row.raw}/${COUNTRY_CATEGORY_RAW_TARGET}` })),
    ...groupStats.filter(row => row.rawGap > 0)
      .map(row => ({ priority: 40 + row.rawGap, key: `${row.group}:research`, reason: `research-only raw cases ${row.raw}/${RESEARCH_GROUP_RAW_TARGET}` })),
  ].filter((row): row is { priority: number; key: string; reason: string } => Boolean(row))
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  const payload = {
    generatedAt: date,
    targets: {
      countryRaw: COUNTRY_RAW_TARGET,
      countryCalibrationUsable3m: COUNTRY_CALIBRATION_USABLE_3M_TARGET,
      countryCategoryRaw: COUNTRY_CATEGORY_RAW_TARGET,
      researchGroupRaw: RESEARCH_GROUP_RAW_TARGET,
      belowThresholdReplayReady: 8,
      belowThresholdUsable3m: 8,
    },
    totalHistoricalCases: cases.length,
    totalQuantitativeOutcomes: outcomes.length,
    production: {
      pass: productionPassCases.length,
      block: productionBlockCases.length,
      unknown: productionUnknownCases.length,
      derivedBlocks: derivedProductionBlocks.length,
      replayReady: productionReplayReady.length,
      anchorMissing: productionAnchorQueueCases.length,
      signals: allProductionSignals.length,
      trueNoTrade: allProductionQuantAnchored.length - allProductionSignals.length,
      usable3m: outcomes.filter(productionSignalUsable3m).length,
    },
    thresholdCalibration: {
      pass: calibrationPassCases.length,
      block: calibrationBlockCases.length,
      unknown: calibrationUnknownCases.length,
      replayReady: calibrationReplayReady.length,
      anchorMissing: calibrationAnchorQueueCases.length,
      signals: allCalibrationSignals.length,
      noSignal: allCalibrationQuantAnchored.length - allCalibrationSignals.length,
      usable3m: allCalibrationUsable3m.length,
      belowThresholdReplayReady: belowThresholdReplayReady.length,
      belowThresholdUsable3m: belowThresholdUsable3m.length,
    },
    totalContextSidecars: contexts.size,
    productionEligibilityQueue,
    thresholdCalibrationQueue,
    calibrationAnchorQueue,
    countryStats,
    countryCategoryStats,
    groupStats,
    selectionBiasWarnings,
    priorities,
  };

  const lines = [
    "# 企業固有ショック Research Gap Report",
    "",
    `生成日: ${date}`,
    "",
    "> production運用とthreshold=12検証用shadow researchを分離。score<12は本番BLOCKのまま、明示shadow reviewだけ比較群へ入れる。",
    "",
    `- historical: ${cases.length}`,
    `- quantitative outcomes: ${outcomes.length}`,
    `- production pass/block/unknown: ${payload.production.pass}/${payload.production.block}/${payload.production.unknown}`,
    `- production replay-ready/anchor-missing: ${payload.production.replayReady}/${payload.production.anchorMissing}`,
    `- production signals/true-no-trade/usable3m: ${payload.production.signals}/${payload.production.trueNoTrade}/${payload.production.usable3m}`,
    `- calibration pass/block/unknown: ${payload.thresholdCalibration.pass}/${payload.thresholdCalibration.block}/${payload.thresholdCalibration.unknown}`,
    `- calibration replay-ready/anchor-missing: ${payload.thresholdCalibration.replayReady}/${payload.thresholdCalibration.anchorMissing}`,
    `- calibration signals/no-signal/usable3m: ${payload.thresholdCalibration.signals}/${payload.thresholdCalibration.noSignal}/${payload.thresholdCalibration.usable3m}`,
    `- below-threshold replay-ready/usable3m: ${payload.thresholdCalibration.belowThresholdReplayReady}/${payload.thresholdCalibration.belowThresholdUsable3m}`,
    "",
    "## Production eligibility queue",
    "",
  ];
  if (productionEligibilityQueue.length === 0) lines.push("- none", "");
  else productionEligibilityQueue.slice(0, 50).forEach(row => lines.push(`- **${row.priority}** ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20, ${row.category})`));

  lines.push("", "## Threshold-calibration control queue", "");
  if (thresholdCalibrationQueue.length === 0) lines.push("- none");
  else thresholdCalibrationQueue.slice(0, 50).forEach(row => lines.push(`- **${row.priority}** ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20, ${row.category})`));

  lines.push("", "## Calibration reaction-anchor queue", "");
  if (calibrationAnchorQueue.length === 0) lines.push("- none");
  else calibrationAnchorQueue.slice(0, 50).forEach(row => lines.push(`- **${row.priority}** ${row.country} ${row.ticker ?? "-"} ${row.company} (${row.score}/20, event ${row.eventDate})`));

  lines.push("", "## 最優先収集ギャップ", "");
  if (priorities.length === 0) lines.push("- 初期target達成");
  else priorities.slice(0, 30).forEach(row => lines.push(`- **${row.key}** — ${row.reason}`));

  lines.push("", "## JP / US", "", "| country | raw | quant | prod P/B/U | prod ready | prod signals | prod signal rate | prod no-trade | cal P/B/U | cal ready | cal signals | cal signal rate | cal usable3m | gap | <12 cal pass | <12 ready | small/no shock | failed | context |", "|---|---:|---:|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of countryStats) {
    lines.push(`| ${row.country} | ${row.raw} | ${row.quantitative} | ${row.productionPass}/${row.productionBlock}/${row.productionUnknown} | ${row.productionReplayReady} | ${row.productionSignals} | ${row.productionSignalRate}% | ${row.productionTrueNoTrade} | ${row.calibrationPass}/${row.calibrationBlock}/${row.calibrationUnknown} | ${row.calibrationReplayReady} | ${row.calibrationSignals} | ${row.calibrationSignalRate}% | ${row.calibrationUsable3m} | ${row.calibrationUsable3mGap} | ${row.belowThresholdCalibrationPass} | ${row.belowThresholdReplayReady} | ${row.smallOrNoShockRate}% | ${row.failedRate}% | ${row.contextCoverage}% |`);
  }

  lines.push("", "## Culture-sensitive category gaps", "", "| country | category | sensitivity | raw | quantitative | prod unknown | cal unknown | cal ready | cal signals | cal usable3m | failed |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of countryCategoryStats.filter(row => row.sensitivity === "high").sort((a, b) => b.rawGap - a.rawGap || a.country.localeCompare(b.country) || a.category.localeCompare(b.category))) {
    lines.push(`| ${row.country} | ${row.category} | ${row.sensitivity} | ${row.raw} | ${row.quantitative} | ${row.productionUnknown} | ${row.calibrationUnknown} | ${row.calibrationReplayReady} | ${row.calibrationSignals} | ${row.calibrationUsable3m} | ${row.failed} |`);
  }

  lines.push("", "## Research-only jurisdiction coverage", "", "| group | raw | gap | countries | high-confidence | failed | prod unknown | cal unknown |", "|---|---:|---:|---|---:|---:|---:|---:|");
  for (const row of groupStats) lines.push(`| ${row.group} | ${row.raw} | ${row.rawGap} | ${row.countries.join(", ") || "-"} | ${row.highConfidence} | ${row.failed} | ${row.productionUnknown} | ${row.calibrationUnknown} |`);

  lines.push("", "## Selection-bias warnings", "");
  if (selectionBiasWarnings.length === 0) lines.push("- 重大warningなし");
  else selectionBiasWarnings.forEach(value => lines.push(`- ${value}`));

  lines.push("", "## 収集ルール", "");
  lines.push("- productionはscore<12をBLOCKのまま維持する。");
  lines.push("- threshold calibrationだけscore gateを外し、他hard gateを共有する。低scoreを自動PASSにしない。");
  lines.push("- reaction anchorはtiming/date/evidence URL/provenance noteが揃ったreplay-readyだけ使う。");
  lines.push("- production no-tradeとcalibration no-signalを0%リターンに変換しない。signal率は別指標で保持する。");
  lines.push("- threshold変更は低得点controlと3m outcome targetを満たすまで禁止する。");
  lines.push("- 有名な回復事例だけでなく、小反応・無反応・長期低迷・追加不正・上場廃止も収集する。");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_research_gaps_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_research_gaps_latest.md", lines.join("\n"), "utf-8");
  console.log(`shock research gaps: historical=${cases.length} quantitative=${outcomes.length} production=${productionPassCases.length}/${productionBlockCases.length}/${productionUnknownCases.length} calibration=${calibrationPassCases.length}/${calibrationBlockCases.length}/${calibrationUnknownCases.length} prodSignals=${allProductionSignals.length} calSignals=${allCalibrationSignals.length} below12Ready=${belowThresholdReplayReady.length}`);
}

main();
