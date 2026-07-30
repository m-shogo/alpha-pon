// 企業固有ショックDBの「次に何を集めるべきか」を機械的に出す。
// 成功した有名事件だけを増やすselection biasを避けるため、国/カテゴリ/outcome/無反応/失敗例の不足を可視化する。
// Local calibrationの正本は、非価格hard gate confirmed_pass後のFirst Eligible Signal後3m benchmark-relative outcome。
// eligibility research queueは価格provider非依存で全historical caseから生成する。
// pnpm report:shock-research-gaps

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import type { HistoricalShockCase } from "./idiosyncratic-shock.js";
import {
  loadHistoricalShockCaseContext,
  resolveHistoricalStrategyEligibility,
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

function clampGap(target: number, actual: number): number {
  return Math.max(0, target - actual);
}

function signalUsable3m(row: ShockHistoricalOutcomeRecord): boolean {
  return row.strategyEligibilityAtCheckpoint === "confirmed_pass"
    && Boolean(row.firstEligibleSignalDate)
    && row.signalBenchmarkRelative3m != null
    && Number.isFinite(row.signalBenchmarkRelative3m);
}

function eligibilityStatus(
  item: HistoricalShockCase,
  contexts: ReturnType<typeof loadHistoricalShockCaseContext>,
): HistoricalStrategyEligibilityStatus {
  return resolveHistoricalStrategyEligibility(item, contexts.get(item.id)?.strategyEligibilityAtCheckpoint);
}

function explicitEligibilityStatus(
  item: HistoricalShockCase,
  contexts: ReturnType<typeof loadHistoricalShockCaseContext>,
): HistoricalStrategyEligibilityStatus {
  const value = contexts.get(item.id)?.strategyEligibilityAtCheckpoint;
  return value === "confirmed_pass" || value === "confirmed_block" ? value : "unknown";
}

function buildPayload(date: string) {
  const cases = loadHistoricalShockCases();
  const contexts = loadHistoricalShockCaseContext();
  const outcomes = loadOutcomes();
  const outcomeById = new Map(outcomes.map(row => [row.caseId, row]));

  const resolvedEligibility = new Map(cases.map(item => [item.id, eligibilityStatus(item, contexts)]));
  const allEligibilityPassCases = cases.filter(item => resolvedEligibility.get(item.id) === "confirmed_pass");
  const allEligibilityBlockCases = cases.filter(item => resolvedEligibility.get(item.id) === "confirmed_block");
  const allEligibilityUnknownCases = cases.filter(item => resolvedEligibility.get(item.id) === "unknown");
  const derivedBlockCases = cases.filter(item => (
    resolvedEligibility.get(item.id) === "confirmed_block"
    && explicitEligibilityStatus(item, contexts) === "unknown"
  ));

  const eligibilityResearchQueue = allEligibilityUnknownCases
    .map(item => ({
      id: item.id,
      company: item.company,
      ticker: item.ticker ?? null,
      country: item.country,
      category: item.category,
      checkpoint: item.decisionCheckpoint,
      score: item.score,
      researchConfidence: item.researchConfidence,
      sourceType: item.sources[0]?.sourceType ?? "missing",
      source: item.sources[0]?.url ?? null,
      priorityMarket: PRIORITY_COUNTRIES.includes(item.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]),
      reason: "non-price eligibility requires primary/regulatory evidence for checkpoint-time pass/block",
    }))
    .sort((a, b) => Number(b.priorityMarket) - Number(a.priorityMarket)
      || b.score - a.score
      || Number(b.researchConfidence === "high") - Number(a.researchConfidence === "high")
      || b.checkpoint.localeCompare(a.checkpoint)
      || a.id.localeCompare(b.id));

  const countryStats = PRIORITY_COUNTRIES.map(country => {
    const rows = cases.filter(row => row.country.toUpperCase() === country);
    const quantitative = rows.map(row => outcomeById.get(row.id)).filter((row): row is ShockHistoricalOutcomeRecord => Boolean(row));
    const eligibilityPassCases = rows.filter(row => resolvedEligibility.get(row.id) === "confirmed_pass");
    const eligibilityBlockCases = rows.filter(row => resolvedEligibility.get(row.id) === "confirmed_block");
    const eligibilityUnknownCases = rows.filter(row => resolvedEligibility.get(row.id) === "unknown");
    const quantitativeEligiblePass = quantitative.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
    const signaled = quantitativeEligiblePass.filter(row => Boolean(row.firstEligibleSignalDate));
    const usable3m = quantitative.filter(signalUsable3m).length;
    const noTrade = quantitativeEligiblePass.length - signaled.length;
    const smallOrNoShock = quantitative.filter(row => row.shockDrawdownPct != null && row.shockDrawdownPct > -5).length;
    const failed = rows.filter(row => row.outcome?.recoveryPattern === "failed").length;
    const highConfidence = rows.filter(row => row.researchConfidence === "high").length;
    const contextCount = rows.filter(row => contexts.has(row.id)).length;
    const reactionAnchorCount = rows.filter(row => Boolean(contexts.get(row.id)?.priceReactionStartDate)).length;
    const eligibilityAnnotatedCount = rows.filter(row => explicitEligibilityStatus(row, contexts) !== "unknown").length;
    const derivedBlocks = rows.filter(row => (
      resolvedEligibility.get(row.id) === "confirmed_block"
      && explicitEligibilityStatus(row, contexts) === "unknown"
    )).length;
    return {
      country,
      rawCases: rows.length,
      rawGap: clampGap(COUNTRY_RAW_TARGET, rows.length),
      quantitativeCases: quantitative.length,
      eligibilityPass: eligibilityPassCases.length,
      eligibilityBlock: eligibilityBlockCases.length,
      eligibilityUnknown: eligibilityUnknownCases.length,
      eligibilityCoverage: pct(eligibilityPassCases.length + eligibilityBlockCases.length, rows.length),
      explicitEligibilityAnnotations: eligibilityAnnotatedCount,
      derivedBlocks,
      signaledCases: signaled.length,
      signalRateAmongQuantitativeEligible: pct(signaled.length, quantitativeEligiblePass.length),
      noTrade,
      noTradeRateAmongQuantitativeEligible: pct(noTrade, quantitativeEligiblePass.length),
      usable3m,
      usable3mGap: clampGap(COUNTRY_USABLE_3M_TARGET, usable3m),
      smallOrNoShock,
      smallOrNoShockRate: pct(smallOrNoShock, quantitative.length),
      failed,
      failedRate: pct(failed, rows.length),
      highConfidence,
      highConfidenceRate: pct(highConfidence, rows.length),
      contextCount,
      contextCoverage: pct(contextCount, rows.length),
      reactionAnchorCount,
      reactionAnchorCoverage: pct(reactionAnchorCount, rows.length),
      eligibilityAnnotationCoverage: pct(eligibilityAnnotatedCount, rows.length),
    };
  });

  const categoryKeys = [...new Set(cases
    .filter(row => PRIORITY_COUNTRIES.includes(row.country.toUpperCase() as (typeof PRIORITY_COUNTRIES)[number]))
    .map(row => row.category))]
    .sort();
  const countryCategoryStats = PRIORITY_COUNTRIES.flatMap(country => categoryKeys.map(category => {
    const rows = cases.filter(row => row.country.toUpperCase() === country && row.category === category);
    const quantitative = rows.map(row => outcomeById.get(row.id)).filter((row): row is ShockHistoricalOutcomeRecord => Boolean(row));
    const eligibilityPass = rows.filter(row => resolvedEligibility.get(row.id) === "confirmed_pass").length;
    const eligibilityBlock = rows.filter(row => resolvedEligibility.get(row.id) === "confirmed_block").length;
    const eligibilityUnknown = rows.filter(row => resolvedEligibility.get(row.id) === "unknown").length;
    const signaled = quantitative.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass" && Boolean(row.firstEligibleSignalDate)).length;
    const usable3m = quantitative.filter(signalUsable3m).length;
    return {
      country,
      category,
      sensitivity: shockCategoryJurisdictionSensitivity(category),
      rawCases: rows.length,
      rawGap: clampGap(COUNTRY_CATEGORY_RAW_TARGET, rows.length),
      quantitativeCases: quantitative.length,
      eligibilityPass,
      eligibilityBlock,
      eligibilityUnknown,
      signaled,
      usable3m,
      failed: rows.filter(row => row.outcome?.recoveryPattern === "failed").length,
    };
  })).filter(row => row.rawCases > 0 || row.sensitivity === "high");

  const groupStats = RESEARCH_GROUPS.map(group => {
    const rows = cases.filter(row => inferShockJurisdictionGroup({ country: row.country }) === group);
    return {
      group,
      rawCases: rows.length,
      rawGap: clampGap(RESEARCH_GROUP_RAW_TARGET, rows.length),
      countries: [...new Set(rows.map(row => row.country))].sort(),
      highConfidence: rows.filter(row => row.researchConfidence === "high").length,
      failed: rows.filter(row => row.outcome?.recoveryPattern === "failed").length,
      eligibilityUnknown: rows.filter(row => resolvedEligibility.get(row.id) === "unknown").length,
    };
  });

  const allQuantitative = [...outcomeById.values()];
  const allQuantitativeEligibilityPass = allQuantitative.filter(row => row.strategyEligibilityAtCheckpoint === "confirmed_pass");
  const allSignals = allQuantitativeEligibilityPass.filter(row => Boolean(row.firstEligibleSignalDate));
  const allTrueNoTrade = allQuantitativeEligibilityPass.length - allSignals.length;
  const allSmallOrNoShock = allQuantitative.filter(row => row.shockDrawdownPct != null && row.shockDrawdownPct > -5).length;
  const selectionBiasWarnings: string[] = [];
  if (allQuantitative.length >= 10 && pct(allSmallOrNoShock, allQuantitative.length) < 10) {
    selectionBiasWarnings.push(`quantitative cases=${allQuantitative.length} but small/no-shock controls=${allSmallOrNoShock} (${pct(allSmallOrNoShock, allQuantitative.length)}%); actively collect scandals with little price reaction`);
  }
  const failedTotal = cases.filter(row => row.outcome?.recoveryPattern === "failed").length;
  if (cases.length >= 20 && failedTotal === 0) selectionBiasWarnings.push("failed outcomes are zero; dataset is likely survivorship/confirmation biased");
  const unknownOutcome = cases.filter(row => !row.outcome || row.outcome.recoveryPattern === "unknown").length;
  if (unknownOutcome > 0) selectionBiasWarnings.push(`historical cases with unknown outcome=${unknownOutcome}; resolve outcome before local calibration`);
  if (allEligibilityUnknownCases.length > 0) selectionBiasWarnings.push(`historical non-price eligibility unknown=${allEligibilityUnknownCases.length}; do not classify these as no-trade or calibration observations`);
  if (allQuantitativeEligibilityPass.length > 0 && allSignals.length === allQuantitativeEligibilityPass.length) {
    selectionBiasWarnings.push("all confirmed-pass quantitative cases generated an entry signal; verify true no-trade controls are not being omitted");
  }

  const priorities = [
    ...countryStats.flatMap(row => [
      row.eligibilityUnknown > 0 ? { priority: 150 + row.eligibilityUnknown, key: `${row.country}:eligibility-review`, reason: `historical non-price eligibility unknown ${row.eligibilityUnknown}; provider-independent primary evidence review is the first priority` } : null,
      row.usable3mGap > 0 ? { priority: 100 + row.usable3mGap, key: `${row.country}:signal-outcomes`, reason: `usable confirmed-pass signal-based 3m benchmark-relative outcomes ${row.usable3m}/${COUNTRY_USABLE_3M_TARGET}` } : null,
      row.rawGap > 0 ? { priority: 80 + row.rawGap, key: `${row.country}:raw`, reason: `raw historical cases ${row.rawCases}/${COUNTRY_RAW_TARGET}` } : null,
      row.quantitativeCases >= 10 && row.smallOrNoShockRate < 10 ? { priority: 95, key: `${row.country}:controls`, reason: `small/no-shock controls only ${row.smallOrNoShockRate}%` } : null,
    ]),
    ...countryCategoryStats
      .filter(row => row.sensitivity === "high" && row.rawGap > 0)
      .map(row => ({ priority: 70 + row.rawGap, key: `${row.country}:${row.category}`, reason: `culture-sensitive same-country raw cases ${row.rawCases}/${COUNTRY_CATEGORY_RAW_TARGET}` })),
    ...groupStats
      .filter(row => row.rawGap > 0)
      .map(row => ({ priority: 40 + row.rawGap, key: `${row.group}:research`, reason: `research-only jurisdiction raw cases ${row.rawCases}/${RESEARCH_GROUP_RAW_TARGET}` })),
  ].filter((row): row is { priority: number; key: string; reason: string } => Boolean(row))
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

  return {
    generatedAt: date,
    targets: {
      countryRaw: COUNTRY_RAW_TARGET,
      countryUsable3m: COUNTRY_USABLE_3M_TARGET,
      countryCategoryRaw: COUNTRY_CATEGORY_RAW_TARGET,
      researchGroupRaw: RESEARCH_GROUP_RAW_TARGET,
    },
    totalHistoricalCases: cases.length,
    totalQuantitativeOutcomes: outcomes.length,
    totalEligibilityPass: allEligibilityPassCases.length,
    totalEligibilityBlock: allEligibilityBlockCases.length,
    totalEligibilityUnknown: allEligibilityUnknownCases.length,
    totalDerivedEligibilityBlocks: derivedBlockCases.length,
    totalEntrySignals: allSignals.length,
    totalNoTrade: allTrueNoTrade,
    totalContextSidecars: contexts.size,
    eligibilityResearchQueue,
    countryStats,
    countryCategoryStats,
    groupStats,
    selectionBiasWarnings,
    priorities,
  };
}

function render(payload: ReturnType<typeof buildPayload>): string {
  const lines = [
    "# 企業固有ショック Research Gap Report",
    "",
    `生成日: ${payload.generatedAt}`,
    "",
    "> ケース数を増やすこと自体が目的ではありません。国別キャリブレーションに必要なnon-price hard-gate証拠、signal outcome、失敗例、小反応/無反応例を意図的に埋めます。",
    "> eligibility queueは価格provider非依存です。score/accounting/macroで確実に落ちるケースは自動BLOCKし、PASSだけ一次情報で明示確認します。",
    "",
    `- historical: ${payload.totalHistoricalCases}`,
    `- quantitative outcomes: ${payload.totalQuantitativeOutcomes}`,
    `- non-price eligibility pass/block/unknown: ${payload.totalEligibilityPass}/${payload.totalEligibilityBlock}/${payload.totalEligibilityUnknown}`,
    `- deterministic checkpoint blocks: ${payload.totalDerivedEligibilityBlocks}`,
    `- first eligible signals: ${payload.totalEntrySignals}`,
    `- true no-trade after confirmed pass: ${payload.totalNoTrade}`,
    `- context sidecars: ${payload.totalContextSidecars}`,
    "",
    "## 最優先収集ギャップ",
    "",
  ];
  if (payload.priorities.length === 0) lines.push("- 初期target達成", "");
  for (const row of payload.priorities.slice(0, 30)) lines.push(`- **${row.key}** — ${row.reason}`);

  lines.push("", "## Eligibility research queue（価格API不要）", "");
  if (payload.eligibilityResearchQueue.length === 0) {
    lines.push("- unknownなし", "");
  } else {
    lines.push("| priority | country | ticker | company | checkpoint | score | category | confidence | current source |", "|---|---|---|---|---|---:|---|---|---|");
    for (const row of payload.eligibilityResearchQueue.slice(0, 50)) {
      lines.push(`| ${row.priorityMarket ? "P0" : "P1"} | ${row.country} | ${row.ticker ?? "-"} | ${row.company} | ${row.checkpoint} | ${row.score} | ${row.category} | ${row.researchConfidence} | ${row.sourceType} |`);
    }
    lines.push("");
  }

  lines.push("", "## JP / US", "", "| country | raw | gap | quantitative | elig pass | elig block | elig unknown | elig coverage | derived block | signals | signal rate* | true no-trade* | usable signal 3m | gap | <=5% shock controls | failed | context | reaction-anchor | explicit eligibility |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of payload.countryStats) {
    lines.push(`| ${row.country} | ${row.rawCases} | ${row.rawGap} | ${row.quantitativeCases} | ${row.eligibilityPass} | ${row.eligibilityBlock} | ${row.eligibilityUnknown} | ${row.eligibilityCoverage}% | ${row.derivedBlocks} | ${row.signaledCases} | ${row.signalRateAmongQuantitativeEligible}% | ${row.noTradeRateAmongQuantitativeEligible}% | ${row.usable3m} | ${row.usable3mGap} | ${row.smallOrNoShockRate}% | ${row.failedRate}% | ${row.contextCoverage}% | ${row.reactionAnchorCoverage}% | ${row.eligibilityAnnotationCoverage}% |`);
  }
  lines.push("", "* signal rate / no-trade rate の分母は quantitative outcome があり、non-price eligibility=confirmed_pass のケースのみ。unknownを混ぜません。", "");

  lines.push("## Culture-sensitive category gaps", "", "| country | category | sensitivity | raw | raw gap | quantitative | elig pass | elig block | elig unknown | signals | usable signal 3m | failed |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of payload.countryCategoryStats.filter(row => row.sensitivity === "high").sort((a, b) => b.rawGap - a.rawGap || a.country.localeCompare(b.country) || a.category.localeCompare(b.category))) {
    lines.push(`| ${row.country} | ${row.category} | ${row.sensitivity} | ${row.rawCases} | ${row.rawGap} | ${row.quantitativeCases} | ${row.eligibilityPass} | ${row.eligibilityBlock} | ${row.eligibilityUnknown} | ${row.signaled} | ${row.usable3m} | ${row.failed} |`);
  }

  lines.push("", "## Research-only jurisdiction coverage", "", "| group | raw | gap | countries | high-confidence | failed | eligibility unknown |", "|---|---:|---:|---|---:|---:|---:|");
  for (const row of payload.groupStats) lines.push(`| ${row.group} | ${row.rawCases} | ${row.rawGap} | ${row.countries.join(", ") || "-"} | ${row.highConfidence} | ${row.failed} | ${row.eligibilityUnknown} |`);

  lines.push("", "## Selection-bias warnings", "");
  if (payload.selectionBiasWarnings.length === 0) lines.push("- 重大warningなし", "");
  else payload.selectionBiasWarnings.forEach(value => lines.push(`- ${value}`));

  lines.push("", "## 収集ルール", "");
  lines.push("- 暴落して有名になった事件だけを追加しない。株価反応が小さい/無い不祥事も同じ基準で保存する。");
  lines.push("- score<12 / accountingIntegrity=0 / macro主因はcheckpoint正本から自動BLOCKする。PASSは自動推測しない。");
  lines.push("- strategyEligibilityAtCheckpointを一次情報でpass/blockまで確定できない高scoreケースはunknownのまま保持する。");
  lines.push("- unknownをno-trade扱いしない。confirmed_pass後に価格signalが出なかったケースだけがtrue no-trade。");
  lines.push("- 戻った例だけでなく、長期低迷・上場廃止・追加不正・買収消滅・売買停止を負例として保存する。");
  lines.push("- raw case数よりusable confirmed-pass signal-based outcome数を優先する。Local model昇格はsignal後3m benchmark-relative outcomeが必要。");
  lines.push("- culture-sensitive categoryは同国母数を優先し、accounting/qualityは世界構造データも共有する。");
  lines.push("- priceReactionStartDateは確認できたものだけsidecarへ追加し、推測しない。");
  return lines.join("\n");
}

function main(): void {
  const date = todayJst();
  const payload = buildPayload(date);
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_research_gaps_latest.json", JSON.stringify(payload, null, 2), "utf-8");
  writeFileSync("reports/idiosyncratic_shock_research_gaps_latest.md", render(payload), "utf-8");
  console.log(`shock research gaps: historical=${payload.totalHistoricalCases} quantitative=${payload.totalQuantitativeOutcomes} eligibility=${payload.totalEligibilityPass}/${payload.totalEligibilityBlock}/${payload.totalEligibilityUnknown} derivedBlocks=${payload.totalDerivedEligibilityBlocks} signals=${payload.totalEntrySignals} trueNoTrade=${payload.totalNoTrade} queue=${payload.eligibilityResearchQueue.length} priorities=${payload.priorities.length} warnings=${payload.selectionBiasWarnings.length}`);
  for (const row of payload.eligibilityResearchQueue.slice(0, 10)) console.log(`  eligibility ${row.country} ${row.ticker ?? "-"} ${row.company}: score=${row.score} checkpoint=${row.checkpoint} source=${row.sourceType}`);
  for (const row of payload.priorities.slice(0, 10)) console.log(`  gap ${row.key}: ${row.reason}`);
}

main();
