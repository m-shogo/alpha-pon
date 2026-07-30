// 過去事例DBの品質監査。ネット不要・決定的に動く。
// pnpm audit:shock-history

import { mkdirSync, writeFileSync } from "fs";
import { todayJst } from "./date.js";
import { loadHistoricalShockCases } from "./idiosyncratic-shock-data.js";
import { loadHistoricalShockCaseContext } from "./idiosyncratic-shock-case-context.js";
import { shockCategoryJurisdictionSensitivity } from "./idiosyncratic-shock-jurisdiction.js";

const MIN_HISTORICAL_CASES = 59;
const KNOWN_THIRD_PARTY_HOSTS = new Set([
  "minkabu.jp",
  "disclosure.catr.jp",
  "finance.yahoo.co.jp",
  "investing.com",
]);

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "invalid"; }
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function main(): void {
  const date = todayJst();
  const currentYear = Number(date.slice(0, 4));
  const cases = loadHistoricalShockCases();
  const historicalContext = loadHistoricalShockCaseContext();
  const issues: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const categories = new Map<string, number>();
  const countries = new Map<string, number>();
  const eras = new Map<string, number>();
  const companies = new Map<string, number>();
  const categoryCountry = new Map<string, number>();
  const outcomes = new Map<string, number>();
  const contextByCategory = new Map<string, number>();
  const confidence = { high: 0, medium: 0, low: 0 };
  const sourceHosts = new Map<string, number>();

  if (cases.length < MIN_HISTORICAL_CASES) {
    issues.push(`historical cases ${cases.length} < minimum ${MIN_HISTORICAL_CASES}`);
  }

  for (const item of cases) {
    if (ids.has(item.id)) issues.push(`duplicate id: ${item.id}`);
    ids.add(item.id);
    increment(categories, item.category);
    increment(countries, item.country);
    increment(companies, item.company);
    increment(categoryCountry, `${item.country}:${item.category}`);
    increment(outcomes, item.outcome?.recoveryPattern ?? "unknown");
    if (historicalContext.has(item.id)) increment(contextByCategory, item.category);

    const year = Number(item.eventDate.slice(0, 4));
    const era = Number.isFinite(year)
      ? year >= currentYear - 2 ? "last_0_2y"
        : year >= currentYear - 5 ? "last_3_5y"
          : year >= currentYear - 10 ? "last_6_10y"
            : "older_10y_plus"
      : "unknown";
    increment(eras, era);

    confidence[item.researchConfidence] += 1;
    for (const source of item.sources) {
      const name = host(source.url);
      increment(sourceHosts, name);
      if (name === "invalid") issues.push(`${item.id}: invalid source URL ${source.url}`);
      if (source.sourceType === "exchange" && KNOWN_THIRD_PARTY_HOSTS.has(name)) {
        warnings.push(`${item.id}: sourceType=exchange but host=${name}; reclassify or replace with official exchange URL`);
      }
    }
    if (item.sources.length === 0) issues.push(`${item.id}: source missing`);
    if (item.researchConfidence === "low" && item.score >= 16) warnings.push(`${item.id}: high score but low research confidence`);
    if (item.category === "accounting_fraud" && item.scores.accountingIntegrity !== 0) {
      issues.push(`${item.id}: accounting_fraud requires accountingIntegrity=0`);
    }
    if (item.category === "accounting_fraud" && item.score >= 12) issues.push(`${item.id}: accounting fraud must not score >=12`);
    if (item.scores.accountingIntegrity === 0 && item.score >= 12) issues.push(`${item.id}: accountingIntegrity=0 must not score >=12`);
    if (item.outcome?.recoveryPattern === "failed" && item.score >= 16) warnings.push(`${item.id}: failed outcome despite historical score ${item.score}; calibration candidate`);
  }

  for (const contextId of historicalContext.keys()) {
    if (!ids.has(contextId)) issues.push(`historical context orphan id: ${contextId}`);
  }

  const requiredCategories = [
    "executive_relationship",
    "personal_behavior",
    "personal_crime",
    "employee_sabotage",
    "customer_sabotage",
    "organizational_governance",
    "systemic_misconduct",
    "accounting_fraud",
    "quality_falsification",
    "product_safety",
    "improper_sales",
  ];
  for (const category of requiredCategories) {
    if (!categories.has(category)) issues.push(`required category missing: ${category}`);
  }

  const topCountry = [...countries.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCountry && topCountry[1] / cases.length > 0.6) {
    warnings.push(`country concentration: ${topCountry[0]} is ${Math.round((topCountry[1] / cases.length) * 100)}% of cases`);
  }
  const recentCases = (eras.get("last_0_2y") ?? 0) + (eras.get("last_3_5y") ?? 0);
  if (recentCases / cases.length < 0.4) {
    warnings.push(`era staleness: only ${recentCases}/${cases.length} cases are within 5 years`);
  }
  const knownOutcomes = cases.length - (outcomes.get("unknown") ?? 0);
  if (knownOutcomes < cases.length * 0.7) {
    warnings.push(`outcome coverage low: known ${knownOutcomes}/${cases.length}`);
  }
  const successLike = (outcomes.get("fast") ?? 0) + (outcomes.get("gradual") ?? 0);
  const failed = outcomes.get("failed") ?? 0;
  if (failed > 0 && successLike / failed >= 4) {
    warnings.push(`outcome imbalance: success-like ${successLike} vs failed ${failed}; avoid survivorship bias`);
  }
  for (const [company, count] of companies) {
    if (count >= 3) warnings.push(`company concentration: ${company} appears ${count} times`);
  }
  for (const category of requiredCategories) {
    const countriesForCategory = new Set(
      cases.filter(item => item.category === category).map(item => item.country),
    );
    if (countriesForCategory.size < 2 && (categories.get(category) ?? 0) >= 2) {
      warnings.push(`country-category concentration: ${category} has ${categories.get(category)} cases but only ${countriesForCategory.size} country`);
    }
  }

  const contextCoveragePct = cases.length === 0 ? 0 : (historicalContext.size / cases.length) * 100;
  if (contextCoveragePct < 50) {
    warnings.push(`historical context coverage low: ${historicalContext.size}/${cases.length} (${contextCoveragePct.toFixed(1)}%); enrich verified sidecar gradually`);
  }
  for (const [category, count] of categories) {
    if (shockCategoryJurisdictionSensitivity(category) !== "high" || count < 2) continue;
    const covered = contextByCategory.get(category) ?? 0;
    if (covered / count < 0.5) {
      warnings.push(`context coverage low for jurisdiction-sensitive category ${category}: ${covered}/${count}`);
    }
  }

  const summary = {
    generatedAt: date,
    minimumHistoricalCases: MIN_HISTORICAL_CASES,
    totalCases: cases.length,
    historicalContextCases: historicalContext.size,
    historicalContextCoveragePct: Number(contextCoveragePct.toFixed(1)),
    contextByCategory: sortedObject(contextByCategory),
    scoreBuckets: {
      researchPriority16to20: cases.filter(item => item.score >= 16).length,
      watch12to15: cases.filter(item => item.score >= 12 && item.score < 16).length,
      caution8to11: cases.filter(item => item.score >= 8 && item.score < 12).length,
      avoid0to7: cases.filter(item => item.score < 8).length,
    },
    confidence,
    categories: sortedObject(categories),
    countries: sortedObject(countries),
    eras: sortedObject(eras),
    outcomes: sortedObject(outcomes),
    categoryCountryCoverage: sortedObject(categoryCountry),
    companies: sortedObject(companies),
    sourceHosts: sortedObject(sourceHosts),
    issues,
    warnings,
    ok: issues.length === 0,
  };

  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/idiosyncratic_shock_history_audit_latest.json", JSON.stringify(summary, null, 2), "utf-8");
  const md = [
    "# 企業固有ショック 過去事例DB監査",
    "",
    `生成日: ${date}`,
    `- total: ${cases.length} / minimum ${MIN_HISTORICAL_CASES}`,
    `- context sidecar: ${historicalContext.size}/${cases.length} (${contextCoveragePct.toFixed(1)}%)`,
    `- high confidence: ${confidence.high}`,
    `- medium confidence: ${confidence.medium}`,
    `- low confidence: ${confidence.low}`,
    `- RESULT: ${summary.ok ? "OK" : "NG"}`,
    "",
    "## score buckets",
    "",
    `- 16-20: ${summary.scoreBuckets.researchPriority16to20}`,
    `- 12-15: ${summary.scoreBuckets.watch12to15}`,
    `- 8-11: ${summary.scoreBuckets.caution8to11}`,
    `- 0-7: ${summary.scoreBuckets.avoid0to7}`,
    "",
    "## dataset bias / context checks",
    "",
    `- countries: ${JSON.stringify(summary.countries)}`,
    `- eras: ${JSON.stringify(summary.eras)}`,
    `- outcomes: ${JSON.stringify(summary.outcomes)}`,
    `- context by category: ${JSON.stringify(summary.contextByCategory)}`,
    "",
    "## issues",
    "",
    ...(issues.length ? issues.map(value => `- ${value}`) : ["- none"]),
    "",
    "## warnings / calibration candidates",
    "",
    ...(warnings.length ? warnings.map(value => `- ${value}`) : ["- none"]),
  ].join("\n");
  writeFileSync("reports/idiosyncratic_shock_history_audit_latest.md", md, "utf-8");

  console.log(`shock history audit: cases=${cases.length} context=${historicalContext.size} issues=${issues.length} warnings=${warnings.length}`);
  if (issues.length > 0) process.exitCode = 1;
}

main();
