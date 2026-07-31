// 企業固有ショックDBの「次に何を集めるべきか」を機械的に出す。
// eligibility / reaction-anchor research queueは価格provider非依存で全historical caseから生成する。
// Local calibrationの正本は、非価格hard gate confirmed_pass + verified reaction anchor後の
// First Eligible Signal後3m benchmark-relative outcome。
// pnpm report:shock-research-gaps

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
  type HistoricalShockCaseContext,
  type HistoricalStrategyEligibilityStatus,
} from "./idiosyncratic-shock-case-context.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import {
  inferShockJurisdictionGroup,
  shockCategoryJurisdictionSensitivity,
  type ShockJurisdictionGroup,
} from "./idiosyncratic-shock-jurisdiction.js";
import type { ShockHistoricalOutcomeRecord } from "./idiosyncratic-shock-outcomes.js";

const OUTCOME_PATH = "data/idiosyncratic_shock_outcomes.json";
const PRIORITY_COUNTRIES = ["JP", "US"] as const;
const RESEARCH_GROUPS: ShockJurisdictionGroup[] = ["UK", "EUROPE", "COMMONWEALTH", "KR", "CN", "HK", "SG", "TW"];
const COUNTRY_RAW_TARGET = 40;
const COUNTRY_USABLE_3M_TARGET = 30;
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

function contextAnchorVerified(context?: HistoricalShockCaseContext | null): boolean {
  return Boolean(context?.announcementTiming && context.announcementTiming !== "unknown");
}

function outcomeAnchorVerified(row: ShockHistoricalOutcomeRecord): boolean {
  // 旧保存JSONにfieldが無い場合もfalse。読み込み側もfail-closed。
  return row.reactionAnchorStatus === "verified";
}

function signalUsable3m(row: ShockHistoricalOutcomeRecord): boolean {
  return row.strategyEligibilityAtCheckpoint === "confirmed_pass"
    && outcomeAnchorVerified(row)
    && Boolean(row.firstEligibleSignalDate)
    && row.signalBenchmarkRelative3m != null
    && Number.isFinite(row.signalBenchmarkRelative3m);
}

function main(): void {
  const date = todayJst();
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const outcomes = loadOutcomes();
  const outcomeById = new Map(outcomes.map(row => [row.caseId, row]));
  const resolved = new Map(cases.map(item => [item.id, resolveHistoricalStrategyEligibility(item, contexts.get(item.id))]));

  const explicitStatus = (id: string): HistoricalStrategyEligibilityStatus => {
    const value = contexts.get(id)?.strategyEligibilityAtCheckpoint;
    return value === "confirmed_pass" || value === "confirmed_block" ? value : "unknown";
  };

  const passCases = cases.filter(item => resolved.get(item.id) === "confirmed_pass");
  const blockCases = cases.filter(item => resolved.get(item.id) === "confirmed_block");
  const unknownCases = cases.filter(item => resolved.get(item.id) === "unknown");
  const derivedBlocks = blockCases.filter(item => explicitStatus(item.id) === "unknown");
  const passAnchorVerifiedCases = passCases.filter(item => contextAnchorVerified(contexts.get(item.id)));
  const passAnchorUnknownCases = passCases.filter(item => !contextAnchorVerified(contexts.get(item.id)));

  const eligibilityResearchQueue = unknownCases
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
      source: item.sources[0]?.url ?? null,
      priority: PRIORITY_COUNTRIES.includes(item.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]) ? "P0" : "P1",
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "P0" ? -1 : 1)
      || b.score - a.score
      || Number(b.confidence === "high") - Number(a.confidence === "high")
      || b.checkpoint.localeCompare(a.checkpoint)
      || a.id.localeCompare(b.id));

  const reactionAnchorResearchQueue = passAnchorUnknownCases
    .map(item => ({
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      category: item.category,
      eventDate: item.eventDate,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      sourceType: item.sources[0]?.sourceType ?? "missing",
      source: item.sources[0]?.url ?? null,
      priority: PRIORITY_COUNTRIES.includes(item.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]) ? "P1" : "P2",
    }))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "P1" ? -1 : 1)
      || b.score - a.score
      || b.checkpoint.localeCompare(a.checkpoint)
      || a.id.localeCompare(b.id));

  const countryStats = PRIORITY_COUNTRIES.map(country => {
    const rows = cases.filter(item => item.country.toUpperCase() === country);
    const quantitative = rows.map(item => outcomeById.get(item.id)).filter((row): row is ShockHistoricalOutcomeRecord => Boolean(row));
    const countryPass = rows.filter(item => resolved.get(item.id) === "confirmed_pass");
    const countryBlock = rows.filter(item => resolved.get(item.id) === "confirmed_block");
    const countryUnknown = rows.filter(item => resolved.get(item.id) === "unknown");
    const countryPassAnchorVerified = countryPass.filter(item => contextAnchorVerified(contexts.get(item.id)));
    const countryPassAnchorUnknown = countryPass.length - countryPassAnchorVerified.length;
    const quantitativePass = quantitative.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
    const quantitativeAnchorVerifiedPass = quantitativePass.filter(outcomeAnchorVerified);
    const quantitativeAnchorUnknownPass = quantitativePass.length - quantitativeAnchorVerifiedPass.length;
    const signals = quantitativeAnchorVerifiedPass.filter(row => Boolean(row.firstEligibleSignalDate));
    const usable3m = quantitative.filter(signalUsable3m).length;
    const trueNoTrade = quantitativeAnchorVerifiedPass.length - signals.length;
    const smallOrNoShock = quantitative.filter(row => row.shockDrawdownPct != null && row.shockDrawdownPct > -5).length;
    const explicitAnnotations = rows.filter(item => explicitStatus(item.id) !== "unknown").length;
    const countryDerivedBlocks = rows.filter(item => resolved.get(item.id) === "confirmed_block" && explicitStatus(item.id) === "unknown").length;
    return {
      country,
      raw: rows.length,
      rawGap: gap(COUNTRY_RAW_TARGET, rows.length),
      quantitative: quantitative.length,
      eligibilityPass: countryPass.length,
      eligibilityBlock: countryBlock.length,
      eligibilityUnknown: countryUnknown.length,
      eligibilityCoverage: pct(countryPass.length + countryBlock.length, rows.length),
      explicitAnnotations,
      derivedBlocks: countryDerivedBlocks,
      anchorVerifiedPass: countryPassAnchorVerified.length,
      anchorUnknownPass: countryPassAnchorUnknown,
      reactionAnchorCoverage: pct(countryPassAnchorVerified.length, countryPass.length),
      quantitativeAnchorUnknownPass,
      signals: signals.length,
      signalRate: pct(signals.length, quantitativeAnchorVerifiedPass.length),
      trueNoTrade,
      trueNoTradeRate: pct(trueNoTrade, quantitativeAnchorVerifiedPass.length),
      usable3m,
      usable3mGap: gap(COUNTRY_USABLE_3M_TARGET, usable3m),
      smallOrNoShockRate: pct(smallOrNoShock, quantitative.length),
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
    const quantitativePassAnchored = quantitative.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass" && outcomeAnchorVerified(row));
    return {
      country,
      category,
      sensitivity: shockCategoryJurisdictionSensitivity(category),
      raw: rows.length,
      rawGap: gap(COUNTRY_CATEGORY_RAW_TARGET, rows.length),
      quantitative: quantitative.length,
      eligibilityPass: rows.filter(item => resolved.get(item.id) === "confirmed_pass").length,
      eligibilityBlock: rows.filter(item => resolved.get(item.id) === "confirmed_block").length,
      eligibilityUnknown: rows.filter(item => resolved.get(item.id) === "unknown").length,
      anchorUnknownPass: rows.filter(item => resolved.get(item.id) === "confirmed_pass" && !contextAnchorVerified(contexts.get(item.id))).length,
      signals: quantitativePassAnchored.filter(row => Boolean(row.firstEligibleSignalDate)).length,
      usable3m: quantitative.filter(signalUsable3m).length,
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
      eligibilityUnknown: rows.filter(item => resolved.get(item.id) === "unknown").length,
      anchorUnknownPass: rows.filter(item => resolved.get(item.id) === "confirmed_pass" && !contextAnchorVerified(contexts.get(item.id))).length,
    };
  });

  const allQuantitativePass = outcomes.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
  const allQuantitativeAnchoredPass = allQuantitativePass.filter(outcomeAnchorVerified);
  const allQuantitativeAnchorUnknownPass = allQuantitativePass.length - allQuantitativeAnchoredPass.length;
  const allSignals = allQuantitativeAnchoredPass.filter(row => Boolean(row.firstEligibleSignalDate));
  const selectionBiasWarnings: string[] = [];
  const smallOrNoShock = outcomes.filter(row => row.shockDrawdownPct != null && row.shockDrawdownPct > -5).length;
  if (outcomes.length >= 10 && pct(smallOrNoShock, outcomes.length) < 10) selectionBiasWarnings.push(`small/no-shock controls only ${smallOrNoShock}/${outcomes.length}; actively collect no-reaction scandals`);
  const failedTotal = cases.filter(item => item.outcome?.recoveryPattern === "failed").length;
  if (cases.length >= 20 && failedTotal === 0) selectionBiasWarnings.push("failed outcomes are zero; survivorship bias likely");
  if (unknownCases.length > 0) selectionBiasWarnings.push(`historical non-price eligibility unknown=${unknownCases.length}; never classify as no-trade or calibration observations`);
  if (passAnchorUnknownCases.length > 0) selectionBiasWarnings.push(`historical confirmed-pass reaction anchor unknown=${passAnchorUnknownCases.length}; never classify as no-trade or calibration observations`);
  if (allQuantitativeAnchorUnknownPass > 0) selectionBiasWarnings.push(`stored quantitative confirmed-pass outcomes with unverified/missing anchor=${allQuantitativeAnchorUnknownPass}; regenerate before calibration`);
  if (allQuantitativeAnchoredPass.length > 0 && allSignals.length === allQuantitativeAnchoredPass.length) selectionBiasWarnings.push("all anchored quantitative confirmed-pass cases generated a signal; collect true no-trade controls");

  const priorities = [
    ...countryStats.flatMap(row => [
      row.eligibilityUnknown > 0 ? { priority: 150 + row.eligibilityUnknown, key: `${row.country}:eligibility-review`, reason: `historical eligibility unknown ${row.eligibilityUnknown}; resolve structured primary evidence first` } : null,
      row.anchorUnknownPass > 0 ? { priority: 140 + row.anchorUnknownPass, key: `${row.country}:reaction-anchor`, reason: `confirmed-pass reaction anchor unknown ${row.anchorUnknownPass}; verify announcement timing before signal backfill` } : null,
      row.usable3mGap > 0 ? { priority: 100 + row.usable3mGap, key: `${row.country}:signal-outcomes`, reason: `usable anchored signal 3m outcomes ${row.usable3m}/${COUNTRY_USABLE_3M_TARGET}` } : null,
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
    targets: { countryRaw: COUNTRY_RAW_TARGET, countryUsable3m: COUNTRY_USABLE_3M_TARGET, countryCategoryRaw: COUNTRY_CATEGORY_RAW_TARGET, researchGroupRaw: RESEARCH_GROUP_RAW_TARGET },
    totalHistoricalCases: cases.length,
    totalQuantitativeOutcomes: outcomes.length,
    totalEligibilityPass: passCases.length,
    totalEligibilityBlock: blockCases.length,
    totalEligibilityUnknown: unknownCases.length,
    totalDerivedEligibilityBlocks: derivedBlocks.length,
    totalAnchorVerifiedPass: passAnchorVerifiedCases.length,
    totalAnchorUnknownPass: passAnchorUnknownCases.length,
    totalStoredQuantitativeAnchorUnknownPass: allQuantitativeAnchorUnknownPass,
    totalEntrySignals: allSignals.length,
    totalNoTrade: allQuantitativeAnchoredPass.length - allSignals.length,
    totalContextSidecars: contexts.size,
    eligibilityResearchQueue,
    reactionAnchorResearchQueue,
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
    "> eligibility / reaction-anchor queueは価格provider非依存。確実な負例は自動BLOCKし、PASSはstructured evidenceを揃えたケースだけ。",
    "> First Eligible Signalはconfirmed-pass + verified reaction anchorだけ。anchor未確認をno-tradeへ混ぜない。",
    "",
    `- historical: ${payload.totalHistoricalCases}`,
    `- quantitative outcomes: ${payload.totalQuantitativeOutcomes}`,
    `- eligibility pass/block/unknown: ${payload.totalEligibilityPass}/${payload.totalEligibilityBlock}/${payload.totalEligibilityUnknown}`,
    `- deterministic blocks: ${payload.totalDerivedEligibilityBlocks}`,
    `- confirmed-pass anchor verified/unknown: ${payload.totalAnchorVerifiedPass}/${payload.totalAnchorUnknownPass}`,
    `- stored quantitative pass with unverified/missing anchor: ${payload.totalStoredQuantitativeAnchorUnknownPass}`,
    `- signals: ${payload.totalEntrySignals}`,
    `- true no-trade: ${payload.totalNoTrade}`,
    "",
    "## Eligibility research queue（価格API不要）",
    "",
  ];
  if (eligibilityResearchQueue.length === 0) lines.push("- unknownなし", "");
  else {
    lines.push("| priority | country | ticker | company | checkpoint | score | category | confidence | source |", "|---|---|---|---|---|---:|---|---|---|");
    for (const row of eligibilityResearchQueue.slice(0, 50)) lines.push(`| ${row.priority} | ${row.country} | ${row.ticker ?? "-"} | ${row.company} | ${row.checkpoint} | ${row.score} | ${row.category} | ${row.confidence} | ${row.sourceType} |`);
    lines.push("");
  }

  lines.push("## Reaction-anchor research queue（価格API不要）", "");
  if (reactionAnchorResearchQueue.length === 0) lines.push("- confirmed-pass anchor unknownなし", "");
  else {
    lines.push("| priority | country | ticker | company | event | checkpoint | score | category | source |", "|---|---|---|---|---|---|---:|---|---|");
    for (const row of reactionAnchorResearchQueue.slice(0, 50)) lines.push(`| ${row.priority} | ${row.country} | ${row.ticker ?? "-"} | ${row.company} | ${row.eventDate} | ${row.checkpoint} | ${row.score} | ${row.category} | ${row.sourceType} |`);
    lines.push("");
  }

  lines.push("## 最優先収集ギャップ", "");
  if (priorities.length === 0) lines.push("- 初期target達成", "");
  else priorities.slice(0, 30).forEach(row => lines.push(`- **${row.key}** — ${row.reason}`));

  lines.push("", "## JP / US", "", "| country | raw | quantitative | pass | block | unknown | coverage | derived block | anchor verified | anchor unknown | anchor coverage | stored anchor unknown | signals | signal rate* | true no-trade* | usable 3m | gap | small/no shock | failed | context |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of countryStats) lines.push(`| ${row.country} | ${row.raw} | ${row.quantitative} | ${row.eligibilityPass} | ${row.eligibilityBlock} | ${row.eligibilityUnknown} | ${row.eligibilityCoverage}% | ${row.derivedBlocks} | ${row.anchorVerifiedPass} | ${row.anchorUnknownPass} | ${row.reactionAnchorCoverage}% | ${row.quantitativeAnchorUnknownPass} | ${row.signals} | ${row.signalRate}% | ${row.trueNoTradeRate}% | ${row.usable3m} | ${row.usable3mGap} | ${row.smallOrNoShockRate}% | ${row.failedRate}% | ${row.contextCoverage}% |`);
  lines.push("", "* signal/no-trade率の分母はquantitative confirmed-pass + verified reaction anchorのみ。", "");

  lines.push("## Culture-sensitive category gaps", "", "| country | category | sensitivity | raw | quantitative | pass | block | unknown | anchor unknown | signals | usable 3m | failed |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of countryCategoryStats.filter(row => row.sensitivity === "high").sort((a, b) => b.rawGap - a.rawGap || a.country.localeCompare(b.country) || a.category.localeCompare(b.category))) {
    lines.push(`| ${row.country} | ${row.category} | ${row.sensitivity} | ${row.raw} | ${row.quantitative} | ${row.eligibilityPass} | ${row.eligibilityBlock} | ${row.eligibilityUnknown} | ${row.anchorUnknownPass} | ${row.signals} | ${row.usable3m} | ${row.failed} |`);
  }

  lines.push("", "## Research-only jurisdiction coverage", "", "| group | raw | gap | countries | high-confidence | failed | unknown | anchor unknown pass |", "|---|---:|---:|---|---:|---:|---:|---:|");
  for (const row of groupStats) lines.push(`| ${row.group} | ${row.raw} | ${row.rawGap} | ${row.countries.join(", ") || "-"} | ${row.highConfidence} | ${row.failed} | ${row.eligibilityUnknown} | ${row.anchorUnknownPass} |`);

  lines.push("", "## Selection-bias warnings", "");
  if (selectionBiasWarnings.length === 0) lines.push("- 重大warningなし");
  else selectionBiasWarnings.forEach(value => lines.push(`- ${value}`));

  lines.push("", "## 収集ルール", "");
  lines.push("- score<12 / accountingIntegrity=0 / macro主因は自動BLOCK。手動PASSで上書きしない。");
  lines.push("- confirmed_passはinvestigation / critical-risk / confounder / sourceをstructured evidenceで再現できる場合だけ。");
  lines.push("- reaction anchorはannouncement timingと市場が最初に通常取引で反応できる日を一次情報/当時報道で再現する。");
  lines.push("- unknown eligibility / unverified anchorをno-trade扱いしない。confirmed-pass + verified anchor後に価格signalが出なかったケースだけtrue no-trade。");
  lines.push("- 古いoutcome JSONにsignalが残っていてもreactionAnchorStatus!=verifiedならcalibrationへ再利用しない。");
  lines.push("- 有名な回復事例だけでなく、小反応・無反応・長期低迷・追加不正・上場廃止も収集する。");

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_research_gaps_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_research_gaps_latest.md", lines.join("\n"), "utf-8");
  console.log(`shock research gaps: historical=${cases.length} quantitative=${outcomes.length} eligibility=${passCases.length}/${blockCases.length}/${unknownCases.length} derivedBlocks=${derivedBlocks.length} anchors=${passAnchorVerifiedCases.length}/${passAnchorUnknownCases.length} signals=${allSignals.length} eligibilityQueue=${eligibilityResearchQueue.length} anchorQueue=${reactionAnchorResearchQueue.length}`);
  for (const row of eligibilityResearchQueue.slice(0, 10)) console.log(`  eligibility ${row.country} ${row.ticker ?? "-"} ${row.company}: score=${row.score} checkpoint=${row.checkpoint} source=${row.sourceType}`);
  for (const row of reactionAnchorResearchQueue.slice(0, 10)) console.log(`  anchor ${row.country} ${row.ticker ?? "-"} ${row.company}: score=${row.score} event=${row.eventDate} checkpoint=${row.checkpoint}`);
}

main();
